import { PLANCKEYS_LEFT_PROFILE } from "./profiles/planckeys-left.js";
import type { DeviceMatchInfo, KeyboardProfile } from "./types.js";

/** 已注册的 LED / HID profile（按匹配优先级排列）。 */
export const PROFILES: readonly KeyboardProfile[] = [PLANCKEYS_LEFT_PROFILE];

/** 未连接 Studio、或本地默认灯效画布时使用的 profile。 */
export const DEFAULT_PROFILE: KeyboardProfile = PLANCKEYS_LEFT_PROFILE;

/**
 * 按设备信息解析 profile。无匹配返回 null（表示仅支持改键、无灯效描述）。
 */
export const resolveProfile = (
  info: DeviceMatchInfo,
): KeyboardProfile | null => {
  for (const profile of PROFILES) {
    if (profile.match(info)) return profile;
  }
  return null;
};

/** 按 HID usage page 找第一个 profile（agent-bridge 枚举设备时用）。 */
export const profileForUsagePage = (
  usagePage: number,
): KeyboardProfile | null =>
  PROFILES.find((p) => p.hidUsagePage === usagePage) ?? null;
