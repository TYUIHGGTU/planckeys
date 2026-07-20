/**
 * Studio keyPosition -> WS2812 chain index for PlanckKeys Left.
 * Derived from left_physical_layout order and the confirmed AXIS_LAYOUT.
 */
export const KEY_POSITION_TO_LED_INDEX: readonly number[] = [
  15, 14, 13, 12, 11, 10,
  16, 17, 18, 19, 20, 21,
  27, 26, 25, 24, 23, 22,
  9, 8, 7, 6,
];

export const ledIndexForKeyPosition = (
  keyPosition: number,
): number | null => KEY_POSITION_TO_LED_INDEX[keyPosition] ?? null;
