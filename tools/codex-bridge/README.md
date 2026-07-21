# Planckeys Codex Bridge

把 Codex（以及 CodeBuddy / Claude Code / Cursor）的运行状态**被动地**反映到 Planckeys
左板的 RGB LED 上，还原 Codex Micro 的"6 线程状态墙"体验：**你照常在任意终端的 CLI
或桌面端里干活，键盘灯自动变化**，不需要改用别的客户端、不需要在某个特定进程里对话。

对应方案见 [`docs/codex-micro-parity.md`](../../docs/codex-micro-parity.md)。

```text
任意 codex 客户端(任意终端 CLI / 桌面端)
   -> 共享 Codex core 执行 ~/.codex/hooks.json 里的命令 hook
   -> forwarder(每事件一进程: 读 stdin JSON -> 写本机 unix socket -> 立即退出)
   -> 常驻 daemon(8 槽状态机) -> Raw HID 0xA1/0xA2 -> 仪表盘三区 + 底灯聚合
```

## 为什么是 hooks

Codex Micro 真机是靠 ChatGPT 桌面端通过**官方私有的 `0x06` HID 通道**原生驱动状态
灯的（见 parity 文档 §7/§8）。那条通道未公开、需仿冒官方 USB 身份，有合规风险，
不能用。

在**不仿冒设备身份**的前提下，唯一能做到"全局被动观测任意 codex 会话"的机制是
**hooks**：hooks 挂在**共享的 Codex core（harness）**上，任何用同一个 `~/.codex`
且信任了 hook 的会话——不管哪个终端的 CLI，还是桌面端——都会触发。这正好匹配
Codex Micro"照常用、设备被动反映"的核心体验。

## 支持的工具（Codex / CodeBuddy / Claude / Cursor）

Codex / CodeBuddy(含 WorkBuddy 桌面端，配置在 `~/.workbuddy/settings.json`) / Claude
共用 Claude-Code 派生的**嵌套** hooks 格式；Cursor 使用原生 **`~/.cursor/hooks.json`**
（扁平 `[{ command }]` + 顶层 `version`）。forwarder / socket server **完全复用**，用
`install-hooks <target>` 选择（`codex`｜`codebuddy`｜`workbuddy`｜`claude`｜`cursor`）：

| 维度         | Codex                 | CodeBuddy                               | Claude Code                          | Cursor                                                |
| ------------ | --------------------- | --------------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| 配置文件     | `~/.codex/hooks.json` | `~/.codebuddy/settings.json` 的 `hooks` | `~/.claude/settings.json` 的 `hooks` | `~/.cursor/hooks.json`                                |
| 配置结构     | 嵌套 matcher 分组     | 同左                                    | 同左                                 | 扁平 `[{ command }]` + `version: 1`                   |
| 线程键       | `session_id`          | `session_id`                            | `session_id`                         | `conversation_id`（`sessionStart` 亦有 `session_id`） |
| "需输入"事件 | `PermissionRequest`   | `Notification`                          | `Notification`                       | 无（不琥珀闪）                                        |
| 完成事件     | `Stop`                | `Stop`                                  | `Stop`                               | `stop`（`status: error` 可黄闪）                      |
| 信任         | `/hooks` 按哈希信任   | 重启即可                                | 重启即可                             | hooks.json 热加载；必要时重启 Cursor                  |

参考：[CodeBuddy Hooks](https://www.codebuddy.ai/docs/cli/hooks)、
[Cursor Hooks](https://cursor.com/docs/hooks)、
[Third Party Hooks](https://cursor.com/docs/reference/third-party-hooks)。

## 状态与配色

**仪表盘布局**：把整块可见轴灯当成一块 **4 列 × 6 行点阵**（`AXIS_LAYOUT`，最后一列 c3
只有前 4 行有灯），分成三个功能区，多 app / 多 agent 同时进行时能一眼看清各任务状态：

```text
        c0  c1  c2  c3
r0(行1)  10  21  22   6    -> 全局状态条（聚合所有对话）
r1(行2)  11  20  23   7    -> 对话 1-4
r2(行3)  12  19  24   8    -> 对话 5-8
r3(行4)  13  18  25   9    ┐
r4(行5)  14  17  26   ·    ├ 告警区（平时熄灭）
r5(行6)  15  16  27   ·    ┘
```

内部用 8 槽按会话（`session_id` / Cursor `conversation_id`）记录状态。详见
[`docs/led-matrix-interactions.md`](../../docs/led-matrix-interactions.md)。

### 行1 · 全局状态条（4 灯）

聚合所有对话的最高优先级状态，语义色（非平台色），优先级
`error > 需接管 > 进行中 > 已完成`：

| 全局状态         | 表现                                                     |
| ---------------- | -------------------------------------------------------- |
| 进行中(working)  | 琥珀 `#FF8F00` **来回跑马灯**（KITT 式扫描）             |
| 需接管           | 黄 `#FFD600` **整行闪烁**                                |
| error            | 红 `#FF1744` **整行闪烁**                                |
| 已完成(未读)     | 绿 `#00C853`：常亮 5s → 转微光；3min 无活动整板熄灭      |
| 无活动           | 熄                                                       |

### 行2 / 行3 · 8 个对话（各 1 灯）

参考 Codex Micro 的 Agent Key，一格一个对话，**色相按平台**（沿用现有平台色）、
**状态按亮度/闪烁**：

| 对话状态         | 表现                                        |
| ---------------- | ------------------------------------------- |
| 进行中(working)  | 平台色**呼吸**                              |
| 需接管           | 琥珀 `#FF6D00` 快闪                         |
| error            | 红 `#FF1744` 快闪                           |
| 已完成(未读)     | 平台色常亮 5s → 转微光（soft-unread）       |
| idle / 未绑定    | 熄                                          |

### 行4/5/6 · 告警区（10 灯）

平时**熄灭**保持安静；一旦有对话需接管或 error，整片走**脉冲波浪**（自上而下流动）
做「不可错过」的提醒：需接管为琥珀 `#FF6D00`，error 为红 `#FF1744`（error 优先）。

底灯 `0..5`（正面不可见）跟随全局状态条同色（琥珀/黄/红/绿），亮度乘 underglow 系数。

### 平台色（身份）

| 平台               | 颜色             |
| ------------------ | ---------------- |
| Cursor             | 冷灰白 `#E8EEF5` |
| CodeBuddy          | 紫 `#7C4DFF`     |
| WorkBuddy          | 绿 `#00C853`     |
| Codex              | 蓝 `#304FFE`     |
| Claude（附带支持） | 暖橙 `#D97757`   |

`install-hooks <target>` 会把平台名写进 forwarder 命令行；每条 hook 经 forwarder
打上 `_planckeys_platform` 后送入 daemon。

### 状态触发事件

固件保持 `Solid`；所有动画（呼吸 / 跑马灯 / 闪烁 / 波浪）由 host 逐像素（0xA2）驱动。
每个会话的状态由以下 hook 事件驱动，再按上面的三区规则渲染：

| 状态           | 触发事件                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| idle / offline | `SessionStart` / Cursor `sessionStart`；空槽                                                            |
| working        | `UserPromptSubmit`·`PreToolUse`·`PostToolUse` / Cursor `beforeSubmitPrompt`·`preToolUse`·`postToolUse`  |
| completeUnread | `Stop` / Cursor `stop`                                                                                  |
| requiresInput  | `PermissionRequest`(Codex) / `Notification`(CodeBuddy·Claude)；Cursor 无此事件                          |
| error          | 仅 Cursor `stop` 且 `status: error`（其它平台 hooks 无独立失败事件）                                    |

> `Notification` 在 CodeBuddy/Claude 里也用于 60s 空闲提醒。为避免**已完成/空闲**会话被
> 空闲提醒误翻成琥珀，`requiresInput` **只在会话正处于 working 时才被接受**；落在非 working
> 会话上的 `Notification` 视为空闲提醒忽略。

会话到槽位的绑定沿用 `recent` 策略：8 个对话格按最近活跃绑定，超过 8 个时挤掉最旧的
「已读 / 空闲 / 已完成」对话。

### 自动熄灭与唤醒（Codex Micro 式）

当**没有任何 working/需接管/error** 任务、且距上一次事件超过 `idleOffMs`（默认 3 分钟）时，
整板（含 soft-unread 微光）**全部熄灭**省电；任何新事件立即唤醒。注意这与「完成后 5s 降亮」
是两回事：5s 是完成态的降亮，3 分钟是整板全局待机熄屏。

### 已知行为：未标记平台会话

升级到平台色方案前安装的 hooks（forwarder 没带平台参数）发来的事件会被标记为
`unknown`（灰白）。这类会话的对话格会显示成灰白。**修复办法**：对该工具重新
`install-hooks <target>`（会写入带平台参数的 forwarder 命令）。

## hooks 路线的固有限制（务必知晓）

- **error（红闪）状态受限**：Codex / Claude 家族 hooks 没有独立失败事件，`Stop` 无论成功
  失败都触发，无法显示 error。Cursor 的 `stop` 带 `status`，`error` 时可红闪；审批琥珀
  仅 Codex/Claude 家族有对应事件。
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

# 1. 安装 hook（自动备份已有文件、保留其它设置、幂等）。按你用的工具选一个或多个：
npm run install-hooks              # Codex     -> ~/.codex/hooks.json
npm run install-hooks:codebuddy    # CodeBuddy -> ~/.codebuddy/settings.json 的 hooks 键
npm run install-hooks:workbuddy    # WorkBuddy桌面端 -> ~/.workbuddy/settings.json 的 hooks 键
npm run install-hooks:claude       # Claude    -> ~/.claude/settings.json 的 hooks 键
npm run install-hooks:cursor       # Cursor    -> ~/.cursor/hooks.json（扁平格式 + version）
#   自定义 socket： node dist/index.js install-hooks cursor --sock /path/to.sock

# 2. 让 hook 生效
#    Codex：打开 codex TUI，输入 /hooks 审查并 trust（否则会被跳过）
#    CodeBuddy / Claude：settings.json 命令 hook 直接生效，重启对应 CLI 即可
#    Cursor：hooks.json 会热加载；若无反应可重启 Cursor，并在 Settings → Hooks 确认
codex   # 仅 Codex 需要这步做 trust

# 3. USB 接左板，启动常驻 daemon
npm start
#   调试不接键盘： node dist/index.js --no-hid --log debug

# 之后在任意终端 codex / CodeBuddy / Claude / Cursor / 桌面端里干活，对应 Agent 灯就会变化。
# 卸载： node dist/index.js uninstall-hooks <codex|codebuddy|workbuddy|claude|cursor>
```

离线自测（无需 codex，打印每帧；有键盘则同时驱动）：

```bash
npm run mock
```

## 配置

命令行标志或环境变量（标志优先）：

| 标志                                           | 环境变量                          | 默认                                  | 说明                                                                    |
| ---------------------------------------------- | --------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| `--mock`                                       | `CODEX_BRIDGE_MOCK`               | false                                 | 用内置模拟器替代真实数据源（离线自测）                                  |
| `--sock <path>`                                | `PLANCKEYS_BRIDGE_SOCK`           | `$TMPDIR/planckeys-codex-bridge.sock` | daemon 与 forwarder 交会的 unix socket                                  |
| `--no-hid` / `--dry-run`                       | —                                 | false                                 | 不打开键盘，只打印帧（调试）                                            |
| `--brightness <0-255>`                         | `CODEX_BRIDGE_BRIGHTNESS`         | 160                                   | 全局亮度（0xA1）                                                        |
| `--binding recent\|fixed`                      | —                                 | recent                                | 槽位绑定策略                                                            |
| `--log <level>`                                | `CODEX_BRIDGE_LOG`                | info                                  | 日志级别                                                                |
| —                                              | `CODEX_BRIDGE_IDLE_OFF_MS`        | 180000                                | 无活动自动熄灭时长（0 关闭）；3 分钟                                    |
| —                                              | `CODEX_BRIDGE_SOFT_UNREAD_FACTOR` | 0.08                                  | 完成 5s 后的 soft-unread 亮度（仍认 `CODEX_BRIDGE_IDLE_FACTOR` 作别名） |
| —                                              | `CODEX_BRIDGE_COMPLETE_HOLD_MS`   | 5000                                  | 完成高亮常亮时长                                                        |
| —                                              | `CODEX_BRIDGE_BREATHE_PERIOD_MS`  | 2000                                  | 对话格 working 呼吸周期                                                 |
| —                                              | `CODEX_BRIDGE_BLINK_PERIOD_MS`    | 400                                   | 需接管 / error 快闪周期                                                 |
| —                                              | `CODEX_BRIDGE_MARQUEE_PERIOD_MS`  | 1400                                  | 全局行 working 跑马灯扫描周期                                           |
| —                                              | `CODEX_BRIDGE_ALERT_PERIOD_MS`    | 900                                   | 告警区波浪脉冲周期                                                      |
| —                                              | `CODEX_BRIDGE_ANIM_FPS`           | 15                                    | host 侧动画推帧率                                                       |
| —                                              | `CODEX_BRIDGE_UNDERGLOW`          | true                                  | 底灯聚合告警开关                                                        |
| —                                              | `CODEX_BRIDGE_UNDERGLOW_FACTOR`   | 0.35                                  | 底灯亮度系数                                                            |
| —                                              | `CODEX_BRIDGE_HID_RECONNECT_MS`   | 2000                                  | HID 重连间隔                                                            |

> 升级到平台色方案后请**重新** `install-hooks <target>`，以便 forwarder 带上平台参数。

> 若用 `--sock` 自定义 socket，`install-hooks` 也要传相同的 `--sock`（写进 hook 命令）。

## Failsafe

释放接管是**基于连接**而非事件静默：正常空闲期没有事件，soft-unread 等状态会常驻；
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
原生通道里才有的精细失败信号（Claude 家族 `Stop` 无法区分成功/失败）。

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
   本就没有事件，会误清常驻的未读/琥珀。改为**仅在数据源连接断开时清灯**。
5. **落到 hooks（当前方案）**：hooks 是不仿冒设备身份下**唯一**能全局被动观测任意
   codex 客户端（含桌面端）的机制，匹配 Codex Micro 的核心体验。**已知代价**：Claude
   家族无独立失败事件 → error 黄闪仅 Cursor 可靠；粒度较粗；需 `/hooks` 信任。
6. **代码精简**：移除了删库后遗留的死代码（`acknowledge`/`release`/`buildBrightnessReport`/
   `connected` getter / `activity` 事件等推测性接口），只保留当前链路真正用到的部分。
7. **多客户端支持**：Codex / CodeBuddy / WorkBuddy / Claude 的 hooks 同源（Claude-Code
   派生），forwarder 与 socket server 完全复用；`install-hooks <target>` 只切换配置文件与
   "需输入"事件名（Codex 用 `PermissionRequest`，Claude 家族用 `Notification`）。
8. **配置目录坑（已修）**：CodeBuddy CLI/IDE 读 `~/.codebuddy/`，但 **WorkBuddy 桌面端读
   `~/.workbuddy/`**——装错目录客户端就完全没反应。安装器为每个 target 写对应文件并保留
   其它已有设置键。
9. **端到端验证**：用 `cbc -p`（CodeBuddy CLI 无头）实测通过——`SessionStart→UserPromptSubmit
→Stop` 依次点亮 idle→working→complete，证明"照常用、被动反映"链路成立。
   已知小瑕疵：CodeBuddy 的 `Notification`（含 60s 空闲提醒）有时带不同的 `session_id`，
   会让另一颗灯偶发亮琥珀；不影响主流程。
10. **Cursor 原生 hooks**：Cursor 用 `~/.cursor/hooks.json`（扁平 `[{ command }]` + 必需的
    `version: 1`），事件名为 camelCase（`sessionStart` / `beforeSubmitPrompt` / …），
    线程键为 `conversation_id`。安装器按 `format: flat` 写入并保留文件内其它 hook；
    无 `Notification`/`PermissionRequest`，故 Cursor 无审批闪；`stop.status === "error"`
    时可黄闪。
11. **平台色 + host 动画**：色相按平台（Cursor 灰白 / CodeBuddy 紫 / WorkBuddy 绿 /
    Codex 蓝）；working 软呼吸、完成高亮 5s 后 soft-unread、需输入琥珀快闪、error 黄闪。
    固件保持 Solid，避免全局 Breathing；forwarder 注入 `_planckeys_platform`。
12. **仪表盘布局（当前方案）**：多 app / 多 agent 并行时，「整板单平台点阵」看不清各任务
    状态，改为三区仪表盘——行1 全局状态条（琥珀跑马灯 / 黄闪 / 红闪 / 绿）、行2-3 八个
    对话各一格（平台色呼吸 + 状态亮度/闪烁）、行4-6 告警区（平时熄灭，需接管/error 时整片
    波浪脉冲）。槽位从 6 扩到 8；移除了贪吃蛇 / spinner / 音柱 / 字模 / 侧条 / 任务序号等
    旧渲染（`snake.ts` / `workingEffects.ts` / `glyphs.ts` 及 `--working` 系列配置一并删除）。

## 目录结构

```text
src/
  index.ts          # 入口：hooks/mock 源 -> 状态机 -> HID，含 failsafe 与子命令
  config.ts         # 配置与默认值
  logger.ts
  paths.ts          # socket / hooks.json 路径
  protocol.ts       # Raw HID 协议与 LED 布局常量（仪表盘分区）、报文构建
  types.ts          # 状态枚举、平台色、全局语义色
  effects.ts        # 呼吸/快闪亮度系数
  threadStore.ts    # 8 槽状态机、绑定、仪表盘三区渲染、底灯、自动熄灭
  hidDevice.ts      # node-hid 封装、重连、failsafe
  source.ts         # CodexSource 抽象与事件
  hookEvents.ts     # hook 事件 -> 状态映射（含平台）
  hookForwarder.ts  # 每事件进程：stdin 打平台标签 -> unix socket
  hooksSource.ts    # 常驻 daemon：unix socket server
  installHooks.ts   # 安装/卸载各客户端 hooks（含 cursor 扁平格式；幂等、自动备份）
  mockSource.ts     # 离线模拟器（8 对话 / 各分区状态自测）
```

```
node dist/index.js --log info      # 常驻 daemon
node dist/index.js --mock          # 离线预览仪表盘（无需键盘）
```
