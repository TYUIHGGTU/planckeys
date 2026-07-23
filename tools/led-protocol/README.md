# @planckeys/led-protocol

Planckeys Raw HID **线材协议**单一真源：命令字、`LedMode` / `LedZone` / `Rgb` /
`ZoneConfig`，以及报文打包函数。

LED 几何（`AXIS_LAYOUT` / `LED_COUNT` / `UNDERGLOW_INDICES` / `USAGE_PAGE`）已迁至
[`@planckeys/keyboard-profile`](../keyboard-profile)；本包短期仍再导出这些常量以保持兼容，
新代码请直接依赖 keyboard-profile。

必须与固件 `src/led_control.c` 对齐。

## 使用

```ts
import { buildConfigReport, LedMode } from "@planckeys/led-protocol";
import { DEFAULT_PROFILE } from "@planckeys/keyboard-profile";
```

## 构建

```bash
pnpm --filter @planckeys/led-protocol build
```
