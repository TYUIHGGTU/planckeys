# 把 planckeys 分体键盘改造成两台独立键盘

本文记录把 planckeys 从「左主右从的分体键盘」改造成「两台各自独立、可单独连电脑的键盘」的过程。整体思路参考自 `planck-boy-color/docs/split-to-independent.md`，但 planckeys 用的是**真矩阵 kscan（4 行 × 6 列 + 复合直连编码器键）**，与参考项目的「全直连 GPIO」结构不同，所以矩阵/变换部分是按矩阵方式适配的，不能照抄。

- 硬件：`planck_left` / `planck_right`（两块 nRF52840，各带 EC11 编码器与一条 WS2812 灯带）。
- 改造前：`planck_left` 是中央机，`planck_right` 是外设，右板经蓝牙把按键发给左板。
- 改造后：两块板各自是完整 HID 键盘，各自直连电脑、各自管理蓝牙与电量。

---

## 一、关键认知

和参考文档一致：ZMK 里「一套键盘」由三层决定，与目录无关：

1. **board 定义 = 键盘本体**：`board.yml` 已声明 `planck_left` / `planck_right` 两块独立 board。
2. **user config（`config/`）= 每块板的键位与配置**：ZMK 按 **文件名匹配 board 名** 查找 `<board>.keymap` / `<board>.conf`。
3. **`build.yaml` = 产出哪些固件**：每行一次独立编译、一个 UF2。

真正造成「主从依赖」的是 `CONFIG_ZMK_SPLIT` / `ZMK_SPLIT_ROLE_CENTRAL` 两个开关，而不是目录。

> planckeys 改造前的坑：仓库里同时存在 `config/planck.keymap` 与 `config/boards/arm/planck/planck.keymap`，还有 `config/planck.conf`，文件名都不等于 board 名（`planck_left`/`planck_right`）。为消除歧义，本次改造统一改用 `planck_left.*` / `planck_right.*`，并删除这些同名文件。`CONFIG_ZMK_RGB_UNDERGLOW` 等其实是靠 `planck_left_defconfig` / `planck_right_defconfig` 生效的，不是靠 `planck.conf`。

---

## 二、具体改动清单

### 1. 关闭分体开关（`config/boards/arm/planck/Kconfig.defconfig`）

删除 `ZMK_SPLIT` / `ZMK_SPLIT_ROLE_CENTRAL`，左右各设不同蓝牙名：

```
if BOARD_PLANCK_LEFT
config ZMK_KEYBOARD_NAME
        default "PlanckKeys L"
endif

if BOARD_PLANCK_RIGHT
config ZMK_KEYBOARD_NAME
        default "PlanckKeys R"
endif
```

关掉 `ZMK_SPLIT` 后，ZMK 会给两块板都编译 HID / keymap / BLE，两块板都成了完整键盘。

### 2. 矩阵变换拆成每板 22 键（`planck.dtsi` + `planck_right.dts`）

改造前是一个 12 列 44 键的合并变换，右板用 `&default_transform { col-offset = <6>; }` 拼到右半。独立后每块板各 22 键（6 列 × 4 行，底排 4 键）：

- `planck.dtsi` 的 `default_transform` 改为 `columns = <6>; rows = <4>;`，`map` 用**左板**排布（底排在 col 2..5，其中 col 2 是编码器直连键）。
- `planck_right.dts`：**删除 `col-offset`**，改为**覆盖 `map`**（右板底排在 col 0..3，其中 col 3 是编码器直连键）。

> 位置索引会重新编号（0..21）。因此 combo 的 `key-positions` 也要按新排布填。

每块板的复合 kscan（`kscan0` = 矩阵 `kscan1` + 直连编码器键 `kscan2`）保持不变——分体开关只影响 BLE 通信，不影响本板扫描。

### 3. 物理布局下放到各板并旋转 90°（`planck_left.dts` / `planck_right.dts`）

原 44 键的 `matrix_physical_layout` 从 `planck.dtsi` 移除，改为每块板各自 22 键的物理布局，并按竖向手把旋转：

- 逆时针 90°（左）：`new_x = row`，`new_y = (6-1) - col`。
- 顺时针 90°（右）：`new_x = (4-1) - row`，`new_y = col`。

各板 `chosen { zmk,physical-layout }` 指向本板布局。

### 4. 每块板只保留自己的编码器

`planck.dtsi` 的 `sensors` 原本同时列了左右编码器，独立后在各板 `.dts` 覆盖：

```
// planck_left.dts
&sensors { sensors = <&left_encoder>; };
// planck_right.dts
&sensors { sensors = <&right_encoder>; };
```

对应地，每份 keymap 的 `sensor-bindings` 只留 1 条。

### 5. 拆分键位表（`config/planck_left.keymap` / `planck_right.keymap`）

删除共享的 `config/planck.keymap` 与 `config/boards/arm/planck/planck.keymap`，新建两份各 22 键：

- 左板底排：`LCTRL / LALT / &mo 1 / SPACE`（col2 = 编码器按压 = LCTRL）。
- 右板底排：`SPACE / &mo 1 / RCTRL / K_MUTE`（col3 = 编码器按压 = MUTE）。右板原来没有层切换键，这里把一个拇指键设为 `&mo 1`。
- 每块板各加一个 **系统层（layer 2）**：`&bt BT_SEL 0..3`、`&bt BT_CLR`、`&bt BT_CLR_ALL`、`&bootloader`，用于各自管理蓝牙。
- **进入系统层用同板 combo**（跨板组合不可行）：左上三键 `key-positions = <0 6 12>` → `&mo 2`。
- 左板系统层额外放了 `&led_next`（灯效预设循环键，见 `docs/led-web-control.md`）。

### 6. keymap-editor 布局 json（`config/planck_left.json` / `planck_right.json`）

nickcoutsos 的 keymap-editor 按 **keymap 文件名**找同名 json，并**按数组顺序**映射到 keymap 绑定：

- 删除共享 `config/planck.json`，新建 `planck_left.json` / `planck_right.json`。
- 每份 22 格、含旋转坐标、`sensors` 各留本侧编码器。

### 7. conf 拆分（`config/planck_left.conf` / `planck_right.conf`）

删除失效的 `config/planck.conf`，把睡眠/发射功率等迁到各板 conf 确保生效。左板额外做灯带接管与网页控灯（见 `docs/led-web-control.md`）。

---

## 三、改造后文件对照

| 文件 | 改造前 | 改造后 |
|------|--------|--------|
| `Kconfig.defconfig` | 开 `ZMK_SPLIT` + 左为 central | 关分体，左右各设蓝牙名 |
| `config/planck.keymap` / `boards/.../planck.keymap` | 共享/歧义 44 键 | 删除 |
| `config/planck_left.keymap` / `planck_right.keymap` | 无 | 各 22 键 + BLE 层 + combo |
| `config/planck.json` | 共享 | 删除 |
| `config/planck_left.json` / `planck_right.json` | 无 | 各 22 键、旋转、单编码器 |
| `planck.dtsi` | 12 列 44 键变换 + 44 键布局 | 6 列 22 键变换，布局下放各板 |
| `planck_left.dts` / `planck_right.dts` | 引用共享布局；右板 `col-offset=6` | 各自 22 键旋转布局；右板覆盖 map 去偏移；各留本侧编码器 |
| `config/planck.conf` | 失效死配置 | 删除，拆为 `planck_left/right.conf` |

---

## 四、三处键数必须相等

`transform map 位置数 (22) == 物理布局 keys 数 (22) == 每层 keymap 绑定数 (22)`。

左右各自校验通过。

---

## 五、验证

GitHub Actions 按 `build.yaml` 分别编译两块板，产出 `planck_left-zmk.uf2` / `planck_right-zmk.uf2`，各自刷入对应板，并分别与电脑配对。

> 状态：两块板均已成功构建，并**真机验收通过**——各自能独立连电脑打字、22 键位置无错位、编码器旋转/按压正常、同板 combo 可进系统层管理蓝牙。
