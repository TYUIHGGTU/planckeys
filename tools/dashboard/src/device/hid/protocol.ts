/**
 * PlanckKeys 左板 Raw HID 协议（usage page 0xFF60）。
 *
 * 「线材协议 + 板载布局 + 报文打包」核心复用工作区单源包 `@planckeys/led-protocol`，
 * 避免与固件 / agent-bridge 各维护一份而漂移。dashboard 只在这里额外保留自己的
 * 布局解读常量（AXIS_INDICES）。
 */
export * from "@planckeys/led-protocol";

import { AXIS_LAYOUT } from "@planckeys/led-protocol";

/** 所有有灯的轴灯链上 index（按 AXIS_LAYOUT 展平、去空）。 */
export const AXIS_INDICES: readonly number[] = AXIS_LAYOUT.flat().filter(
  (x): x is number => x !== null,
);
