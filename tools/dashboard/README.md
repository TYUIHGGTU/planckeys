# PlanckKeys 控制台（灯效 + 改键）

一个网页里同时完成：

- **灯效**：WebHID 直连 Raw HID `0xFF60`，轴灯/底灯独立预设、亮度速度、配色和逐颗 RGB。
- **改键**：Web Serial + [ZMK Studio RPC](https://zmk.dev/docs/features/studio)（`@zmkfirmware/zmk-studio-ts-client`），候选键点击或拖放后即时生效，并在 500ms 内自动保存到 settings。

灯（WebHID）与键（Web Serial）是**两条独立连接**，顶栏分别有连接按钮与状态，一侧失败不影响另一侧。

## 前置条件

- 浏览器：**Chrome / Edge**（需 WebHID + Web Serial），HTTPS 或 `localhost`。
- 固件（左板 `planck_left`）：
  - 控灯：`CONFIG_RAW_HID=y` + 自研 LED 模块（已就绪）。
  - 改键：`build.yaml` 需同时应用 `studio-rpc-usb-uart` 与 `nrf52840-nosd` snippet，且 `CONFIG_ZMK_STUDIO=y`。刷入后 USB 会多出一个 CDC 串口。

## 开发 / 构建

本包是 **pnpm monorepo**（根在 `tools/`）的一员，先在根 `pnpm install`：

```bash
cd tools && pnpm install                     # 一次性装好所有工作区包
pnpm --filter @planckeys/dashboard dev       # http://localhost:5173（根用 `pnpm dashboard` 亦可）
pnpm --filter @planckeys/dashboard build     # 产出 dist/（会先构建依赖 @planckeys/led-protocol）
pnpm --filter @planckeys/dashboard typecheck
pnpm --filter @planckeys/dashboard lint
```

> 工作区根 `tools/.npmrc` 把 `@zmkfirmware` 作用域指向 `registry.npmjs.org`（腾讯等镜像对该作用域会 403），其余依赖仍走你的默认 registry。

## 使用

1. 点顶栏「连接 HID」选择 `PlanckKeys L`，右栏可分别配置轴灯和底灯。
2. 点「连接 Studio」选择键盘的 CDC 串口；先在画布选键，再点击候选键，或把候选键直接拖到目标位置。修改即时生效并自动保存。
3. 候选区顶边可上下拖动；主题支持跟随系统、浅色和深色。

## 目录

```
src/
├── device/           # 传输层（零 React）
│   ├── hid/          # protocol.ts (0xA1–0xA5) + ledDevice.ts (WebHID)
│   ├── studio/       # connection.ts (Web Serial) + rpc.ts (Studio RPC 领域封装)
│   └── browser.ts    # WebHID / Web Serial 能力检测
├── led/              # 灯效领域：color/constants/schemes/glyphs + 灯珠组件
├── keymap/           # 改键领域：候选 binding、物理键盘、HID usages
├── workspace/        # 生产单页工作台、主题和可拖动布局
└── shared/           # 连接/日志组件 + hooks(useLedDevice/useStudioDevice)
```

原则：`device/` 层不含 React；工作台只通过 hooks 写设备。`device/hid/protocol.ts` 的线材协议核心复用工作区单源包 `@planckeys/led-protocol`（与固件 `src/led_control.c` 对齐），本地只额外保留 `AXIS_INDICES` 等布局解读常量。

## 现状与边界（MVP）

- 灯效：轴灯、底灯独立动画参数；配色、自定义色和逐颗控制即时写入。
- 改键：完整常用 USB HID 候选目录、点击/拖放分配、层切换、自动保存和高级参数编辑。
- 暂不做：encoder 绑定、combo / 宏编辑、keymap 导入导出、层增删改名、右板（右板未开 Studio）。这些属后续阶段（见 `docs/led-web-keymap-studio.md` W3/W4）。
