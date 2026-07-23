# @planckeys/keyboard-profile

键盘设备 **LED / HID profile** 的单一真源。物理键位几何仍由固件经 ZMK Studio RPC
（`getPhysicalLayouts`）提供；本包只描述 Studio 无法给出的信息：

- Raw HID `usagePage`
- LED 链长度与轴灯/底灯排布
- `keyPosition -> LED index` 映射
- agent-bridge 会话点阵分区

## 使用

```ts
import {
  DEFAULT_PROFILE,
  resolveProfile,
  ledIndexForKeyPosition,
} from "@planckeys/keyboard-profile";

const profile = resolveProfile({ name: "Planckeys L" }) ?? DEFAULT_PROFILE;
const led = ledIndexForKeyPosition(profile.keyPositionToLedIndex, 0);
```

新增键盘：在 `src/profiles/` 增加 profile，并注册进 `PROFILES`。

## 构建

```bash
pnpm --filter @planckeys/keyboard-profile build
```
