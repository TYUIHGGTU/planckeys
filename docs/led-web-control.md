# 网页控制 WS2812 灯带（planck_left）

自研模块**独占** planck_left 的 WS2812 灯带（轴灯 + 底灯，单条链），实现：

- 网页（WebHID，经 USB）**每颗独立 RGB**；
- 内建预设灯效：**常亮 / 呼吸 / 跑马 / 熔灭 / 关灯**；
- keymap 里 `&led_next` 键**循环切换**上述预设。

同时**关闭 ZMK 内建 underglow**，避免两者争抢同一条灯带。

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
- 动画由一个 `k_work_delayable` 定时器以 `CONFIG_PLANCKEYS_LED_FRAME_MS`（默认 33ms ≈ 30fps）驱动；静态模式（常亮/关灯/逐颗）只渲染一次，不占用定时器（省电）。

### 下行协议（主机 → 键盘，32 字节，无 report id）

| opcode | 含义 | 字节布局 |
| ------ | ---- | -------- |
| `0xA1` CONFIG | 设模式+基色+亮度+速度 | `[1]=mode [2]=R [3]=G [4]=B [5]=brightness [6]=speed` |
| `0xA2` PIXELS | 设一段像素（进入逐颗模式） | `[1]=offset [2]=count`，之后每颗 3 字节 RGB（每包最多 9 颗） |
| `0xA3` BRIGHTNESS | 只改亮度 | `[1]=brightness` |

`mode`：`0=关灯 1=常亮 2=呼吸 3=跑马 4=熔灭 5=逐颗`。28 颗全量逐颗需 4 个 `0xA2` 包（28/9）。

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
3. **Chrome / Edge** 打开 `tools/led-web/index.html`，点「连接键盘」，选 `PlanckKeys L`。
4. 选预设、调基色/亮度/速度，或在下方格子里逐颗上色。
5. 键盘上：同板 combo（左上三键）进系统层，按 `&led_next` 循环切换预设。

## 可调项

- `config/planck_left.conf`：`CONFIG_PLANCKEYS_LED_DEFAULT_BRIGHTNESS`、（Kconfig）`PLANCKEYS_LED_FRAME_MS`。
- 灯带颗数取自 dts 的 `chain-length`（当前 28）。若实际颗数不同，改 dts；网页里 `LED_COUNT` 需同步。
- `PLANCKEYS_LED_UNDERGLOW_START`（默认 22）与网页 `UNDERGLOW_START`：仅用于观感/UI 区分轴灯与底灯。

## 待 PCB 作者确认（不阻塞基础功能）

从固件层面推断：两块板 dts 各只有**一个** `ws2812@0` 节点、数据线只有一根（`spi3` MOSI = P0.13），且 `chain-length=28` 恰等于「22 颗轴灯（每键一颗）+ 6 颗底灯」。因此判断是**单条链 28 颗**。仍需作者确认：

1. 实际总颗数是否为 28；
2. 链路顺序：index 0 从哪颗键起、22 颗轴灯走线顺序、6 颗底灯插在链路哪一段。

以上只影响「跑马方向是否顺眼」「网页 UI 把哪几颗标成底灯」等观感；逐颗 RGB 与预设的基础功能不受影响。确认后改 `chain-length` / `UNDERGLOW_START` 即可。

## 已知限制 / 风险

- 需 Chrome/Edge + USB；Firefox/Safari 无 WebHID。蓝牙下 WebHID 不可用。
- `config/west.yml` 的 `zmk` 跟 `main`，上游破坏性变更可能影响构建；稳定后建议固定版本。
- 左板同时开了 `ZMK_STUDIO`（USB CDC）与第二 HID 接口（Raw HID）。nRF52840 USB 端点有限，若真机出现 USB 枚举异常，可临时在 `planck_left.conf` 关掉 `CONFIG_ZMK_STUDIO`。
- `build.yaml` 中 `planck_left` 的两个 `snippet:` 是重复键（YAML 只保留后者），这是改造前就有的情况，未在本次改动。
- 因无法本地完整构建，行为/灯效需 CI 构建 + 真机验证。
