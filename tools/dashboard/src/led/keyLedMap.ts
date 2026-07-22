import {
  DEFAULT_PROFILE,
  ledIndexForKeyPosition as lookup,
  type KeyboardProfile,
} from "@planckeys/keyboard-profile";

/** @deprecated 请用 profile.keyPositionToLedIndex */
export const KEY_POSITION_TO_LED_INDEX = DEFAULT_PROFILE.keyPositionToLedIndex;

export const ledIndexForKeyPosition = (
  keyPosition: number,
  profile: KeyboardProfile = DEFAULT_PROFILE,
): number | null => lookup(profile.keyPositionToLedIndex, keyPosition);
