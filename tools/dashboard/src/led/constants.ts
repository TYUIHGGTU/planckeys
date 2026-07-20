import { LedMode } from "../device/hid/protocol";

export const QUICK_COLORS: readonly string[] = [
  "#ffffff",
  "#ff3b30",
  "#ff9500",
  "#ffd60a",
  "#30d158",
  "#64d2ff",
  "#0a84ff",
  "#5e5ce6",
  "#bf5af2",
  "#ff375f",
];

export interface PresetDef {
  mode: LedMode;
  label: string;
}

export const PRESETS: readonly PresetDef[] = [
  { mode: LedMode.Solid, label: "常亮" },
  { mode: LedMode.Breathing, label: "呼吸" },
  { mode: LedMode.Chase, label: "跑马" },
  { mode: LedMode.Melt, label: "熔灭" },
  { mode: LedMode.Off, label: "关灯" },
];

/** 默认画布颜色（冰蓝），与固件默认一致。 */
export const DEFAULT_HEX = "#0040ff";

export const DEFAULT_BRIGHTNESS = 80;
export const DEFAULT_SPEED = 4;

/** 点阵字模（3×5，'1' = 亮）。仅 0–9。 */
export const DIGIT_3X5: Readonly<Record<string, readonly string[]>> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

export const DIGIT_COL0 = 0;
export const DIGIT_MAX = 9;
