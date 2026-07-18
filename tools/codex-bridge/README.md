# Planckeys Codex Bridge

把 Codex 的运行状态**被动地**反映到 Planckeys 左板的 RGB LED 上，还原 Codex Micro
的"6 线程状态墙"体验：**你照常在任意终端的 codex CLI 或桌面端里干活，键盘灯自动
变化**，不需要改用别的客户端、不需要在某个特定进程里对话。

对应方案见 [`docs/codex-micro-parity.md`](../../docs/codex-micro-parity.md)。

```text
任意 codex 客户端(任意终端 CLI / 桌面端)
   -> 共享 Codex core 执行 ~/.codex/hooks.json 里的命令 hook
   -> forwarder(每事件一进程: 读 stdin JSON -> 写本机 unix socket -> 立即退出)
   -> 常驻 daemon(6 槽状态机) -> Raw HID 0xA1/0xA2 -> 顶排 6 灯 + 底灯聚合
```

## 为什么是 hooks

Codex Micro 真机是靠 ChatGPT 桌面端通过**官方私有的 `0x06` HID 通道**原生驱动状态
灯的（见 parity 文档 §7/§8）。那条通道未公开、需仿冒官方 USB 身份，有合规风险，
不能用。

在**不仿冒设备身份**的前提下，唯一能做到"全局被动观测任意 codex 会话"的机制是
**hooks**：hooks 挂在**共享的 Codex core（harness）**上，任何用同一个 `~/.codex`
且信任了 hook 的会话——不管哪个终端的 CLI，还是桌面端——都会触发。这正好匹配
Codex Micro"照常用、设备被动反映"的核心体验。

## 状态与配色

顶排 6 键作为 6 个 Agent 灯（LED `15,14,13,12,11,10`），用 `session_id` 绑定槽位：

| 状态 | 颜色 | 触发事件 |
| --- | --- | --- |
| idle | 低亮白 | `SessionStart` |
| working | 蓝 `#304FFE` | `UserPromptSubmit` / `PreToolUse` / `PostToolUse` |
| requiresInput | 琥珀 `#FF6D00` | `PermissionRequest` |
| completeUnread | 绿 `#00FF4C` | `Stop`（本轮结束） |

底灯 `0..5` 聚合"是否需要抬头处理"。优先级仲裁：
`requiresInput > completeUnread > working > idle > offline`。

## hooks 路线的固有限制（务必知晓）

- **没有 error（红）状态**：hooks 没有独立的失败事件，`Stop` 无论成功失败都触发，
  所以出错无法显示红色。要红色/审批等精细状态，只有官方 `0x06` 原生通道能做，本方案
  做不到。
- **粒度较粗**：只有生命周期打点（会话开始 / 提交 / 工具前后 / 审批 / 结束），
  没有逐 token 的实时流。
- **需要信任**：非托管 hook 必须先在 codex CLI 里用 `/hooks` 审查并信任（按哈希）后
  才会执行；改了 hook 要重新信任。
- **桌面端**需使用同一个 `~/.codex` 且信任该配置，才会执行同一套 hook。

## 环境要求

- Node.js >= 18（已在 Node 22 验证）
- 已安装 Codex CLI（`~/.codex` 为共享配置目录）
- macOS：`node-hid` 通过 IOKit 访问 HID，首次可能需在
  "系统设置 → 隐私与安全性 → 输入监控" 给运行 Node 的终端授权；**不能在沙箱内运行**。
- 左板通过 **USB** 连接（蓝牙下 Raw HID 不可用）。

## 快速开始

```bash
cd tools/codex-bridge
npm install
npm run build

# 1. 安装 hook 到 ~/.codex/hooks.json（自动备份已有文件，幂等）
npm run install-hooks

# 2. 在 codex CLI 里信任这些 hook（否则会被跳过）
#    打开 codex TUI，输入斜杠命令： /hooks  -> 审查并 trust
codex

# 3. USB 接左板，启动常驻 daemon
npm start
#   调试不接键盘： node dist/index.js --no-hid --log debug

# 之后在任意终端 codex / 桌面端里干活，对应 Agent 灯就会变化。
# 卸载 hook： npm run uninstall-hooks
```

离线自测（无需 codex，打印每帧；有键盘则同时驱动）：

```bash
npm run mock
```

## 配置

命令行标志或环境变量（标志优先）：

| 标志 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `--mock` | `CODEX_BRIDGE_MOCK` | false | 用内置模拟器替代真实数据源（离线自测） |
| `--sock <path>` | `PLANCKEYS_BRIDGE_SOCK` | `$TMPDIR/planckeys-codex-bridge.sock` | daemon 与 forwarder 交会的 unix socket |
| `--no-hid` / `--dry-run` | — | false | 不打开键盘，只打印帧（调试） |
| `--brightness <0-255>` | `CODEX_BRIDGE_BRIGHTNESS` | 160 | 全局亮度（0xA1） |
| `--binding recent\|fixed` | — | recent | 槽位绑定策略 |
| `--log <level>` | `CODEX_BRIDGE_LOG` | info | 日志级别 |
| — | `CODEX_BRIDGE_IDLE_FACTOR` | 0.12 | idle 白色的低亮系数 |
| — | `CODEX_BRIDGE_UNDERGLOW` | true | 底灯聚合告警开关 |
| — | `CODEX_BRIDGE_UNDERGLOW_FACTOR` | 0.35 | 底灯亮度系数 |
| — | `CODEX_BRIDGE_HID_RECONNECT_MS` | 2000 | HID 重连间隔 |

> 若用 `--sock` 自定义 socket，`install-hooks` 也要传相同的 `--sock`（写进 hook 命令）。

## Failsafe

释放接管是**基于连接**而非事件静默：正常空闲期没有事件，绿色（未读）等状态会常驻；
只有 daemon 关闭时才清空接管的 LED。

## Raw HID 协议

与固件 `src/led_control.c`、`tools/led-web/app.js`、`docs/led-web-control.md` 完全一致：
usage page `0xFF60`、32 字节 report、`0xA2` 每包最多 9 颗 RGB。见 `src/protocol.ts`。

## 官方实现方案（Codex Micro 真机，客观记录）

本项目与官方实现**不是同一套机制**，这里如实记录我们了解到的官方做法，供对照：

- Codex Micro（Work Louder × OpenAI）与 **ChatGPT / Codex 桌面端深度原生集成**。
  Agent Key 的实时状态灯**需要桌面应用运行**，由桌面端直接驱动，不依赖用户自建桥接。
- 逆向观测（同类项目 arkey 的实验，见 `docs/codex-micro-parity.md` §7/§8）显示：
  桌面端与真机之间走一条 **HID Report ID `0x06`、64 字节的原生私有通道**，承载
  版本/设备状态、**6 个任务灯**、命令键/氛围灯、按键、旋钮、摇杆方向等。设备以桌面端
  期望的 **USB 身份**枚举后，桌面端即可**原生驱动状态灯并接收控件事件**，无需 app-server
  或任何桥接程序。这解释了真机"单击不弹窗切前台、6 色状态墙、摇杆四向"为何是原生能力。
- 官方原生控件目标约 13 个：6 个 Agent Key、6 个 Command Key、1 个编码器按压，另加
  4 个摇杆方向事件；Skill / Cancel 无原生目标。
- 命令键改键、图层、AppSense 等由 **Codex 设置页 + Work Louder Input 软件**完成。

**为什么本项目不走这条路**：`0x06` 帧的确切字节布局**未公开**、可能随桌面端更新失效，
且需**仿冒非自有的 USB 设备身份**，涉及商标 / 服务条款 / 法律合规风险。因此本项目
**不实现 `0x06` 仿冒**，改用公开、可维护的 hooks + 自有 Raw HID 通道，代价是拿不到
error 红灯等只在原生通道里存在的信号。

## 开发记录：演进与踩过的坑

按时间顺序，也是为了让后来者少走弯路：

1. **app-server 路线（已废弃删除）**：最初按 `docs/codex-micro-parity.md` §9 实现了
   "spawn `codex app-server` + 自驱动 turn" 的桥接。**坑**：`app-server` 是**每客户端
   各自一个实例**，只能看到"经由本实例驱动"的线程，无法观测桌面端或别的终端 CLI；
   为了产生事件还得在一个残废 REPL 里对话，**完全背离 Codex Micro"照常用、被动反映"
   的体验**。已整套删除。
2. **app-server 字段映射 bug（已修，随路线删除）**：用 `codex app-server generate-ts`
   生成真实 schema 后发现文档/经验值多处对不上——`turn/completed` 的状态在
   `turn.status` 而非顶层、`thread/status/changed.status` 是 `{type,activeFlags}` 结构、
   `turn/start` 的 text input 必带 `text_elements`。教训：**别照文档猜字段，用
   `generate-ts` 校准**。
3. **共享 daemon 死路**：`codex app-server daemon` / `proxy` / `~/.codex/ipc/ipc.sock`
   看似能连到"共享实例"做全局观测；实测 `codex app-server proxy` 要连的控制 socket
   默认未运行，且桌面端默认 spawn 自己的内置 app-server、不汇入可订阅的广播总线。
   **结论：daemon/proxy 做不到被动全局观测。**
4. **failsafe 误清灯（已修）**：最初 failsafe 基于"事件静默 N 秒清灯"，但正常空闲期
   本就没有事件，会误清常驻的绿色/琥珀。改为**仅在数据源连接断开时清灯**。
5. **落到 hooks（当前方案）**：hooks 是不仿冒设备身份下**唯一**能全局被动观测任意
   codex 客户端（含桌面端）的机制，匹配 Codex Micro 的核心体验。**已知代价**：无独立
   失败事件 → 无 error 红灯；粒度较粗；需 `/hooks` 信任。
6. **代码精简**：移除了删库后遗留的死代码（`acknowledge`/`release`/`buildBrightnessReport`/
   `connected` getter / `activity` 事件等推测性接口），只保留当前链路真正用到的部分。

## 目录结构

```text
src/
  index.ts          # 入口：hooks/mock 源 -> 状态机 -> HID，含 failsafe 与子命令
  config.ts         # 配置与默认值
  logger.ts
  paths.ts          # socket / hooks.json 路径
  protocol.ts       # Raw HID 协议与 LED 布局常量、报文构建
  types.ts          # 状态枚举、配色、优先级
  threadStore.ts    # 6 槽状态机、绑定、仲裁、渲染
  hidDevice.ts      # node-hid 封装、重连、failsafe
  source.ts         # CodexSource 抽象与事件
  hookEvents.ts     # hook 事件 -> 状态映射（session_id 绑定）
  hookForwarder.ts  # 每事件进程：stdin -> unix socket（由 codex 调用）
  hooksSource.ts    # 常驻 daemon：unix socket server
  installHooks.ts   # 安装/卸载 ~/.codex/hooks.json（幂等、自动备份）
  mockSource.ts     # 离线模拟器（LED 自测，含 error 色演示）
```
