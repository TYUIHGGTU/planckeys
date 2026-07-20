const KBD_PAGE = 0x07;
const CONSUMER_PAGE = 0x0c;

export const encodeHidUsage = (page: number, id: number): number =>
  (page << 16) | id;
export const encodeKbUsage = (id: number): number => encodeHidUsage(KBD_PAGE, id);
export const encodeConsumerUsage = (id: number): number =>
  encodeHidUsage(CONSUMER_PAGE, id);

export interface HidUsageOption {
  label: string;
  value: number;
  group: HidUsageGroup;
  search?: string;
}

export type HidUsageGroup =
  | "基础"
  | "字母"
  | "导航"
  | "数字键盘"
  | "ISO/JIS"
  | "媒体";

const kb = (
  label: string,
  id: number,
  group: HidUsageGroup = "基础",
  search?: string,
): HidUsageOption => ({ label, value: encodeKbUsage(id), group, search });

const consumer = (label: string, id: number, search?: string): HidUsageOption => ({
  label,
  value: encodeConsumerUsage(id),
  group: "媒体",
  search,
});

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((label, index) =>
  kb(label, 0x04 + index, "字母"),
);

const digits = ["1 !", "2 @", "3 #", "4 $", "5 %", "6 ^", "7 &", "8 *", "9 (", "0 )"].map(
  (label, index) => kb(label, 0x1e + index),
);

const functionKeys = Array.from({ length: 12 }, (_, index) =>
  kb(`F${index + 1}`, 0x3a + index),
);

export const HID_USAGE_GROUPS: readonly HidUsageGroup[] = [
  "基础",
  "字母",
  "导航",
  "数字键盘",
  "ISO/JIS",
  "媒体",
];

/** USB HID Usage Tables keyboard/consumer catalog used by the candidate shelf. */
export const COMMON_KB_USAGES: readonly HidUsageOption[] = [
  ...letters,
  ...digits,
  kb("Enter", 0x28),
  kb("Esc", 0x29, "基础", "Escape"),
  kb("Bksp", 0x2a, "基础", "Backspace"),
  kb("Tab", 0x2b),
  kb("Space", 0x2c),
  kb("- _", 0x2d),
  kb("= +", 0x2e),
  kb("[ {", 0x2f),
  kb("] }", 0x30),
  kb("\\ |", 0x31),
  kb("; :", 0x33),
  kb("' \"", 0x34),
  kb("` ~", 0x35),
  kb(", <", 0x36),
  kb(". >", 0x37),
  kb("/ ?", 0x38),
  kb("Caps", 0x39, "基础", "Caps Lock"),
  ...functionKeys,
  kb("Print", 0x46, "导航", "Print Screen"),
  kb("Scroll", 0x47, "导航", "Scroll Lock"),
  kb("Pause", 0x48, "导航"),
  kb("Insert", 0x49, "导航"),
  kb("Home", 0x4a, "导航"),
  kb("PgUp", 0x4b, "导航", "Page Up"),
  kb("Delete", 0x4c, "导航"),
  kb("End", 0x4d, "导航"),
  kb("PgDn", 0x4e, "导航", "Page Down"),
  kb("Right", 0x4f, "导航"),
  kb("Left", 0x50, "导航"),
  kb("Down", 0x51, "导航"),
  kb("Up", 0x52, "导航"),
  kb("Num", 0x53, "数字键盘", "Num Lock"),
  kb("KP /", 0x54, "数字键盘"),
  kb("KP *", 0x55, "数字键盘"),
  kb("KP -", 0x56, "数字键盘"),
  kb("KP +", 0x57, "数字键盘"),
  kb("KP Enter", 0x58, "数字键盘"),
  ...Array.from({ length: 9 }, (_, index) =>
    kb(`KP ${index + 1}`, 0x59 + index, "数字键盘"),
  ),
  kb("KP 0", 0x62, "数字键盘"),
  kb("KP .", 0x63, "数字键盘"),
  kb("NUBS", 0x64, "ISO/JIS"),
  kb("Application", 0x65, "基础", "Menu"),
  kb("Power", 0x66, "基础"),
  kb("KP =", 0x67, "数字键盘"),
  kb("F13", 0x68),
  kb("F14", 0x69),
  kb("F15", 0x6a),
  kb("F16", 0x6b),
  kb("F17", 0x6c),
  kb("F18", 0x6d),
  kb("F19", 0x6e),
  kb("F20", 0x6f),
  kb("F21", 0x70),
  kb("F22", 0x71),
  kb("F23", 0x72),
  kb("F24", 0x73),
  kb("NUHS", 0x32, "ISO/JIS"),
  kb("RO", 0x87, "ISO/JIS"),
  kb("KANA", 0x88, "ISO/JIS"),
  kb("YEN", 0x89, "ISO/JIS"),
  kb("HENKAN", 0x8a, "ISO/JIS"),
  kb("MUHENKAN", 0x8b, "ISO/JIS"),
  kb("L Ctrl", 0xe0),
  kb("L Shift", 0xe1),
  kb("L Alt", 0xe2),
  kb("L GUI", 0xe3, "基础", "Command Win Meta"),
  kb("R Ctrl", 0xe4),
  kb("R Shift", 0xe5),
  kb("R Alt", 0xe6),
  kb("R GUI", 0xe7, "基础", "Command Win Meta"),
  consumer("Play/Pause", 0xcd),
  consumer("Stop", 0xb7),
  consumer("Prev", 0xb6, "Previous"),
  consumer("Next", 0xb5),
  consumer("Mute", 0xe2),
  consumer("Vol +", 0xe9, "Volume Up"),
  consumer("Vol −", 0xea, "Volume Down"),
  consumer("Brightness +", 0x6f),
  consumer("Brightness −", 0x70),
  consumer("Calculator", 0x192),
];

const USAGE_LABEL_BY_VALUE = new Map<number, string>();
for (const usage of COMMON_KB_USAGES) {
  if (!USAGE_LABEL_BY_VALUE.has(usage.value)) {
    USAGE_LABEL_BY_VALUE.set(usage.value, usage.label);
  }
}

/** 反查一个编码后的 HID usage 对应的可读标签（找不到返回 null）。 */
export const usageLabel = (value: number): string | null =>
  USAGE_LABEL_BY_VALUE.get(value) ?? null;
