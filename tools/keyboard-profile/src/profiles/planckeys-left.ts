import { deriveAgentZones, flattenAxisIndices } from "../derive.js";
import type { DeviceMatchInfo, KeyboardProfile } from "../types.js";

/** 底灯（正面不可见），链上 index 0..5。 */
export const PLANCKEYS_LEFT_UNDERGLOW = [0, 1, 2, 3, 4, 5] as const;

/**
 * 轴灯排布（键盘旋成竖向 4 列 × 6 行）。`null` = 该格无灯。
 *
 *   c0  c1  c2  c3
 *   10  21  22   6   r0
 *   11  20  23   7   r1
 *   12  19  24   8   r2
 *   13  18  25   9   r3
 *   14  17  26   ·   r4
 *   15  16  27   ·   r5
 */
export const PLANCKEYS_LEFT_AXIS_LAYOUT: readonly (number | null)[][] = [
  [10, 21, 22, 6],
  [11, 20, 23, 7],
  [12, 19, 24, 8],
  [13, 18, 25, 9],
  [14, 17, 26, null],
  [15, 16, 27, null],
];

/**
 * Studio keyPosition -> WS2812 chain index。
 * 与 left_physical_layout 顺序及 AXIS_LAYOUT 对齐。
 */
export const PLANCKEYS_LEFT_KEY_TO_LED: readonly number[] = [
  15, 14, 13, 12, 11, 10,
  16, 17, 18, 19, 20, 21,
  27, 26, 25, 24, 23, 22,
  9, 8, 7, 6,
];

const nameLooksLikePlanckeys = (info: DeviceMatchInfo): boolean => {
  const label = `${info.name ?? ""} ${info.productName ?? ""}`;
  // 兼容历史/新拼写：Planckeys、Planckeys、Planck Keys（大小写不敏感）。
  return /planck\s*k?eys/i.test(label);
};

export const PLANCKEYS_LEFT_PROFILE: KeyboardProfile = {
  id: "planckeys-left",
  displayName: "Planckeys Left",
  match: nameLooksLikePlanckeys,
  hidUsagePage: 0xff60,
  ledCount: 28,
  axisLayout: PLANCKEYS_LEFT_AXIS_LAYOUT,
  underglowIndices: PLANCKEYS_LEFT_UNDERGLOW,
  keyPositionToLedIndex: PLANCKEYS_LEFT_KEY_TO_LED,
  axisIndices: flattenAxisIndices(PLANCKEYS_LEFT_AXIS_LAYOUT),
  agentZones: deriveAgentZones(PLANCKEYS_LEFT_AXIS_LAYOUT),
};
