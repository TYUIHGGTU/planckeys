/**
 * 键盘设备 profile：LED 几何、键→灯映射、设备匹配。
 * 物理键位布局不在此包——由 ZMK Studio RPC `getPhysicalLayouts` 提供。
 */

export type {
  AgentZones,
  DeviceMatchInfo,
  KeyboardProfile,
  MatrixCell,
} from "./types.js";

export {
  deriveAgentZones,
  flattenAxisIndices,
  ledIndexForKeyPosition,
} from "./derive.js";

export {
  PLANCKEYS_LEFT_AXIS_LAYOUT,
  PLANCKEYS_LEFT_KEY_TO_LED,
  PLANCKEYS_LEFT_PROFILE,
  PLANCKEYS_LEFT_UNDERGLOW,
} from "./profiles/planckeys-left.js";

export {
  DEFAULT_PROFILE,
  PROFILES,
  profileForUsagePage,
  resolveProfile,
} from "./registry.js";
