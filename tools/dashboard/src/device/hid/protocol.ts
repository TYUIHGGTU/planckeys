/**
 * dashboard HID 协议薄封装。
 *
 * 线材协议来自 `@planckeys/led-protocol`；板载几何来自
 * `@planckeys/keyboard-profile`（默认 planckeys-left）。
 */
export * from "@planckeys/led-protocol";

import { DEFAULT_PROFILE } from "@planckeys/keyboard-profile";

/** @deprecated 请用当前 KeyboardProfile.axisIndices */
export const AXIS_INDICES: readonly number[] = DEFAULT_PROFILE.axisIndices;
