# Planckeys 工具集（pnpm monorepo）

`tools/` 是一个 **pnpm workspace**，聚合与 Planckeys 键盘配套的 TypeScript 工具。仓库根是
ZMK 固件模块，与本工作区互不影响。

## 包

| 包 | 说明 |
| --- | --- |
| `@planckeys/keyboard-profile` | 键盘 LED/HID **profile**（几何、键→灯映射、设备匹配）；改键布局仍来自 Studio RPC。 |
| `@planckeys/led-protocol` | Raw HID **线材协议**（报文打包）；几何短期再导出自 keyboard-profile。 |
| `@planckeys/agent-bridge` | 常驻守护进程：hooks 被动收 agent 事件 + `node-hid` 驱动状态灯。 |
| `@planckeys/dashboard` | 网页控制台：WebHID 控灯 + Web Serial（ZMK Studio）实时改键。 |
| `@planckeys/desktop` | macOS 菜单栏 App：监管 agent-bridge + 内嵌 dashboard 控制台。 |

依赖关系：`led-protocol` → `keyboard-profile`；`agent-bridge` / `dashboard` 依赖二者；
`desktop` 以子进程 spawn `agent-bridge`、以窗口加载 `dashboard` 构建产物。

## 首次准备（只需一次）

```bash
cd tools
corepack pnpm install     # 或已装好 pnpm：pnpm install
pnpm -r build             # 拓扑构建全部包（首次或改了源码后）
```

> 未装 pnpm 时把下面命令里的 `pnpm` 换成 `corepack pnpm` 即可（Node 自带 corepack）。

## 启动各项目

所有命令都在 `tools/` 目录下执行。日常最常用的是**桌面 App**——它会自动托管 agent-bridge
并内嵌 dashboard，基本不用单独起其它项目。

| 想做什么 | 命令 | 说明 |
| --- | --- | --- |
| 一键全都要（推荐） | `pnpm desktop` | 启动菜单栏 App：自动拉起 agent-bridge + 托盘「打开控制台」即得灯效/改键界面 |
| 只跑状态灯守护进程 | `pnpm bridge` | 前台运行 agent-bridge（`Ctrl+C` 退出）；需 USB 接左板 |
| 守护进程离线自测 | `pnpm bridge:mock` | 无需真机/agent，打印每帧；有键盘则同时驱动 |
| 调试守护进程 | `pnpm --filter @planckeys/agent-bridge dev -- --no-hid --log debug` | 免构建源码直跑 + 详细日志；详见 `agent-bridge/README.md`「调试」 |
| 只开网页控制台（改键/控灯） | `pnpm dashboard` | 起 Vite 开发服务器 `http://localhost:5173`（Chrome/Edge 打开） |
| 装/卸 hooks | `pnpm --filter @planckeys/agent-bridge install-hooks[:codebuddy\|:workbuddy\|:claude\|:cursor]` | 见 `agent-bridge/README.md` |
| 整仓构建 / 检查 | `pnpm -r build` · `pnpm -r typecheck` · `pnpm -r --if-present lint` | 按依赖拓扑执行 |

调试时想同时把日志存一份：在命令末尾接 `2>&1 | tee bridge-debug.log`（文件落在当前目录，
属临时产物，可删）。

单独构建某个包（会连带先构建其依赖）：

```bash
pnpm --filter @planckeys/desktop build
pnpm --filter @planckeys/dashboard build
pnpm --filter @planckeys/agent-bridge build
```

## 说明

- 使用 **pnpm ≥ 10**（本仓 `packageManager` 锚定 pnpm 11）。未装 pnpm 时可用
  `corepack pnpm ...` 直接运行（Node 自带 corepack）。
- `pnpm-workspace.yaml` 的 `allowBuilds` 显式放行 `electron` / `node-hid` / `esbuild` /
  `@swc/core` / `protobufjs` 的构建脚本（pnpm 默认拦截）。
- `tools/.npmrc` 将 `@zmkfirmware` 作用域指向官方源（镜像对该作用域会 403）。
