# Planckeys × Codex Micro：能力还原度评估

> 评估日期：2026-07-18  
> 评估对象：当前 `planckeys` 左板固件与 Web LED 控制方案。  
> 对照基准：`planck-boy-color/docs/codex-micro/` 中的 Codex Micro 能力调研、事件流调研与同类项目 arkey 调研。  
> 本文评估的是“能否在 Planckeys 上获得相同功能价值”，不是把设备伪装成官方 Codex Micro。

## 结论

Planckeys 对 Codex Micro 的还原上限显著高于只有 3 颗单色 LED 的
planck-boy-color：

- 左板有 **28 颗可独立控制的 24-bit RGB LED**：22 颗轴灯和 6 颗底灯。
- 22 个按键和 1 个旋转编码器足以容纳 6 个 Agent Key、常用 Command Key
  和推理强度旋钮。
- 任选 6 个轴灯即可一一对应 6 个 Codex 线程，并准确显示白、蓝、绿、
  琥珀、红和熄灭状态。
- 6 颗底灯可作为全局状态、麦克风监听或“有任务需要注意”的 ambient 灯。

因此，Codex Micro 最核心的“6 线程状态监控墙”在视觉表达上是
**高还原度可行**的，不再需要退化成 3 灯聚合信号。

真正的限制不再是 LED 数量或颜色，而是：

1. 当前仓库还没有消费 `codex app-server` 事件并向键盘下发状态的桥接程序。
2. Raw HID 控灯目前只在左板 USB 连接下可靠；蓝牙下不可用。
3. Codex Micro 的单击、双击、摇杆、Composer 导航和设置页改键依赖官方桌面端
   原生协议，普通快捷键只能部分替代。
4. 当前灯效模式是全局模式，不能让 6 个 Agent Key 同时采用不同的呼吸或闪烁节奏。

综合判断：

| 目标 | 结论 | 说明 |
| --- | --- | --- |
| 6 线程独立状态灯 | 可行，高还原度 | 6 颗独立 RGB 轴灯足够；需桥接程序 |
| Codex 状态颜色 | 可行，高还原度 | 白、蓝、绿、琥珀、红、灭均可准确显示 |
| 常用命令键 | 可行 | ZMK 快捷键或宏 |
| 推理强度旋钮 | 可行 | 编码器映射到 Codex 自定义快捷键 |
| 全局 ambient / 监听灯 | 受限可行 | 6 颗底灯足够，但语音状态源不一定可得 |
| Agent Key 原生点击交互 | 受限 | 可切任务，不能保证复刻官方窗口行为和对象绑定 |
| 四向摇杆直触 Skill | 受限 | 无摇杆；可用 4 个按键和桥接程序替代 |
| Composer 原生旋钮导航 | 不可行 | 没有公开的等价快捷键或控件焦点协议 |
| AppSense 和 Codex Micro 设置页 | 不可行 | 官方硬件与桌面端专有集成 |
| 无桥接、由 ChatGPT 原生驱灯 | 不可行 | 除非实现不公开且有合规风险的原生 HID 身份/协议 |

---

## 1. 评估口径

本文使用三档：

- **A — 可行**：现有 Planckeys 硬件足够，通过 ZMK 映射或现有 LED 下行协议即可实现；
  如果能力本身需要 Codex 状态，允许增加正常的本机桥接程序。
- **B — 受限**：能保留主要用途，但交互、事件覆盖、动画、连接方式或可靠性与
  Codex Micro 有明显差异。
- **C — 不可行**：依赖官方设备身份、私有桌面端协议、专有硬件或当前没有可用状态源，
  普通键盘加 LED 桥接不能等价实现。

还需区分“硬件/协议可行”和“仓库已实现”：

- 当前 **已实现**：28 颗逐像素 RGB、全局亮度、5 种全局模式、WebHID 控制页、
  键盘本地切换灯效。
- 当前 **未实现**：Codex 事件桥接、线程与灯位绑定、未读确认、心跳/fail-safe、
  Codex 状态与用户灯效之间的仲裁。

所以本文中的状态灯“可行”表示实现路径和物理能力已经成立，并不表示刷入当前固件后
会自动显示 Codex 状态。

---

## 2. Planckeys 当前能力边界

### 2.1 LED 硬件

| 维度 | 当前能力 | 对 Codex Micro 的意义 |
| --- | --- | --- |
| 总数 | 28 颗 WS2812 | 数量远高于 6 个 Agent 状态灯 |
| 轴灯 | index `6..27`，22 颗，每键一颗 | 可把状态与物理 Agent Key 对齐 |
| 底灯 | index `0..5`，6 颗，正面不可见 | 可做 ambient、监听或全局告警 |
| 颜色 | 每颗独立 8-bit RGB，24-bit 色深 | 可准确表达 Micro 的全部语义色 |
| 亮度 | 全局 `0..255` | 可做低亮 idle，但不能逐灯独立调亮度 |
| 刷新 | 动画默认约 30 fps | 固件动画流畅；静态状态只渲染一次 |

已确认的轴灯正面布局：

```text
15 14 13 12 11 10
16 17 18 19 20 21
27 26 25 24 23 22
      9  8  7  6
```

推荐把顶排 6 个物理键作为 Agent Key，对应 LED `15, 14, 13, 12, 11, 10`。
这组位置连续、可见，也与 Micro 的 6 键状态区最接近。

### 2.2 当前 LED 协议

主机通过 usage page `0xFF60` 的 32 字节 Raw HID report 下发：

| opcode | 能力 | 与 Codex 状态桥接的关系 |
| --- | --- | --- |
| `0xA1` | 设置全局模式、亮度、速度 | 切常亮/呼吸等全局表现 |
| `0xA2` | 从指定 offset 写逐颗 RGB，每包最多 9 颗 | 更新 6 个 Agent 灯的核心命令 |
| `0xA3` | 设置全局亮度 | 日夜亮度或全局告警 |
| `0xA4` | 全灯单色填充 | 适合全局提示，不适合多线程状态 |

6 个 Agent LED 一次 `0xA2` report 就可全部更新。全量 28 颗需要 4 包，目前没有
暂存后原子提交；但只更新 6 个连续 Agent LED 时不存在跨包撕裂问题。

### 2.3 动画边界

固件已有：

- 关灯；
- 常亮；
- 全局呼吸；
- 沿整条灯链跑马；
- 沿整条灯链移动的亮度波。

这些模式作用于整块基色画布。每颗灯可以保持不同颜色，但所有灯共享同一种模式、
全局亮度和速度。因此：

- 6 个线程同时显示不同静态颜色：完全可行。
- 6 个线程一起呼吸：可行。
- 某个线程快闪、另一个线程常亮：当前不支持。
- 用“慢呼吸=运行、双脉冲=完成、快闪=错误”让每个线程独立动画：需扩展固件。

### 2.4 连接和可靠性边界

- WebHID/Raw HID 仅在左板 USB 连接下可靠。
- 右板当前未启用自研 LED 控制模块。
- 仅实现主机到键盘的下行控制，没有状态查询或确认回包。
- 没有协议版本/能力握手。
- 没有心跳；桥接程序崩溃后会保留最后一帧，可能显示过期状态。
- 没有 NVS 持久化；重启后恢复默认冰蓝常亮。
- 用户通过 `&led_next` 切灯效和桥接程序写状态共用同一份状态，当前没有所有权或
  优先级仲裁，后写入者生效。

---

## 3. Agent Keys：核心能力评估

Codex Micro 有 6 个 RGB Agent Key，每键对应一个任务/线程。Planckeys 可把顶排
6 键和 6 颗轴灯一一绑定。

### 3.1 状态颜色

| Codex 状态 | 建议 RGB | Planckeys | 还原度 |
| --- | --- | --- | --- |
| idle 空闲 | `#FFFFFF` | 低亮白色 | A |
| working 思考/运行 | `#304FFE` | 蓝色 | A |
| complete/unread 完成未读 | `#00FF4C` | 绿色 | A |
| requires input/approval | `#FF6D00` | 琥珀色 | A |
| error | `#FF0033` | 红色 | A |
| offline/unassigned | `#000000` | 熄灭 | A |

颜色值可参考 arkey 的 AgentGlow 状态映射。它不是 Codex Micro 公开协议的一部分，
但语义与公开的 Micro 白/蓝/绿/琥珀/红状态一致，适合作为桥接实现基线。

推荐每线程状态优先级：

```text
requiresInput > completeUnread > working > idle > offline/unassigned
```

错误状态不应被低优先级事件覆盖；若事件模型允许并列，可将 `error` 与
`requiresInput` 设为最高级，并由桥接程序显式规定先后顺序。

### 3.2 事件来源

推荐由常驻桥接程序启动或连接 `codex app-server`，消费：

| app-server 事件 | 状态转换 |
| --- | --- |
| `turn/started` | working |
| `turn/completed(status=completed)` | completeUnread |
| `turn/completed(status=failed)` | error |
| `thread/status/changed(active)` | working |
| `waitingOnApproval` / `waitingOnUserInput` | requiresInput |
| `systemError` / 不重试的 `error` | error |
| 审批 server request | requiresInput |
| `serverRequest/resolved` | 重算该线程状态 |

`notify` 和 hooks 可以做轻量完成提示或审批策略，但实时状态覆盖不如 app-server
完整，不宜作为 6 线程状态墙的唯一数据源。

### 3.3 线程与灯位绑定

可行的绑定策略：

1. **固定槽位**：用户手动把 6 个 thread id 绑定到 6 个键位，最稳定。
2. **最近活动 6 线程**：新线程占空槽，没有空槽时替换最久未活动且已空闲的线程。
3. **固定工作流/agent**：桥接程序按 metadata 绑定；能力取决于 app-server 是否提供
   足够稳定的标识。

桥接程序至少需要保存：

- 6 个槽位与 thread id 的关系；
- 每线程当前状态和最近更新时间；
- 完成状态是否已读；
- HID 设备连接状态；
- 状态重放所需的最后一帧。

### 3.4 点击交互

| Micro 交互 | Planckeys 替代 | 结论 |
| --- | --- | --- |
| 单击切到对应线程且不弹出 ChatGPT | 发送 `⌘1..6` 或桥接程序调用任务切换能力 | B |
| 350ms 内双击切线程并前置 ChatGPT | ZMK tap-dance/宏 + 前置应用快捷方式 | B |
| 绑定固定任务、最近任务、特定 agent | 桥接程序维护灯槽；按键仍需可调用的切换接口 | B |
| 由桌面端原生识别 Agent Key | 普通键盘无官方设备语义 | C |

视觉状态可高还原，但点击行为不能保证与 Micro 完全一致。尤其“切线程但不前置窗口”
与“前置后定位到同一线程”依赖 ChatGPT Desktop 对官方设备的原生联动，普通
`⌘1..6` 快捷键无法证明等价。

---

## 4. Command Keys 与旋钮

### 4.1 直接可映射的命令

下列动作本质上是桌面快捷键，使用 ZMK 按键、宏或图层即可实现：

| 动作 | 典型快捷键 | 结论 |
| --- | --- | --- |
| 拒绝 / 批准 | `Escape` / `Enter` | A |
| 新建 / 归档 / 置顶任务 | `⌘N` / `⇧⌘A` / `⌥⌘P` | A |
| 命令菜单 / 关闭 | `⌘K` 或 `⇧⌘P` / `⌘W` | A |
| 终端 / 审查 / 面板 / 文件树 / 设置 | Codex 已有快捷键 | A |
| 听写 / 语音模式 | `⌃⇧D` / `⌃⇧V` | A |
| 转到任务 1–9 / 上下任务 | `⌘1..9` / `⇧⌘[` / `⇧⌘]` | A |
| 新聊天 | `⌥⌘N` | A |

发送、附文件、Git 提交/推送、创建 PR、推理强度、快速/规划模式、模型选择等动作，
只要 Codex 设置中提供快捷键槽位，就可先自定义组合键，再由 ZMK 发送，仍属 A。

当前 `planck_left.keymap` 还是普通键盘布局，上述映射是能力可行性，不是当前默认键位。

### 4.2 Rotary Dial

Planckeys 左板已有一个旋转编码器和按压键：

| Micro 能力 | Planckeys 方案 | 结论 |
| --- | --- | --- |
| 转动调整 reasoning level | 编码器顺/逆时针发送自定义“推理 + / -”快捷键 | A |
| 按下打开模型或推理选择器 | 编码器按键发送 `⌃⇧M` 或自定义快捷键 | A |
| Composer 中移动控件焦点并选择 | 无公开等价快捷键/焦点协议 | C |
| 控件打开时旁键亮红并作取消键 | `Escape` 可取消；无法可靠回读控件打开状态 | B/C |

若未来 app-server 提供“当前有可取消控件”的稳定事件，红灯提示可降为 B；当前没有
证据证明该状态可得，因此不应把它列为已可实现。

---

## 5. Joystick、Touch Sensor 与图层

### 5.1 四向 Skill

Planckeys 没有平面摇杆，但可拿 4 个物理键或一个图层中的方向键代替四个方向。

- 如果 Codex 给每个 Skill 提供可绑定快捷键：直接映射，A。
- 如果只有 app-server 调用能力：桥接程序监听 4 个保留热键，再触发对应 Skill，B。
- 如果既无快捷键也无 app-server 调用接口：只能打开 Skill 列表后人工选择，C。

现有资料只确认 Codex 有“前往技能/重载技能”的快捷键槽，没有确认“直接运行第 N 个
Skill”的通用快捷键。因此“四向一拨即运行 4 个预设 Skill”应归为 **B（需桥接并验证
app-server 调用路径）**，不能宣称已 100% 还原。

### 5.2 图层

| Micro 能力 | Planckeys 方案 | 结论 |
| --- | --- | --- |
| 6 个可编程图层 | ZMK 可定义 6 层 | A |
| 触摸循环切换 6 层 | 用按键/组合键循环，功能相同、交互不同 | B |
| 3 个图层指示灯 | 任选轴灯或底灯显示层号/层色 | A |
| AppSense 聚焦应用 5 秒后自动切层 | ZMK 不能感知主机前台应用 | C |

AppSense 理论上可由本机 daemon 监听前台应用，再通过新增 Raw HID 命令让固件切层，
但当前协议只有 LED 命令，且远超 Codex 状态桥接的必要范围。按当前仓库能力仍归 C。

---

## 6. Ambient 与语音监听

Micro 的亚克力边框会在麦克风开启或 Codex 监听时发光。Planckeys 的 6 颗底灯在
空间角色上最接近这个 ambient 灯：

- 6 颗底灯统一低亮蓝：语音待命；
- 6 颗底灯呼吸：正在监听；
- 6 颗底灯琥珀或红：需要输入或审批；
- 轴灯继续独立显示 6 个线程，不与 ambient 争用。

物理表现上可行，但状态源受限：

- app-server 事件流大概率不提供系统麦克风开/关状态。
- 若语音由桥接程序自己启动，可由桥接程序维护状态，B。
- 若由 ChatGPT Desktop 内部 push-to-talk 启动，需要监听全局快捷键或 macOS
  麦克风占用状态，可能出现状态不同步，B。
- 只凭当前 Codex app-server 事件，不能保证实现，不能列为 A。

另外，底灯“正面不可见”，适合桌面反射氛围，不等同于 Micro 亚克力边框的直接可见性。

---

## 7. 当前不可等价还原的能力

| 能力 | 原因 |
| --- | --- |
| 无桥接、由 ChatGPT Desktop 自动识别并驱灯 | Planckeys 没有官方 Codex Micro USB 身份和原生 HID 协议 |
| Agent Key 官方单击/双击窗口语义 | 依赖官方硬件与桌面端原生绑定 |
| 在 Codex 设置页直接识别 Planckeys 并改键 | 设置页只面向 Codex Micro 集成 |
| Composer 原生旋钮导航 | 没有公开快捷键或焦点协议 |
| 物理触摸传感器和摇杆手感 | Planckeys 没有对应硬件，只能用键替代 |
| Work Louder AppSense | 当前 ZMK 和 LED 协议无法感知前台应用并切层 |
| Micro 亚克力边框外观 | 6 颗底灯只能提供近似 ambient 效果 |
| 官方 Codex 图标键帽与外壳 | 物理配件与工业设计差异 |

已知同类项目 arkey 的实验表明，ChatGPT Desktop 与真机之间存在 Report ID `0x06`
的 64 字节原生 HID 通道，承载 6 个任务灯、按键、旋钮、摇杆和 ambient 信息。
但精确字节布局未公开，可能随桌面端更新，并涉及仿冒设备身份的合规风险。

Planckeys 不应以实现 `0x06` 仿冒作为主路线。公开、可维护的方案仍是：

```text
codex app-server
    -> 本机桥接程序
    -> Planckeys 自有 Raw HID 0xA1/0xA2
    -> 28 颗 RGB LED
```

---

## 8. 推荐的 Planckeys 映射

### 8.1 物理分区

| 分区 | 推荐用途 |
| --- | --- |
| 顶排 6 键，LED `15..10` | Agent 1..6：线程切换 + 独立状态色 |
| 中间 6 键 | 批准、拒绝、新任务、归档、终端、审查 |
| 下方按键 | Skills、面板、附件、Git/PR、图层等 |
| 编码器旋转 | 推理强度加/减 |
| 编码器按压 | 模型/推理选择器 |
| 6 颗底灯 `0..5` | 全局最高优先级状态或语音 ambient |

### 8.2 底灯聚合规则

底灯不必重复 6 个线程，可只表达“现在是否需要人处理”：

```text
任一线程 requiresInput -> 琥珀常亮
否则任一线程 error     -> 红色
否则任一线程 complete  -> 绿色低亮或短时提示
否则任一线程 working   -> 蓝色低亮
否则                    -> 熄灭
```

这样正面 6 个轴灯负责“哪个线程是什么状态”，桌面反射底灯负责“是否需要抬头处理”，
比把 28 颗灯全部显示同一状态更有信息密度。

### 8.3 动画建议

第一版只用静态色，不使用全局动画：

- 状态更稳定，6 个线程可以同时保持不同颜色；
- 不会因全局呼吸让 idle、审批、错误等所有状态一起闪；
- 只需一个 `0xA2` report 更新顶排 6 灯，协议简单。

若后续要接近 AgentGlow 的呼吸/双脉冲效果，建议给固件增加“每像素效果状态”，
而不是让主机以 30 fps 高频刷新：

- 每像素保存 `color + effect + speed/phase`；
- 支持 `solid / breathing / pulse / blink`；
- 动画在键盘本地生成；
- 保留用户画布，Codex 只接管显式绑定的 6 个轴灯和可选底灯。

---

## 9. 从可行到可用还缺什么

按投入产出比排序：

1. **桥接程序**  
   连接 `codex app-server`，维护最多 6 个线程状态，通过系统 HID API 向 usage page
   `0xFF60` 下发 `0xA2`。Web 页面适合人工调试，不适合作为长期 daemon。

2. **灯位绑定与状态机**  
   先实现固定 6 槽或最近活动 6 线程；实现 working、completeUnread、
   requiresInput、error、idle、offline 六态。

3. **心跳与 fail-safe**  
   扩展协议加入 hello/version/capabilities 和心跳。超时后释放 Codex 接管区，
   恢复用户灯效，避免一直显示过期审批或错误。

4. **接管区域与仲裁**  
   明确 Codex 只接管顶排 6 轴灯和可选底灯；`&led_next` 不应覆盖状态区，
   Codex 也不应清空其余 16 颗用户灯。

5. **完成状态确认**  
   定义按下对应 Agent Key、线程重新开始或桌面端确认已读时，何时把绿色未读状态
   清回 idle。

6. **键位映射**  
   新建专用 Codex 图层，不必破坏当前普通键盘层；先完成命令快捷键和编码器推理映射。

7. **每像素动画**  
   这是增强项，不应阻塞第一版。静态 RGB 已能覆盖 Micro 公开的核心状态语义。

---

## 10. 最终归档

### A — 可行

- 6 个线程一一对应 6 个 RGB Agent Key。
- 白/蓝/绿/琥珀/红/灭状态色。
- 22 个键上的常用 Codex 快捷操作。
- 编码器调整推理强度、按下打开模型/推理选择器。
- 6 个及更多 ZMK 图层。
- LED 图层指示。
- 底灯全局聚合告警。

其中状态相关能力需要新增本机桥接程序；当前仓库只完成了 LED 通道。

### B — 受限

- Agent Key 单击/双击切线程：可用快捷键和宏近似，窗口语义不完全相同。
- 固定任务/agent 绑定：灯槽可由桥接维护，按键切换接口仍受 Codex API 限制。
- 四向 Skill：可用 4 键替代摇杆，但直接触发能力需验证 app-server。
- 监听 ambient：灯具备，语音状态源不稳定。
- 线程状态动画：静态色完整；当前只有全局动画，没有逐线程动画。
- 连接：只在左板 USB 下工作。
- 可靠性：无确认回包、协议握手、心跳、状态持久化和原子全量提交。

### C — 不可行

- 被 ChatGPT Desktop 当作官方 Codex Micro 原生识别。
- Codex 设置页原生改键、官方 agent/workflow 对象绑定。
- Composer 原生旋钮焦点导航。
- 官方 Agent Key 的精确窗口前置/不前置交互。
- 物理触摸传感器、平面摇杆和亚克力边框本身。
- 当前方案下的 AppSense。
- 蓝牙下沿用现有 WebHID/Raw HID 状态灯链路。

---

## 11. 证据与相关文档

Planckeys 当前实现：

- [`led-web-control.md`](./led-web-control.md)：28 颗灯的拓扑、协议、构建与真机验收。
- [`../src/led_control.c`](../src/led_control.c)：逐颗 RGB、全局模式、亮度和 Raw HID 实现。
- [`../tools/led-web/index.html`](../tools/led-web/index.html)：WebHID 下发与灯位映射。
- [`../config/planck_left.keymap`](../config/planck_left.keymap)：22 键与编码器当前映射。
- [`README.md`](./README.md)：改造总览与 backlog。

Codex Micro 对照资料：

- `planck-boy-color/docs/codex-micro/codex-micro-capabilities.md`：原生能力基准。
- `planck-boy-color/docs/codex-micro/codex-micro-parity.md`：3 单色 LED 条件下的旧评估；
  其中状态灯结论不适用于 Planckeys 的 28 RGB 硬件。
- `planck-boy-color/docs/codex-micro/codex-agent-loop-hooks-app-server.md`：
  app-server 事件、hooks 和审批状态来源。
- [shuhari04/arkey](https://github.com/shuhari04/arkey)：app-server 到键盘 RGB 的同类路线；
  其自有代码为 PolyForm Noncommercial，本文只借鉴事件映射和架构思路，不主张复制代码。
