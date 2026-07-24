import { encodeKbUsage } from "./hidUsages";

/** 底部候选区里“传统布局”标签使用的名称。 */
export const BASIC_LAYOUT_TAB = "布局";

export interface BasicLayoutKey {
  label: string;
  /** 已编码的 HID usage（配合 &kp 生成 binding）。 */
  value: number;
}

export interface BasicLayoutGap {
  /** 以“一个键位”为单位的空白宽度（0.5 表示半个键宽）。 */
  gap: number;
}

export type BasicLayoutItem = BasicLayoutKey | BasicLayoutGap;

export const isGap = (item: BasicLayoutItem): item is BasicLayoutGap =>
  "gap" in item;

const k = (label: string, id: number): BasicLayoutKey => ({
  label,
  value: encodeKbUsage(id),
});

/**
 * 传统 104 键键盘的物理排布。所有键位统一渲染为正方形，
 * 键与键之间使用统一间距，不做分区留白。
 */
export const BASIC_LAYOUT_ROWS: readonly BasicLayoutItem[][] = [
  [
    k("Esc", 0x29),
    k("F1", 0x3a),
    k("F2", 0x3b),
    k("F3", 0x3c),
    k("F4", 0x3d),
    k("F5", 0x3e),
    k("F6", 0x3f),
    k("F7", 0x40),
    k("F8", 0x41),
    k("F9", 0x42),
    k("F10", 0x43),
    k("F11", 0x44),
    k("F12", 0x45),
    k("Print", 0x46),
    k("Scroll", 0x47),
    k("Pause", 0x48),
  ],
  [
    k("` ~", 0x35),
    k("1 !", 0x1e),
    k("2 @", 0x1f),
    k("3 #", 0x20),
    k("4 $", 0x21),
    k("5 %", 0x22),
    k("6 ^", 0x23),
    k("7 &", 0x24),
    k("8 *", 0x25),
    k("9 (", 0x26),
    k("0 )", 0x27),
    k("- _", 0x2d),
    k("= +", 0x2e),
    k("Bksp", 0x2a),
    k("Insert", 0x49),
    k("Home", 0x4a),
    k("PgUp", 0x4b),
    k("Num", 0x53),
    k("KP /", 0x54),
    k("KP *", 0x55),
    k("KP -", 0x56),
  ],
  [
    k("Tab", 0x2b),
    k("Q", 0x14),
    k("W", 0x1a),
    k("E", 0x08),
    k("R", 0x15),
    k("T", 0x17),
    k("Y", 0x1c),
    k("U", 0x18),
    k("I", 0x0c),
    k("O", 0x12),
    k("P", 0x13),
    k("[ {", 0x2f),
    k("] }", 0x30),
    k("\\ |", 0x31),
    k("Del", 0x4c),
    k("End", 0x4d),
    k("PgDn", 0x4e),
    k("KP 7", 0x5f),
    k("KP 8", 0x60),
    k("KP 9", 0x61),
    k("KP +", 0x57),
  ],
  [
    k("Caps", 0x39),
    k("A", 0x04),
    k("S", 0x16),
    k("D", 0x07),
    k("F", 0x09),
    k("G", 0x0a),
    k("H", 0x0b),
    k("J", 0x0d),
    k("K", 0x0e),
    k("L", 0x0f),
    k("; :", 0x33),
    k("' \"", 0x34),
    k("Enter", 0x28),
    k("KP 4", 0x5c),
    k("KP 5", 0x5d),
    k("KP 6", 0x5e),
  ],
  [
    k("L Shift", 0xe1),
    k("Z", 0x1d),
    k("X", 0x1b),
    k("C", 0x06),
    k("V", 0x19),
    k("B", 0x05),
    k("N", 0x11),
    k("M", 0x10),
    k(", <", 0x36),
    k(". >", 0x37),
    k("/ ?", 0x38),
    k("R Shift", 0xe5),
    k("Up", 0x52),
    k("KP 1", 0x59),
    k("KP 2", 0x5a),
    k("KP 3", 0x5b),
    k("KP =", 0x67),
  ],
  [
    k("L Ctrl", 0xe0),
    k("L GUI", 0xe3),
    k("L Alt", 0xe2),
    k("Space", 0x2c),
    k("R Alt", 0xe6),
    k("R GUI", 0xe7),
    k("Menu", 0x65),
    k("R Ctrl", 0xe4),
    k("Left", 0x50),
    k("Down", 0x51),
    k("Right", 0x4f),
    k("KP 0", 0x62),
    k("KP .", 0x63),
    k("KP Ent", 0x58),
  ],
];
