# Planckeys Desktop（桌面 App）

把 Planckeys 的两块能力收进一个 **macOS 桌面 App**：

- **后台状态灯（agent-bridge）**：菜单栏常驻、开机自启，点托盘即可启停 / 调亮度 /
  装 hooks / 看日志——**告别每次手动 `npm start`**。
- **控制台窗口（dashboard）**：托盘「打开控制台（灯效 / 改键）」弹出完整的
  **灯效编辑 + 实时改键** 界面（复用 `tools/dashboard`，WebHID 控灯 + Web Serial 改键）。

> 集成方式：Electron 外壳**子进程监管** agent-bridge，**窗口内嵌** dashboard 的已构建产物；
> 目前**不改动** `agent-bridge` / `dashboard` 两个工程本身。仍待做：把控灯 HID 收拢到主进程做
> 统一仲裁（见「路线图」）。

## 工作原理

```text
桌面 App (Electron 主进程)
  ├─ 托盘菜单 / 日志窗口 / 开机自启 (login item)
  ├─ spawn `node dist/index.js`      ->  agent-bridge 守护进程
  │                                      (unix socket 收 hook 事件 + node-hid 驱动状态灯)
  └─ BrowserWindow 加载 dashboard/dist ->  控制台（WebHID 控灯 + Web Serial 改键）
        └─ 主进程放行 select-hid-device / select-serial-port 权限
```

- 后台状态灯：App 只负责**编排**（启停/重启/崩溃退避/汇聚日志/透传 `CODEX_BRIDGE_*` 配置），
  收事件与驱动灯仍由 agent-bridge 完成，逻辑零改动。
- 控制台：窗口加载 dashboard 的静态产物；Electron 默认要求原生设备选择器回调，App 已自动
  挑中 `Planckeys` HID 与 ZMK 串口，体验接近网页版。

## 前置条件

- macOS + Node.js ≥ 18；本工具集为 **pnpm monorepo**（根在 `tools/`）。
- 在 **`tools/` 根**一次性安装并构建全部工作区包（拓扑有序：`@planckeys/led-protocol` →
  agent-bridge / dashboard → desktop）：

```bash
cd tools
pnpm install       # 首次会构建 electron/node-hid/esbuild/@swc/core（已在 pnpm-workspace.yaml 放行）
pnpm -r build      # 产出各包 dist（agent-bridge/dist、dashboard/dist 等）
```

  App 运行时会 spawn `@planckeys/agent-bridge` 的 `dist/index.js`，控制台窗口加载
  `@planckeys/dashboard` 的 `dist/index.html`；若忘了构建，App 会用
  `pnpm --filter <pkg>... run build` 自动补构建（含其工作区依赖）。
  控制台也可指向 dashboard 的开发服务器：先 `pnpm --filter @planckeys/dashboard dev`，
  再以 `PLANCKEYS_DASHBOARD_URL=http://localhost:5173` 启动本 App。

## 开发运行

```bash
cd tools
pnpm --filter @planckeys/desktop dev   # 或在根用 `pnpm desktop`
```

> `dev` / `start` 启动前会**先构建 dashboard 产物**（`pnpm --filter @planckeys/dashboard... run build`，
> 含 `led-protocol` 等工作区依赖），确保窗口加载的是最新的 `dashboard/dist`，
> 避免加载到旧产物。若只想改 dashboard 并要热更新，改用 `PLANCKEYS_DASHBOARD_URL` 指向其开发服务器（见上）。

> `dev` / `start` 走 `scripts/run-dev.mjs` 启动器：
> - 首次会把 Electron 的 app 包用 APFS clonefile 克隆成本地 `.dev/Planckeys.app`（写时复制、
>   秒级、几乎不占额外磁盘），改掉 `Info.plist` 的 `CFBundleName` 并 ad-hoc 重签，让 Cmd-Tab /
>   Dock / 菜单栏显示 **Planckeys** 而非 Electron（dev 下 `app.setName()` 改不动切换器/Dock 的名字）。
>   源版本不变则后续启动直接复用，不再重建。打包正式 `.app`（路线图第四阶段）后即可弃用。
> - 会自动剥离 `ELECTRON_RUN_AS_NODE`。Cursor 等 Electron 宿主的集成终端会注入
>   `ELECTRON_RUN_AS_NODE=1`，否则 Electron 会退化成纯 Node 运行（报
>   `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`）。

启动后顶部菜单栏出现一个点阵图标，点击即得菜单。默认**开机自启 + 登录后自动启动 bridge**。

## 菜单功能

- **打开控制台（灯效 / 改键）**：弹出 dashboard 窗口。
  - **改键**走 Web Serial（ZMK Studio），与后台状态灯用的 Raw HID **不冲突**，可同时使用。
  - **控灯面板**走 Raw HID，与后台状态灯**会争用同一设备**：想在控制台里手动调灯时，
    先从菜单「停止 Bridge」，调完再启动。
- **启动 / 停止 / 重启 Bridge**，标题行显示状态（已停止 / 运行中 / 已连键盘 / 重连中）。
- **亮度**：64–255（切换后自动重启子进程生效）。

> 说明：早期的 working 灯效（snake / spinner / equalizer / breathe）在 bridge 重构为
> 「仪表盘分区」渲染后已移除，托盘不再提供该选项。
- **安装 / 卸载 hooks**：codex / codebuddy / workbuddy / claude / cursor（一次性调用，结果弹通知）。
  - Codex 仍需在 `codex` 里 `/hooks` 手动 trust；Cursor/CodeBuddy 等见 agent-bridge README。
- **开机自启动 App** / **登录后自动启动 Bridge** / **不驱动键盘（--no-hid 调试）**。
- **查看日志**（实时窗口）/ **打开日志文件** / **打开 bridge 目录**。

## 配置存放

- 设置：`~/Library/Application Support/planckeys-desktop/settings.json`
- 日志：`~/Library/Application Support/planckeys-desktop/bridge.log`

## 已知事项（第一阶段）

- **HID 独占**：同一时刻只能有一个进程打开左板。若你**另外**还手动跑着 agent-bridge，
  或开着 dashboard 网页连了 HID，App 里的子进程会报
  `exclusive access and device already open`。请只保留一个占用方。
- **输入监控权限**：node-hid 走 IOKit，首次可能需要在
  「系统设置 → 隐私与安全性 → 输入监控」给运行者授权。开发期运行者是 Electron；
  打包成 .app 后（第三阶段）改为对该 App 授权一次。
- 目前从源码运行（`npm run dev`）。打包 `.app` / `.dmg` + 签名 notarize 属第三阶段。

## 路线图

1. **套壳 + 常驻**（已完成）：菜单栏监管 agent-bridge，开机自启，消灭命令行启动。
2. **并入 dashboard 窗口**（已完成）：托盘打开控制台（灯效 / 改键），主进程放行
   WebHID / Web Serial。改键与状态灯可同时用；控灯面板与状态灯暂需二选一。
3. **收拢 HID**（待做）：把控灯 HID 统一到主进程 `node-hid`，`dashboard` 控灯改走 IPC，
   被动状态灯与手动控灯共用写入队列 + 仲裁，彻底解决独占冲突。
4. **打包**（待做）：`.app` / `.dmg` + 签名 notarize；输入监控权限对 App 授权一次。

## 目录结构

```text
src/
  main.ts          # 入口：单实例、隐藏 Dock、开机自启、拉起 bridge
  bridge.ts        # BridgeController：spawn/监管 agent-bridge 子进程、重启、hooks
  controlWindow.ts # 控制台窗口：加载 dashboard + 放行 WebHID / Web Serial
  tray.ts          # 托盘图标（点阵模板图）与菜单
  settings.ts      # 设置持久化（userData/settings.json）
  logStore.ts      # 环形日志缓冲 + 落盘（userData/bridge.log）
  logWindow.ts     # 实时日志窗口
  preloadLog.ts    # 日志窗口 preload（contextBridge）
  autolaunch.ts    # 登录项同步
assets/
  log.html         # 日志窗口页面
```
