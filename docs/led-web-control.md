# 网页控制 WS2812 灯带（planck_left）

自研模块**独占** planck_left 的 WS2812 灯带（轴灯 + 底灯，单条链），实现：

- 网页（WebHID，经 USB）**每颗独立 RGB**；
- 轴灯与底灯可独立设置：**常亮 / 呼吸 / 跑马 / 熔灭 / 关灯**、亮度和速度；
- keymap 里 `&led_next` 键**循环切换**上述预设。

同时**关闭 ZMK 内建 underglow**，避免两者争抢同一条灯带。

> **颜色与灯效解耦（关键设计）**：颜色只由「每颗基色画布」决定（网页/配色方案写入），
> 预设模式只决定在画布之上如何做动画（整体呼吸、窗口跑马、亮度波……）。因此
> 「配色方案（多色）+ 预设」能让方案的多种颜色一起动，而不会被压成单一颜色。
> 早期版本预设只带一个全局基色，选完配色再选预设会变成单色——已通过此设计修复。

## 为什么要自研模块接管，而不是用内建 underglow

一条 WS2812 只能有一个驱动者。ZMK 内建 underglow（`rgb_underglow.c`）和「网页每颗独立 RGB」都要调 `led_strip_update_rgb()` 写同一个 SPI 设备，二者并存必然打架。因此本方案：

- `config/planck_left.conf` 里 `CONFIG_ZMK_RGB_UNDERGLOW=n`（覆盖 board defconfig 的 `=y`）；
- 由自研模块 `src/led_control.c` 成为灯带唯一驱动者；
- keymap 不再用 `&rgb_ug`，改用自定义 behavior `&led_next`（灯效控制仍在 keymap，只是走自研模块）。

## 原理

```
网页(WebHID) --32字节 report--> USB(HID 0xFF60) --> zmk-raw-hid 模块
    --> raw_hid_received_event --> src/led_control.c
    --> 每帧 compute_frame() --> led_strip_update_rgb() 驱动 WS2812
&led_next 键 --> src/behavior_led_next.c --> planckeys_led_cycle_preset()
```

- 传输层用社区模块 [`zzeneg/zmk-raw-hid`](https://github.com/zzeneg/zmk-raw-hid)，usage page `0xFF60`，主机经 `SET_REPORT` 下发。
- 仓库根是一个 ZMK 模块（`zephyr/module.yml` + `CMakeLists.txt` + `Kconfig` + `src/` + `dts/bindings/`），CI 自动作为 `ZMK_EXTRA_MODULES` 编入。
- 灯带经 `EXT_POWER`（左 gpio1.6）供电；内建 underglow 关闭后没人开电，所以模块在初始化时主动 `ext_power_enable()`，并延后 200ms 渲染首帧（等供电建立）。
- 动画由一个 `k_work_delayable` 定时器以 `CONFIG_PLANCKEYS_LED_FRAME_MS`（默认 33ms ≈ 30fps）驱动；静态模式（常亮/关灯）只渲染一次，不占用定时器（省电）。

### 下行协议（主机 → 键盘，32 字节，无 report id）

| opcode | 含义 | 字节布局 |
| ------ | ---- | -------- |
| `0xA1` CONFIG | 设模式/亮度/速度（**只改动画，不动颜色**） | `[1]=mode [2]=brightness [3]=speed` |
| `0xA2` PIXELS | 写画布一段（**不改模式**） | `[1]=offset [2]=count`，之后每颗 3 字节 RGB（每包最多 9 颗） |
| `0xA3` BRIGHTNESS | 只改亮度 | `[1]=brightness` |
| `0xA4` FILL | 用单色铺满整块画布 | `[1]=R [2]=G [3]=B` |
| `0xA5` ZONE_CONFIG | 独立设置轴灯/底灯模式、亮度和速度 | `[1]=zone [2]=mode [3]=brightness [4]=speed` |

`mode`：`0=关灯 1=常亮 2=呼吸 3=跑马 4=熔灭`。28 颗全量逐颗需 4 个 `0xA2` 包（28/9）。
`zone`：`0=轴灯（index 6..27） 1=底灯（index 0..5）`。旧 `0xA1`/`0xA3`
仍同时更新两个分区，旧网页和桥接工具保持兼容；新版 Dashboard 连接时先发旧配置初始化，
再用 `0xA5` 恢复两个分区的独立状态。

> 网页交互模型：色块/自定义色只切换「画笔颜色」；点格子或「填基色」/配色方案才写入
> 画布（`0xA2`）；点预设只发 `0xA1`（保留画布颜色）。连接时网页先把画布同步给键盘，
> 颜色以网页为准。

## 涉及文件

| 文件 | 作用 |
| ---- | ---- |
| `config/west.yml` | 新增 `zzeneg/zmk-raw-hid` 依赖 |
| `zephyr/module.yml` | 让仓库根成为 ZMK 模块（含 `dts_root` 供自定义 behavior 绑定） |
| `CMakeLists.txt` / `Kconfig`（仓库根） | 模块构建入口与配置项 `PLANCKEYS_LED_CONTROL` 等 |
| `src/led_control.c` | 核心：收 Raw HID + 预设灯效 + 逐颗 RGB + ext_power |
| `src/behavior_led_next.c` | `&led_next` behavior 驱动，调 `planckeys_led_cycle_preset()` |
| `include/planckeys_led.h` | 模块对外 API |
| `dts/bindings/behaviors/planckeys,behavior-led-next.yaml` | `&led_next` 的 DTS 绑定 |
| `config/planck_left.conf` | 关内建 underglow + 开 WS2812 驱动 + Raw HID + 本模块 |
| `config/planck_left.keymap` | 系统层放 `&led_next` |
| `.github/workflows/build.yml` | 把仓库根模块文件纳入 CI 触发路径 |
| `tools/led-web/index.html` | WebHID 控制网页（预设 + 每颗 RGB + 亮度/速度） |

## 只改了左板

- 全部开关在 `config/planck_left.conf`。右板 `planck_right` 保留 ZMK 内建 underglow，行为不变。
- 模块用 `CONFIG_PLANCKEYS_LED_CONTROL` 守卫，右板不启用。如需右板也网页控灯，为 `planck_right.conf` 加同样配置、右板 keymap 加 `&led_next` 与 behavior 节点即可（模块已通用）。

## 使用步骤

1. 推到 GitHub，Actions 自动构建，取 `planck_left` 的 `.uf2` 刷入左板（进 bootloader 一般双击复位）。
2. 用 **USB 线**连左板到电脑（WebHID + Raw HID 只在 USB 下可靠，蓝牙不支持）。
3. **Chrome / Edge** 打开 `tools/led-web/index.html`，点「连接键盘」，选 `Planckeys L`。
4. 选预设、调基色/亮度/速度，或在下方格子里逐颗上色。
5. 键盘上：同板 combo（左上三键）进系统层，按 `&led_next` 循环切换预设。

## 可调项

- `config/planck_left.conf`：`CONFIG_PLANCKEYS_LED_DEFAULT_BRIGHTNESS`、（Kconfig）`PLANCKEYS_LED_FRAME_MS`。
- 灯带颗数取自 dts 的 `chain-length`（当前 28）。若实际颗数不同，改 dts；网页里 `LED_COUNT` 需同步。
- 轴灯/底灯映射见下节「灯带映射」；网页在 `AXIS_LAYOUT` / `UNDERGLOW_INDICES` 里定义，Kconfig `PLANCKEYS_LED_AXIS_START`（默认 6）仅供观感/日志。

## 灯带映射（已确认）

单条链共 28 颗（`spi3` MOSI = P0.13，一根数据线）：

- **index 0..5 = 底灯**（6 颗，正面不可见）。
- **index 6..27 = 轴灯**（22 颗，每键一颗）。

轴灯 index 与按键的正面对应关系（6 列 × 4 行，与网页「轴灯」区一致）：

```
15 14 13 12 11 10
16 17 18 19 20 21
27 26 25 24 23 22
      9  8  7  6      (左下两格无键)
```

网页 `tools/led-web/index.html` 的 `AXIS_LAYOUT` / `UNDERGLOW_INDICES` 已按此映射；
若更换 PCB 或灯带顺序变化，改这两处（及 dts `chain-length`）即可。

## 构建踩坑记录（实测得出，务必留意）

在 ZMK `main` + Zephyr 4.1 上，本方案踩到两个坑，均已修复：

1. **`WS2812_STRIP` 不是可手动赋值的符号。** 一开始在 `planck_left.conf` 写了
   `CONFIG_WS2812_STRIP=y`，报 `undefined symbol WS2812_STRIP` 并因「Kconfig 告警即错误」
   直接中止。正确做法：只需 `CONFIG_LED_STRIP=y`，`worldsemi,ws2812-spi` 驱动会由
   devicetree 节点自动编入（右板内建 underglow 也走同一路径，只 `select LED_STRIP`）。
   根 `Kconfig` 里也**不要** `select WS2812_STRIP`。
2. **外部电源头文件已迁移。** ZMK `main` 已删除 `zmk/ext_power.h`（旧路径 404），
   API 迁到 **`<drivers/ext_power.h>`**，`ext_power_enable/disable/get` 签名不变；
   设备用 `device_get_binding("EXT_POWER")` 获取（与 ZMK 自带 `&ext_power` behavior 一致）。

另外还有若干**无害告警**（右板同样有、不影响构建）：`LOG_PROCESS_THREAD_STARTUP_DELAY_MS`
未生效、`SOC_DCDC_NRF52X` / `KSCAN` / `BT_CTLR` 已弃用等。

> 状态：左板已成功构建，并**真机验收通过**（预设灯效、逐颗 RGB、`&led_next` 循环、网页控制均正常）。

## 已知限制 / 风险

- 需 Chrome/Edge + USB；Firefox/Safari 无 WebHID。蓝牙下 WebHID 不可用。
- `config/west.yml` 的 `zmk` / `zmk-raw-hid` 跟 `main`，上游破坏性变更可能影响构建（本次的两个坑正是 `main` 变动导致）；稳定后建议在 `west.yml` 固定版本。
- 左板同时开了 `ZMK_STUDIO`（USB CDC）与第二 HID 接口（Raw HID）。nRF52840 USB 端点有限，若真机出现 USB 枚举异常，可临时在 `planck_left.conf` 关掉 `CONFIG_ZMK_STUDIO`。
- `build.yaml` 中 `planck_left` 的两个 `snippet:` 是重复键（YAML 只保留后者），这是改造前就有的情况，未在本次改动。
