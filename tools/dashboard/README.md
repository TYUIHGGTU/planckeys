# PlanckKeys 控制台（灯效 + 改键）

一个网页里同时完成：

- **灯效**（`灯效` Tab）：WebHID 直连 Raw HID `0xFF60`，预设灯效 / 亮度速度 / 逐颗 RGB / 点阵数字。迁移自 `tools/led-web`。
- **改键**（`键位` Tab）：Web Serial + [ZMK Studio RPC](https://zmk.dev/docs/features/studio)（`@zmkfirmware/zmk-studio-ts-client`），运行时改单键 binding、即时生效、保存到 settings。

灯（WebHID）与键（Web Serial）是**两条独立连接**，顶栏分别有连接按钮与状态，一侧失败不影响另一侧。

## 前置条件

- 浏览器：**Chrome / Edge**（需 WebHID + Web Serial），HTTPS 或 `localhost`。
- 固件（左板 `planck_left`）：
  - 控灯：`CONFIG_RAW_HID=y` + 自研 LED 模块（已就绪）。
  - 改键：`build.yaml` 需同时应用 `studio-rpc-usb-uart` 与 `nrf52840-nosd` snippet，且 `CONFIG_ZMK_STUDIO=y`。刷入后 USB 会多出一个 CDC 串口。

## 开发 / 构建

```bash
cd tools/console
npm install        # @zmkfirmware 作用域走官方源（见 .npmrc）
npm run dev        # http://localhost:5173
npm run build      # 产出 dist/
npm run preview    # 预览生产构建
npm run typecheck  # 仅类型检查（CI 可用）
npm run lint       # eslint
```

> `.npmrc` 只把 `@zmkfirmware` 作用域指向 `registry.npmjs.org`（腾讯等镜像对该作用域会 403），其余依赖仍走你的默认 registry。

## 使用

1. **灯效**：点顶栏「连接 HID」→ 选 `PlanckKeys L`（usage page `0xFF60`）→ 选预设 / 配色 / 点格子逐颗上色。
2. **键位**：点顶栏「连接 Studio」→ 选键盘的 **CDC 串口** → 切层、点键改 behavior/参数（`应用` 即时生效）→ `保存` 写入 settings。

## 目录

```
src/
├── device/           # 传输层（零 React）
│   ├── hid/          # protocol.ts (0xA1–0xA4) + ledDevice.ts (WebHID)
│   ├── studio/       # connection.ts (Web Serial) + rpc.ts (Studio RPC 领域封装)
│   └── browser.ts    # WebHID / Web Serial 能力检测
├── led/              # 灯效领域：color/constants/schemes/glyphs + 组件
├── keymap/           # 改键领域：KeymapPage + 组件 + hidUsages
└── shared/           # AppShell / ConnectBar / LogPanel + hooks(useLedDevice/useStudioDevice) + log
```

原则：`device/` 层不含 React；页面只依赖 hooks；灯与键互不 import 对方实现，只共享 `AppShell` 与连接状态。协议常量与固件 `src/led_control.c`、`tools/codex-bridge/src/protocol.ts` 三方对齐。

## 现状与边界（MVP）

- 灯效：与旧 `tools/led-web` 功能对等。
- 改键：单键实时分配 + 保存/丢弃 + 层切换 + 未保存提示。`&kp` 参数提供少量常用键快捷填入，其余按数值/0x 输入。
- 暂不做：encoder 绑定、combo / 宏编辑、keymap 导入导出、层增删改名、右板（右板未开 Studio）。这些属后续阶段（见 `docs/led-web-keymap-studio.md` W3/W4）。
