# 控制台 Web（改键 + LED）：可行性与执行计划

对照 [ZMK Studio](https://github.com/zmkfirmware/zmk-studio) 的实现，评估将**实时改键**与**LED 控灯**整合为同一套 **React + TypeScript** Web 应用的可行性，并给出固件验收、工程脚手架与分阶段交付计划。

> 目标能力：一个网页里完成灯效控制 + 运行时改键（不重新刷固件即可分配 behavior/HID usage，立即生效，可持久化）。

---

## 结论（先看这个）

| 判断 | 说明 |
|------|------|
| **可行** | Planckeys 是 ZMK 键盘，官方已有完整「Studio RPC」运行时改键栈；左板已部分开启相关配置 |
| **不能直接改现有 LED 协议** | 现有 `tools/led-web` 走 Raw HID `0xFF60`（`0xA1–0xA4`），只控灯；Studio 走 **USB CDC + protobuf RPC**，两条通道完全独立 |
| **前端形态** | 以 **React + TypeScript + Vite** 新建统一控制台（建议目录 `tools/console`），迁入现有 LED 逻辑，并接入 Studio RPC；废弃「三文件静态页」作为主形态 |
| **推荐路径** | **先修好固件侧 Studio** → 脚手架 React 工程 → WebHID（灯）+ Web Serial（键）同页并存 |
| **不推荐** | 在 Raw HID 上自研 keymap RPC；或继续在无构建的 `app.js` 上堆功能 |

对等改键的本质不是「增强 LED 协议」，而是：**在同一 React 应用里再接一条 Studio RPC 传输**。系统化 Web 构建见下文「五、Web 系统化构建方案」。

---

## 一、ZMK Studio 如何实现实时改键

### 1.1 相关仓库

| 仓库 | 作用 |
|------|------|
| [zmkfirmware/zmk-studio](https://github.com/zmkfirmware/zmk-studio) | UI（React + Vite + Tauri） |
| [zmkfirmware/zmk-studio-ts-client](https://github.com/zmkfirmware/zmk-studio-ts-client) | TS 客户端：framing + protobuf RPC |
| [zmkfirmware/zmk-studio-messages](https://github.com/zmkfirmware/zmk-studio-messages) | protobuf 定义 |
| [zmkfirmware/zmk](https://github.com/zmkfirmware/zmk) `app/src/studio/` | 固件侧 RPC 子系统 |

官方能力说明见 [ZMK Studio 文档](https://zmk.dev/docs/features/studio)。

### 1.2 架构

```
┌────────────────────────────────────────────────────────────┐
│  Studio UI / 自建 Web UI                                    │
│  call_rpc() → @zmkfirmware/zmk-studio-ts-client             │
│  Request.encode → framing(0xAB…0xAD) → RpcTransport         │
└───────────────┬────────────────────────────┬───────────────┘
                │ USB Serial (CDC ACM)       │ BLE GATT
                ▼                            ▼
┌────────────────────────────────────────────────────────────┐
│  ZMK firmware (CONFIG_ZMK_STUDIO)                           │
│  core | behaviors | keymap 子系统                           │
│  setLayerBinding → RAM 立即生效；saveChanges → settings 持久化 │
└────────────────────────────────────────────────────────────┘
```

浏览器侧：Chrome/Edge 可用 **Web Serial**；BLE 在网页端限制较多（Linux Web 才较完整），桌面端用 Tauri 原生串口/BLE。

### 1.3 改键端到端流程

1. **连接**：选 Serial/BLE → `create_rpc_connection` → `core.getDeviceInfo`
2. **解锁**（若开启 locking）：`core.getLockState`；需 keymap 里 `&studio_unlock`（或 combo）
3. **加载**：`keymap.getPhysicalLayouts` + `keymap.getKeymap` + `behaviors.listAllBehaviors` / `getBehaviorDetails`
4. **实时改键**：`keymap.setLayerBinding({ layerId, keyPosition, binding })`  
   - `binding = { behaviorId, param1, param2 }`  
   - 固件调用 `zmk_keymap_set_layer_binding_at_idx()`，**立刻影响当前输入**
5. **持久化**：`keymap.saveChanges` 写入 settings；`discardChanges` 丢弃；未保存断电会丢

### 1.4 协议要点（复现所需最小集）

| 层 | 内容 |
|----|------|
| Framing | `0xAB` SoF / `0xAC` Escape / `0xAD` EoF |
| 消息 | protobuf `Request` / `Response`（subsystem: core / behaviors / keymap） |
| 改键 API | `keymap.setLayerBinding`（实时）+ `saveChanges` / `discardChanges` |
| 目录 API | `listAllBehaviors` + `getBehaviorDetails`（无独立 keycode 列表；HID 名表在 UI 静态 JSON） |
| 安全 | 多数 keymap API 为 SECURED；本仓库左板 `CONFIG_ZMK_STUDIO_LOCKING=n`，可简化解锁流程 |

### 1.5 Studio 自身边界（led-web 对齐时也适用）

- 只能分配**固件已编译进镜像**的 behavior，不能在网页里「新建」behavior
- 层数不能超过 DT 声明（可用 `status = "reserved"` 预留空层）
- 暂无 combos / 宏高级编辑 / keymap 导入导出（官方计划中或未排期）
- Studio 改过 settings 后，再刷 `.keymap` 可能被 settings 覆盖，需 UI 内「Restore Stock」

---

## 二、当前 planckeys / led-web 现状

### 2.1 项目类型

ZMK **user-config**（非 QMK）。左右板已拆成独立键盘；键位在：

- `config/planck_left.keymap` / `config/planck_right.keymap`（编译期静态 bindings）
- `config/planck_left.json` / `planck_right.json`（keymap-editor 布局元数据，非运行时）

### 2.2 现有主机通道（只做 LED）

```
A. led-web:      Browser → WebHID → Raw HID 0xFF60 → src/led_control.c
B. codex-bridge: Hooks → node-hid → 同一条 Raw HID → LED

C. ZMK Studio（若正确编入）:
   Studio App → USB CDC protobuf RPC → ZMK keymap runtime
   （与 A/B 无关；本仓库尚未自建 Studio 客户端）
```

`tools/led-web` 能力：预设灯效、亮度/速度、28 颗逐颗 RGB、点阵字模等。**无任何 keymap 读写。**

协议：`0xA1` CONFIG / `0xA2` PIXELS / `0xA3` BRIGHTNESS / `0xA4` FILL。详见 [`led-web-control.md`](./led-web-control.md)。

### 2.3 固件侧 Studio 准备度

| 项 | 状态 | 说明 |
|----|------|------|
| `CONFIG_ZMK_STUDIO=y` | 已开（左板） | `planck_left_defconfig` |
| `CONFIG_ZMK_STUDIO_LOCKING=n` | 已关 | 可跳过 unlock 门控（仍建议后续按需打开） |
| `studio-rpc-usb-uart` snippet | **可能未生效** | `build.yaml` 中 `planck_left` 写了两个 `snippet:` 键，YAML 只保留后者 `nrf52840-nosd` |
| physical layout `keys` | 已有 | Studio 渲染键位所需 |
| `&studio_unlock` | 未加 | locking 关闭时非必须；若日后开 locking 需补 |
| reserved 空层 | 未加 | 想在 Studio 里加层时再补 |
| 右板 Studio | 未开 | 右板若也要网页改键需对称配置 |
| 自研 Raw HID 改键 | 无 | — |

`build.yaml` 当前写法（问题已在 [`led-web-control.md`](./led-web-control.md) 记录）：

```yaml
- board: planck_left
  snippet: studio-rpc-usb-uart   # 会被下一项覆盖
  snippet: nrf52840-nosd         # 实际生效
```

正确写法需让**两个** snippet 同时生效（具体语法以当前 ZMK user-config / build 工作流为准，常见为列表或多值形式，需对照官方示例与本仓库 CI 验证）。

### 2.4 与「对等改键」的差距

| 能力 | Studio 官方 | 当前 led-web | 缺口 |
|------|-------------|--------------|------|
| 读 keymap / layers | RPC | 无 | 需 Studio RPC |
| 写单键 binding（实时） | `setLayerBinding` | 无 | 同上 |
| behavior 目录与参数 | RPC + 静态 HID 表 | 无 | 同上 |
| 保存 / 丢弃 | `saveChanges` 等 | 无 | 同上 |
| 物理布局渲染 | `getPhysicalLayouts` | 有轴灯格子，但非 keymap 布局 | 可复用视觉，需接布局数据 |
| 传输 | Web Serial / BLE | WebHID（LED） | 需新增 Serial 连接 |
| 持久化 | ZMK settings | LED 也未做断电记忆 | 改键走官方 settings |

---

## 三、方案对比

### 方案 A：只修固件，继续用官方 Studio / zmk.studio

| | |
|--|--|
| 做法 | 修 `build.yaml` snippet → 刷左板 → 用 [https://zmk.studio/](https://zmk.studio/) 或桌面 App 改键 |
| 优点 | 最快验证「实时改键」是否在本硬件上可用；零前端开发 |
| 缺点 | **不满足**「在 led-web 里改键」；控灯与改键分裂为两个网页/App |
| 定位 | **必做的前置验收**（任何自建 UI 都依赖此通道先通） |

### 方案 B（推荐）：led-web 接入官方 Studio RPC（Web Serial）

| | |
|--|--|
| 做法 | 固件同方案 A；前端引入 `@zmkfirmware/zmk-studio-ts-client`，用 Web Serial 做 transport；在 led-web 增加「键位」页 |
| 优点 | 与官方协议兼容；可复用 protobuf/framing；控灯（WebHID）与改键（Web Serial）同页；工作量可控 |
| 缺点 | 浏览器需同时授权 Serial + HID；页面从静态单文件走向带构建的前端；Studio 能力边界继承官方 |
| 定位 | **达成用户目标的主路径** |

架构目标：

```
tools/led-web (增强后)
├── WebHID  ──→ Raw HID 0xFF60 ──→ LED（现有）
└── Web Serial ──→ CDC RPC ──→ keymap（新增，对齐 Studio）
```

### 方案 C：在 Raw HID 上自研 keymap 协议

| | |
|--|--|
| 做法 | 扩展 `0xA5+` opcode 或新 HID 接口，固件实现读/写 binding + 持久化 |
| 优点 | 单连接（只 WebHID）；可与 LED 同一会话 |
| 缺点 | 需在固件重做 Studio 子系统子集（校验、settings、behavior 元数据、层管理）；与官方工具不互通；USB 端点/固件复杂度风险高 |
| 定位 | **不推荐**，除非官方 Studio 在本硬件上证实不可用且无法修复 |

### 方案 D：codex-bridge 转发 Studio RPC

| | |
|--|--|
| 做法 | Node 侧开串口代理，网页走 WebSocket |
| 优点 | 可绕过部分浏览器权限限制；与现有 bridge 运维模型接近 |
| 缺点 | 多一层守护进程；对「纯静态 led-web」体验更重 |
| 定位 | 仅当 Web Serial 权限/稳定性不够时的备选 |

---

## 四、可行性结论

1. **硬件/固件基础：高**  
   左板已有 physical layout、`CONFIG_ZMK_STUDIO`，nRF52840 + ZMK main 是 Studio 支持的组合。主要风险是 **snippet 未真正编入** 以及 **Studio CDC + Raw HID 第二接口争抢 USB 端点**（文档已提示，见 [`led-web-control.md`](./led-web-control.md)）。

2. **协议复用：高**  
   不必自研 protobuf；直接依赖官方 ts-client 即可获得 framing + RPC。

3. **Web 工程化：必须做**  
   今日 `tools/led-web` 是无构建的静态三文件，无法承载 React 改键 UI、类型化协议与双通道状态。目标改为 `tools/console`（React + TS + Vite），见第五节。

4. **双通道并存：中高（需真机验证）**  
   WebHID（灯）+ Web Serial（键）在 Chrome 上技术上可行；固件侧 CDC+HID 枚举需真机确认。若枚举失败，优先保证改键通道或临时关掉其一做对照实验。

5. **右板：独立工作项**  
   右板未开 Studio；若要「整机」网页改键，需对称启用并单独连接右板设备。

---

## 五、Web 系统化构建方案（React + TypeScript）

> 当前仓库**没有**可复用的前端脚手架（`tools/led-web` 为静态页；`tools/codex-bridge` 是 Node CLI）。整合改键 + LED 时，按本节新建应用，而不是在 `app.js` 上渐进打补丁。

### 5.1 目标与边界

| 项 | 选择 |
|----|------|
| 目录 | `tools/console/`（新建；名称表示「键盘控制台」而非仅 LED） |
| 栈 | React 18 + TypeScript 5 + Vite 5/6（与 [zmk-studio](https://github.com/zmkfirmware/zmk-studio) 同族，便于对照） |
| 包管理 | npm（与 `codex-bridge` 一致；仓库根不强制 monorepo） |
| 样式 | 先 CSS Modules 或单文件全局 CSS 迁入即可；不强制 Tailwind（Studio 用 Tailwind，本项目可更轻） |
| 路由 | 轻量：顶栏 Tab（`灯效` / `键位`）即可，初期可不引入 react-router |
| 部署 | `vite build` → 静态资源；本地 `vite` / `vite preview`；可选 GitHub Pages |
| 不做（首期） | Tauri 桌面壳、Storybook、BLE 改键、与 codex-bridge 进程耦合 |

旧路径 `tools/led-web/`：Phase W1 迁完功能后保留为只读参考或加 README 指向 `console`，避免两套 UI 并行演进。

### 5.2 推荐目录结构

```text
tools/console/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html
├── .gitignore          # node_modules / dist（可复用仓库根 ignore）
├── README.md           # 开发/构建/浏览器权限说明
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── vite-env.d.ts
    ├── styles/
    │   └── global.css              # 从 led-web/styles.css 迁入并整理
    ├── device/                     # 与键盘的传输层（无 UI）
    │   ├── hid/
    │   │   ├── types.ts
    │   │   ├── protocol.ts         # 0xA1–0xA4，对齐 codex-bridge/protocol.ts
    │   │   └── ledDevice.ts        # WebHID open/send/close
    │   ├── studio/
    │   │   ├── connection.ts       # Web Serial + zmk-studio-ts-client
    │   │   └── rpc.ts              # getKeymap / setLayerBinding / save…
    │   └── browser.ts              # 检测 WebHID / Web Serial 可用性
    ├── led/                        # 灯效领域
    │   ├── constants.ts            # LED_COUNT、AXIS_LAYOUT、字模等
    │   ├── color.ts
    │   ├── schemes.ts
    │   ├── glyphs.ts               # 点阵字模（可从 led-web / bridge 抽）
    │   ├── LedPage.tsx
    │   └── components/
    │       ├── AxisGrid.tsx
    │       ├── UnderGrid.tsx
    │       ├── PresetBar.tsx
    │       └── DigitCarousel.tsx
    ├── keymap/                     # 改键领域
    │   ├── KeymapPage.tsx
    │   ├── bindingLabels.ts        # behavior/param 显示名
    │   └── components/
    │       ├── PhysicalKeyboard.tsx
    │       ├── LayerTabs.tsx
    │       ├── BindingPicker.tsx
    │       └── SaveBar.tsx
    ├── shared/
    │   ├── components/
    │   │   ├── AppShell.tsx        # 顶栏、双连接状态、Tab
    │   │   ├── ConnectBar.tsx
    │   │   └── LogPanel.tsx
    │   └── hooks/
    │       ├── useLedDevice.ts
    │       └── useStudioDevice.ts
    └── data/                       # 静态表（可选）
        └── hid-usage/              # 若不用 Studio 自带表，可放精简 keycode 名
```

原则：**device 层零 React**；页面只依赖 hooks；LED 与 keymap 互不 import 对方实现，只共享 `AppShell` / 连接状态展示。

### 5.3 依赖清单（首期）

```json
{
  "name": "planckeys-console",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@zmkfirmware/zmk-studio-ts-client": "^0.0.18"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/w3c-web-hid": "^1.0.6",
    "@types/w3c-web-serial": "^1.0.6",
    "@vitejs/plugin-react-swc": "^3.7.1",
    "typescript": "^5.7.2",
    "vite": "^5.4.11",
    "eslint": "^9.15.0",
    "typescript-eslint": "^8.15.0"
  },
  "engines": {
    "node": ">=18"
  }
}
```

说明：

- `@zmkfirmware/zmk-studio-ts-client`：改键 RPC / framing；版本随官方升级回归。
- `@types/w3c-web-hid` / `@types/w3c-web-serial`：浏览器 API 类型。
- 状态：首期用 React `useState` / `useReducer` 即可；若改键 undo 变复杂再引入 `immer`（Studio 同款），**不必**首期上 Redux。
- 与 `codex-bridge`：**协议常量应对齐**（可复制 `protocol.ts` 到 `device/hid/protocol.ts`，或日后抽 `tools/shared/`）；运行时互不依赖。

### 5.4 Vite / TS 最小配置要点

`vite.config.ts`：

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  base: "./", // 便于 file:// 或任意子路径静态托管
  server: {
    port: 5173,
    // WebHID/Serial 需安全上下文：localhost 已满足
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
```

`tsconfig.json` 建议：`strict: true`、`jsx: "react-jsx"`、`moduleResolution: "bundler"`、`noEmit` 由 `tsc -b` + vite 分工。

`src/vite-env.d.ts`：

```ts
/// <reference types="vite/client" />
/// <reference types="@types/w3c-web-hid" />
/// <reference types="@types/w3c-web-serial" />
```

### 5.5 应用信息架构

```text
┌─────────────────────────────────────────────────────────┐
│  AppShell                                                │
│  [灯效] [键位]     HID: 已连接/未连接   Studio: …        │
│  [连接 HID] [连接 Studio]  （可分别操作）                  │
├─────────────────────────────────────────────────────────┤
│  Tab=灯效 → LedPage（迁自 tools/led-web）                │
│  Tab=键位 → KeymapPage（Studio RPC UI）                  │
└─────────────────────────────────────────────────────────┘
         │ WebHID 0xFF60              │ Web Serial CDC
         ▼                            ▼
    LED firmware                 ZMK Studio RPC
```

连接策略：

- 两个按钮、两套状态机；一侧失败不自动断开另一侧。
- 首次手势必须由用户点击触发 `requestDevice` / `requestPort`（浏览器安全限制）。
- 可选：记住上次选择的设备 filter（vendor/product 若稳定），降低重复点选成本。

### 5.6 从 `tools/led-web` 迁移清单

| 现有文件 | 迁入位置 | 注意 |
|----------|----------|------|
| `app.js` 协议常量与组包 | `device/hid/protocol.ts` + `ledDevice.ts` | 与固件 / codex-bridge 三方对齐 |
| `AXIS_LAYOUT` / 字模 / 配色 | `led/constants.ts` 等 | 保持数值不变，先行为回归再重构 |
| DOM 拼格子逻辑 | `AxisGrid.tsx` / `UnderGrid.tsx` | 改为 props + state |
| `styles.css` | `styles/global.css` | 类名可暂留，避免视觉回归 |
| `index.html` | Vite 根 `index.html` + `#root` | 去掉直接挂 `app.js` |

迁移顺序建议：**先脚手架空壳 → 迁 LED 并回归 → 再加 keymap Tab**，避免双通道与 UI 重写同时翻车。

### 5.7 改键模块（与设备层接口）

```ts
// device/studio/rpc.ts 对外能力（示意）
export type StudioClient = {
  getDeviceInfo(): Promise<DeviceInfo>;
  getKeymap(): Promise<Keymap>;
  getPhysicalLayouts(): Promise<PhysicalLayouts>;
  listBehaviors(): Promise<BehaviorDetails[]>;
  setLayerBinding(args: SetBindingArgs): Promise<SetBindingResult>;
  saveChanges(): Promise<void>;
  discardChanges(): Promise<void>;
  onUnsavedChanged(cb: (unsaved: boolean) => void): () => void;
  close(): Promise<void>;
};
```

底层仍调用官方：

```ts
import { create_rpc_connection, call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
```

UI 禁止直接 `call_rpc`，以便单测与日后换 bridge 代理（方案 D）。

### 5.8 本地开发与产物

| 命令 | 作用 |
|------|------|
| `npm install` | 装依赖（在 `tools/console`） |
| `npm run dev` | http://localhost:5173 ，热更新 |
| `npm run build` | 产出 `tools/console/dist/` |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | CI 可调用 |

浏览器：**Chrome / Edge**；需 HTTPS 或 `localhost`。macOS/Linux 串口权限按系统要求配置（与官方 Studio 相同）。

仓库根 `.gitignore` 已含 `node_modules/`、`dist/`，一般无需再改。

### 5.9 与 CI / 文档的衔接（建议）

- **不必**把前端编进 ZMK firmware CI；可选新增 workflow：`tools/console/**` 变更时跑 `npm ci && npm run typecheck && npm run build`。
- `docs/README.md` / `led-web-control.md`：在落地后把「打开 `tools/led-web/index.html`」改为「`cd tools/console && npm run dev`」。
- `tools/console/README.md`：写清双连接步骤、设备名 `PlanckKeys L`、usage page `0xFF60`、Serial 选 CDC 口。

### 5.10 明确不做的范围（避免范围膨胀）

- 不 fork 整个 zmk-studio 仓库（只复用 ts-client + 自绘精简 UI）。
- 首期不做 encoder 绑定、combo 编辑、keymap 导入导出。
- 不把 codex-bridge 的 hooks/蛇游戏塞进 console（bridge 继续独立）；若共享字模，只抽常量文件。

---

## 六、推荐执行计划

### Phase 0 — 固件 Studio 通道验收（1–2 天，阻塞项）

目标：确认左板能被官方 Studio 改键。

1. 修复 `build.yaml`：`planck_left` 同时应用 `studio-rpc-usb-uart` 与 `nrf52840-nosd`。
2. CI/本地构建，确认镜像含 Studio RPC（日志/USB 出现 CDC ACM 串口）。
3. 刷左板，USB 连接，用 [zmk.studio](https://zmk.studio/)：
   - 能连上、读到 physical layout 与 keymap
   - `setLayerBinding` 即时生效（例如临时改一个字母键）
   - `saveChanges` 后断电仍保留；`discard` / Restore Stock 行为符合预期
4. **对照实验**：Studio 开启时 WebHID 控灯是否仍正常；若 USB 异常，记录现象，决定端点取舍（见风险节）。
5. （可选）keymap 增加 1–2 个 `reserved` 空层，便于日后加层。

验收标准：官方 Studio 完成一次「改键 → 立即输入变化 → 保存 → 复现」。

### Phase W1 — React 控制台脚手架 + LED 迁移（2–3 天）

目标：`tools/console` 可 `npm run dev`，LED 功能与旧 `led-web` 对等。

1. 按第五节初始化 Vite React-TS 工程与依赖。
2. 迁入 HID protocol / 布局常量 / 灯效页；双连接栏先只做 HID。
3. 真机回归：预设、逐颗 RGB、配色、点阵轮播。
4. 写 `tools/console/README.md`；旧 `led-web` 顶部注明迁移去向。

验收标准：不再依赖打开静态 `led-web/index.html` 即可控灯。

### Phase W2 — 键位 Tab MVP（3–5 天）

目标：同一 React 应用内完成与 Studio「单键实时分配」对等的最小闭环。

1. `device/studio/*`：Web Serial + ts-client 封装。
2. `KeymapPage`：physical layout、层切换、点键改 `&kp`、Save/Discard、unsaved 指示。
3. AppShell 展示 HID / Studio 双状态。
4. 验收：不打开 zmk.studio，仅用 console 改键并保存；LED Tab 仍可用。

### Phase W3 — 体验对齐（按需，约 1 周）

- Behavior 参数：`hidUsage` / `layerId` / `range` / `constant`（至少 `&mo`、`&kp`、`&bt`、`&led_next`）
- Undo；层重命名 / reserved 层；断线重连；错误文案
- （可选）前端 CI workflow

### Phase W4 — 整机与运维（可选）

- 右板 Studio + 会话切换 L/R
- locking / `&studio_unlock`；文档约定与 `.keymap` / Restore Stock
- Web Serial 不稳时评估 bridge 代理（方案 D）

---

## 七、Studio RPC 实现要点（W2 技术草图）

### 7.1 连接伪代码

```ts
import { create_rpc_connection, call_rpc } from "@zmkfirmware/zmk-studio-ts-client";
// transport：官方包内 Web Serial 实现，或自封装 writable/readable 字节流

const port = await navigator.serial.requestPort();
await port.open({ baudRate: 12500 }); // 与 Studio Web 侧一致，以 ts-client 为准
const conn = create_rpc_connection(/* serial transport from port */);

await call_rpc(conn, { core: { getDeviceInfo: true } });
const keymap = await call_rpc(conn, { keymap: { getKeymap: true } });

await call_rpc(conn, {
  keymap: {
    setLayerBinding: {
      layerId,
      keyPosition,
      binding: { behaviorId, param1, param2 },
    },
  },
});
await call_rpc(conn, { keymap: { saveChanges: true } });
```

### 7.2 UI 状态机（建议）

```
disconnected → connecting → ready
ready → editing (local draft + RPC applied)
editing → unsaved | saved
任意态 → error / reconnect
```

HID（灯）与 Serial（键）连接状态应**分开显示**，避免一个失败拖垮另一个。

### 7.3 与现有轴灯布局的关系

`AXIS_LAYOUT`（灯珠下标）≠ keymap `keyPosition`（矩阵位置）。  
改键 UI 必须以 `getPhysicalLayouts` / DT `keys` 顺序为准；灯珠高亮若要做「按下反馈」可另建 position↔LED index 映射表，不要混用。

### 7.4 自定义 behavior（`&led_next`）

Studio 只能看到固件编入的 behavior。启用 `studio-rpc-usb-uart` 后默认 `ZMK_BEHAVIORS_KEEP_ALL`，标准 behavior 较全；**自研** `planckeys,behavior-led-next` 只要已链入固件且带 metadata（若上游要求），应出现在 `listAllBehaviors` 中——W2 验收时专门测一次「把某键设为 `&led_next`」。

---

## 八、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `build.yaml` snippet 未修好 | Studio 根本连不上 | Phase 0 强制验收；对照 USB 设备列表是否有串口 |
| CDC + Raw HID USB 端点不够 | 控灯或改键之一失效 | 真机矩阵测试；必要时提供「仅 Studio」/「仅 LED」构建变体 |
| RAM 增大导致构建失败 | Studio 固件编不过 | 裁剪 behavior（`ZMK_BEHAVIORS_OMIT_*`）、查 ZMK Studio 内存调优文档 |
| settings 与 `.keymap` 冲突 | 刷固件后键位「不更新」 | 文档明确：用 Studio 后以 Restore Stock 或接受 settings 为准 |
| Web Serial 权限/兼容 | 部分浏览器不可用 | 限定 Chrome/Edge；备选官方桌面 App 或 bridge |
| 跟 `zmk` main | API/行为漂移 | `west.yml` 适时 pin；升级时回归 Phase 0 |
| 静态 led-web 与 console 双轨 | 行为不一致 | W1 完成后冻结 led-web，文档只指向 console |
| ts-client API 变动 | 改键页编译失败 | 锁 package 版本；升级时跑 W2 验收 |

---

## 九、工作量粗估

| 阶段 | 预估 | 产出 |
|------|------|------|
| Phase 0 | 1–2 天 | 固件可被官方 Studio 改键；USB 并存结论 |
| Phase W1 | 2–3 天 | `tools/console` React 工程 + LED 迁移完成 |
| Phase W2 | 3–5 天 | 同应用内 MVP 实时改键 + 保存 |
| Phase W3 | ~5 天 | 体验接近日常 Studio 用法 |
| Phase W4 | 按需 | 右板、locking、文档与代理 |

合计到达「统一控制台可用的对等改键」：大约 **1.5–2 周**（含固件验收与 LED 迁移），前提是 Phase 0 USB 并存无重大硬件阻塞。

---

## 十、建议的下一步（立即）

1. 修 `build.yaml` 的双重 `snippet`，触发构建并刷左板（Phase 0）。  
2. 用官方 [zmk.studio](https://zmk.studio/) 验收改键；同时确认旧 led-web 控灯仍可用。  
3. 初始化 `tools/console`（Phase W1 脚手架），迁 LED；再接入 Studio（W2）。  

未通过 Phase 0 前，不要在 Raw HID 上扩展 keymap 协议；未完成 W1 前，不要在静态 `led-web/app.js` 上堆改键 UI。

---

## 参考

- [zmkfirmware/zmk-studio](https://github.com/zmkfirmware/zmk-studio)（React + Vite + ts-client 参考实现）
- [ZMK Studio 功能说明](https://zmk.dev/docs/features/studio)
- 本仓库：[`led-web-control.md`](./led-web-control.md)、`tools/led-web/`、`tools/codex-bridge/`、`config/planck_left.keymap`、`build.yaml`
