/**
 * 少量常用 HID 键码，供 `&kp` 的 param1 使用（MVP）。
 * ZMK Studio 里 `&kp` 的参数是 32 位编码的 HID usage：(usagePage << 16) | id。
 * 键盘/键区 usage page = 0x07。完整键码表留待 W3。
 */
const KBD_PAGE = 0x07;

export const encodeKbUsage = (id: number): number => (KBD_PAGE << 16) | id;

export interface HidUsageOption {
  label: string;
  value: number;
}

const kb = (label: string, id: number): HidUsageOption => ({
  label,
  value: encodeKbUsage(id),
});

/** 常用键（id 取自 USB HID Usage Tables，键盘/键区页）。 */
export const COMMON_KB_USAGES: readonly HidUsageOption[] = [
  kb("A", 0x04),
  kb("B", 0x05),
  kb("C", 0x06),
  kb("D", 0x07),
  kb("E", 0x08),
  kb("F", 0x09),
  kb("Z", 0x1d),
  kb("1", 0x1e),
  kb("2", 0x1f),
  kb("3", 0x20),
  kb("0", 0x27),
  kb("Enter", 0x28),
  kb("Esc", 0x29),
  kb("Backspace", 0x2a),
  kb("Tab", 0x2b),
  kb("Space", 0x2c),
  kb("←", 0x50),
  kb("→", 0x4f),
  kb("↑", 0x52),
  kb("↓", 0x51),
];
