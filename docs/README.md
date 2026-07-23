# planckeys 改造记录（总览）

本目录记录本次对 planckeys 的两项改造。**均已真机验收通过。**

1. **拆成两台独立键盘**：从「左主右从分体」改为两块各自独立、可单独连电脑的完整键盘。
2. **WS2812 灯带网页控制**：自研 ZMK 模块**独占**左板灯带（轴灯 + 底灯），实现网页每颗独立 RGB + 预设灯效（常亮/呼吸/跑马/熔灭/关灯）+ keymap 循环键。

## 文档索引

| 文档 | 内容 |
|------|------|
| [`split-to-independent.md`](./split-to-independent.md) | 分体 → 两台独立键盘的原理与逐项改动（矩阵变换、物理布局、keymap、json、conf） |
| [`led-web-control.md`](./led-web-control.md) | 自研模块接管 WS2812 + 网页控灯：架构、下行协议、涉及文件、**构建踩坑记录**、使用步骤 |
| [`codex-micro-parity.md`](./codex-micro-parity.md) | 基于 28 颗独立 RGB LED 评估 Planckeys 对 Codex Micro 的可行、受限与不可行能力 |
| [`codex-cdp-developer-mode.md`](./codex-cdp-developer-mode.md) | Codex 26.609 Developer mode（完整 CDP）：用法、CLI MCP 路径、与 led-web / codex-bridge 的结合 |
| [`led-matrix-interactions.md`](./led-matrix-interactions.md) | 左板 4×6 点阵交互：字模、任务序号、贪吃蛇、状态映射 |
| [`led-web-keymap-studio.md`](./led-web-keymap-studio.md) | 对照 ZMK Studio：改键 + LED 整合为 React/TS 控制台（`tools/console`）的可行性、Web 工程方案与分阶段计划 |

---

## 一、为什么这么做（关键决策）

- **一条 WS2812 只能有一个驱动者。** ZMK 内建 underglow（`rgb_underglow.c`）与「网页每颗独立 RGB」都要写同一个 SPI 设备，二者并存必然打架。因此**关闭内建 underglow（`CONFIG_ZMK_RGB_UNDERGLOW=n`）**，由自研模块成为灯带唯一驱动者；keymap 不再用 `&rgb_ug`，改用自定义 behavior `&led_next` 循环切预设。
- **先拆独立、再控灯是正向协同。** 独立后左板是自己的 USB HID 设备、独占自己的灯带，网页（WebHID over USB）可直接控制；无需处理分体链路上的灯同步。
- **本次只做左板网页控灯**；右板保留 ZMK 内建 underglow，行为不变（模块已按 `CONFIG_PLANCKEYS_LED_CONTROL` 守卫，右板不启用）。

## 二、改动文件总览

### 分体 → 独立
- `config/boards/arm/planck/Kconfig.defconfig`：去掉 `ZMK_SPLIT` / `ZMK_SPLIT_ROLE_CENTRAL`，左右各设蓝牙名 `Planckeys L` / `Planckeys R`。
- `config/boards/arm/planck/planck.dtsi`：合并 12 列 44 键变换 → 每板 6 列 22 键；44 键物理布局下放到各板。
- `config/boards/arm/planck/planck_left.dts` / `planck_right.dts`：各自 22 键旋转 90° 物理布局；右板去 `col-offset`、覆盖底排 map；各留本侧编码器。
- `config/planck_left.keymap` / `planck_right.keymap`（新增）：各 22 键 + nav 层 + BLE 系统层 + 同板 combo 入口；删除共享 `config/planck.keymap` 与 `config/boards/arm/planck/planck.keymap`。
- `config/planck_left.json` / `planck_right.json`（新增）：keymap-editor 布局，各 22 键、旋转、单编码器；删除 `config/planck.json`。
- `config/planck_left.conf` / `planck_right.conf`（新增）：拆分并迁移睡眠/发射功率等；删除失效的 `config/planck.conf`。

### WS2812 网页控灯（自研模块，仓库根即模块）
- `zephyr/module.yml`、`CMakeLists.txt`、`Kconfig`（仓库根，新增）：ZMK 模块入口 + 配置项。
- `src/led_control.c`（新增）：独占灯带；Raw HID 协议（纯色/逐颗/亮度）+ 预设灯效 + ext_power + 动画定时器。
- `src/behavior_led_next.c` + `dts/bindings/behaviors/planckeys,behavior-led-next.yaml`（新增）：`&led_next` 循环切预设。
- `include/planckeys_led.h`（新增）：模块对外 API。
- `dts/bindings/vendor-prefixes.txt`（新增）：消除 `planckeys` 厂商前缀告警。
- `config/planck_left.conf`：关内建 underglow + 开 `LED_STRIP`/`SPI` + Raw HID（第二 HID 接口）+ 本模块。
- `config/west.yml`：新增 `zzeneg/zmk-raw-hid` 依赖。
- `tools/led-web/index.html`（新增）：WebHID 控制台（预设 + 28 颗逐颗 RGB + 亮度/速度）。
- `.github/workflows/build.yml`：把仓库根模块文件纳入 CI 触发路径。

## 三、参考资料

- 参考项目 **planck-boy-color**（同系列、已完成同类改造）：
  - `planck-boy-color/docs/split-to-independent.md`（分体 → 独立的通用配方；注意其为「全直连 GPIO」，planckeys 是「真矩阵」，矩阵部分按矩阵方式适配）。
  - `planck-boy-color/docs/led-web-control.md`（Raw HID + WebHID 控灯思路；注意其驱动 3 颗 GPIO LED，planckeys 是 WS2812 灯带，驱动方式不同）。
- ZMK 官方文档：Config Overview（`<board>.keymap` / `<board>.conf` 命名与查找）、Physical Layouts、New Behavior / Module Creation。
- 社区模块 [`zzeneg/zmk-raw-hid`](https://github.com/zzeneg/zmk-raw-hid)：usage page `0xFF60` 的 Raw HID 传输层。
- Zephyr：`led_strip` API（`led_strip_update_rgb` / `struct led_rgb`）、WS2812 SPI 驱动（`worldsemi,ws2812-spi`）。
- ZMK 外部电源 API：`<drivers/ext_power.h>`（`main` 已从旧的 `zmk/ext_power.h` 迁走）。

## 四、构建踩坑速查

详见 [`led-web-control.md` 的「构建踩坑记录」](./led-web-control.md#构建踩坑记录实测得出务必留意)：

1. 不要手写 `CONFIG_WS2812_STRIP=y`（该符号不存在）；用 `CONFIG_LED_STRIP=y` 让驱动按 DT 自动编入。
2. `zmk/ext_power.h` 已删除 → 改用 `<drivers/ext_power.h>` + `device_get_binding("EXT_POWER")`。

---

## 五、后续优化点（backlog，按价值/成本粗排）

- ~~确认灯带真实拓扑~~ **已确认**：单条链 28 颗，index 0..5 = 底灯、index 6..27 = 轴灯（每键一颗）；轴灯↔按键映射见 [`led-web-control.md` 灯带映射](./led-web-control.md#灯带映射已确认)。网页 `AXIS_LAYOUT` / `UNDERGLOW_INDICES` 已按此映射。
- **断电记忆。** 用 NVS/settings 保存并在重启后恢复上次的预设 / 颜色 / 亮度（当前重启回到默认常亮）。
- **对称支持右板网页控灯。** 为 `planck_right.conf` 加同样配置、右板 keymap 加 `&led_next` 与 behavior 节点即可（模块已通用）。
- **固定上游版本。** `config/west.yml` 里 `zmk` / `zmk-raw-hid` 目前跟 `main`；本次两处踩坑正是 `main` 变动导致。稳定后建议 pin 到发布版/具体 commit。
- **更丰富灯效 / 参数。** 每颗独立动画、渐变色、方向可选；下行协议可加「查询当前状态」等命令字。
- **状态显示。** 用灯带上几颗像素显示电量 / 蓝牙连接状态（类似参考项目的状态闪烁，但用 RGB 像素）。
- **蓝牙控灯。** WebHID 仅 USB 可用；若要蓝牙可控，需本地程序走系统 HID API 或 BLE GATT，成本与不确定性较高。
- **keymap 手感微调。** 右板拇指 `&mo 1` 的位置、进系统层的 combo 键位（当前左上三键 `<0 6 12>`）可按实际手感调整。
- **清理项。** `build.yaml` 中 `planck_left` 重复的 `snippet:` 键；以及 `SOC_DCDC_NRF52X` / `KSCAN` / `BT_CTLR` 等 deprecated 告警（低优先）。详见 [`led-web-keymap-studio.md`](./led-web-keymap-studio.md) Phase 0。
- **USB 端点余量。** 左板 Studio(CDC) + 第二 HID 并存，若后续加更多 USB 功能需留意 nRF52840 端点上限。
- **统一控制台（改键 + LED）。** 新建 `tools/console`（React + TS + Vite），迁入 led-web，并接入官方 Studio RPC（Web Serial）。计划见 [`led-web-keymap-studio.md`](./led-web-keymap-studio.md)。
