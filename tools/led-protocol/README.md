# @planckeys/led-protocol

PlanckKeys 左板 Raw HID 协议的**单一真源**（usage page `0xFF60`）：线材协议常量、板载布局
（`AXIS_LAYOUT` / `LED_COUNT` / `UNDERGLOW_INDICES`）、`LedMode` / `LedZone` / `Rgb` /
`ZoneConfig` 类型，以及报文打包函数（`buildConfigReport` / `buildFillReport` /
`buildZoneConfigReport`（重载兼容对象式与四参式）/ `buildPixelReport` /
`buildAllPixelReports` / `buildPixelReports` / `buildSparsePixelReports`）。

必须与固件 `src/led_control.c` 对齐。各消费方特有的「渲染 / 布局解读」常量不放这里，由各自
保留（agent-bridge 的仪表盘点阵、dashboard 的 `AXIS_INDICES`）。

## 使用

工作区内其它包以 `workspace:*` 依赖它：

```ts
import { buildConfigReport, LedMode } from "@planckeys/led-protocol";
```

## 构建

作为 pnpm monorepo 的一员，通常在 `tools/` 根 `pnpm -r build` 时按拓扑先构建本包。单独构建：

```bash
pnpm --filter @planckeys/led-protocol build
```
