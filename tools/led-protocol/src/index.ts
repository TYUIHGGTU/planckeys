/**
 * PlanckKeys 左板 Raw HID 协议 —— 单一真源（usage page 0xFF60）。
 *
 * 这是 agent-bridge / dashboard / desktop 共用的「线材协议 + 板载布局 + 报文打包」核心，
 * 必须与固件 `src/led_control.c` 对齐。各消费方特有的「渲染/布局解读」常量不放这里，
 * 由各自的 protocol.ts 保留（agent-bridge 的会话点阵、dashboard 的 AXIS_INDICES 等）。
 */

export const USAGE_PAGE = 0xff60;
export const REPORT_SIZE = 32;

/** 0xA1：设置全局模式/亮度/速度（只影响动画，不动颜色）。 */
export const CMD_CONFIG = 0xa1;
/** 0xA2：写画布一段逐颗 RGB（不改模式）。 */
export const CMD_PIXELS = 0xa2;
/** 0xA3：设置全局亮度。 */
export const CMD_BRIGHTNESS = 0xa3;
/** 0xA4：用单色铺满整块画布。 */
export const CMD_FILL = 0xa4;
/** 0xA5：独立配置轴灯或底灯的模式/亮度/速度。 */
export const CMD_ZONE_CONFIG = 0xa5;

/** 固件支持的动画模式（0xA1 的 byte[1]）。 */
export enum LedMode {
  Off = 0,
  Solid = 1,
  Breathing = 2,
  Chase = 3,
  Melt = 4,
}

export enum LedZone {
  Axis = 0,
  Underglow = 1,
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface ZoneConfig {
  mode: LedMode;
  brightness: number;
  speed: number;
}

/** 单条链灯珠总数（须与固件 chain-length 对齐）。 */
export const LED_COUNT = 28;

/** 单个 0xA2 报文最多可写颗数：floor((32 - 3) / 3) = 9。 */
export const MAX_PX_PER_REPORT = Math.floor((REPORT_SIZE - 3) / 3);

/** 底灯（正面不可见），链上 index 0..5。 */
export const UNDERGLOW_INDICES = [0, 1, 2, 3, 4, 5] as const;

/**
 * 轴灯排布（键盘旋成竖向 4 列 × 6 行）。`null` = 该格无灯。`[row][col]` -> 链上 index。
 *
 *   c0  c1  c2  c3
 *   10  21  22   6   r0
 *   11  20  23   7   r1
 *   12  19  24   8   r2
 *   13  18  25   9   r3
 *   14  17  26   ·   r4
 *   15  16  27   ·   r5
 */
export const AXIS_LAYOUT: readonly (number | null)[][] = [
  [10, 21, 22, 6],
  [11, 20, 23, 7],
  [12, 19, 24, 8],
  [13, 18, 25, 9],
  [14, 17, 26, null],
  [15, 16, 27, null],
];

export const clampByte = (n: number): number => {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
};

const toReport = (bytes: number[]): Uint8Array => {
  const data = new Uint8Array(REPORT_SIZE);
  data.set(bytes.slice(0, REPORT_SIZE));
  return data;
};

/** 组 0xA1 CONFIG 报文（只影响动画/亮度/速度）。 */
export const buildConfigReport = (
  mode: LedMode,
  brightness: number,
  speed: number,
): Uint8Array =>
  toReport([CMD_CONFIG, mode & 0xff, clampByte(brightness), clampByte(speed)]);

/** 组 0xA3 BRIGHTNESS 报文。 */
export const buildBrightnessReport = (brightness: number): Uint8Array =>
  toReport([CMD_BRIGHTNESS, clampByte(brightness)]);

/** 组 0xA4 FILL 报文（单色铺满画布）。 */
export const buildFillReport = (color: Rgb): Uint8Array =>
  toReport([
    CMD_FILL,
    clampByte(color.r),
    clampByte(color.g),
    clampByte(color.b),
  ]);

/**
 * 组 0xA5 ZONE_CONFIG 报文。兼容两种历史签名：
 * - 对象式：`buildZoneConfigReport(zone, { mode, brightness, speed })`（dashboard）
 * - 四参式：`buildZoneConfigReport(zone, mode, brightness, speed)`（agent-bridge）
 */
export function buildZoneConfigReport(
  zone: LedZone,
  config: ZoneConfig,
): Uint8Array;
export function buildZoneConfigReport(
  zone: LedZone,
  mode: LedMode,
  brightness: number,
  speed: number,
): Uint8Array;
export function buildZoneConfigReport(
  zone: LedZone,
  a: ZoneConfig | LedMode,
  b?: number,
  c?: number,
): Uint8Array {
  const cfg: ZoneConfig =
    typeof a === "object" ? a : { mode: a, brightness: b ?? 0, speed: c ?? 1 };
  return toReport([
    CMD_ZONE_CONFIG,
    zone & 0xff,
    cfg.mode & 0xff,
    clampByte(cfg.brightness),
    clampByte(cfg.speed || 1),
  ]);
}

/** 组一条 0xA2 PIXELS 报文：从 offset 起连续写 colors（长度须 <= 9）。 */
export const buildPixelReport = (offset: number, colors: Rgb[]): Uint8Array => {
  const bytes: number[] = [CMD_PIXELS, offset & 0xff, colors.length & 0xff];
  for (const c of colors) {
    bytes.push(clampByte(c.r), clampByte(c.g), clampByte(c.b));
  }
  return toReport(bytes);
};

/** 把整块画布（LED_COUNT 颗）切成多条 0xA2 报文（每条最多 9 颗）。 */
export const buildAllPixelReports = (pixels: Rgb[]): Uint8Array[] => {
  const reports: Uint8Array[] = [];
  for (let off = 0; off < pixels.length; off += MAX_PX_PER_REPORT) {
    reports.push(buildPixelReport(off, pixels.slice(off, off + MAX_PX_PER_REPORT)));
  }
  return reports;
};

/** 把从 offset 起的连续一段像素切成多条 0xA2 报文（offset 递增）。 */
export const buildPixelReports = (
  offset: number,
  colors: Rgb[],
): Uint8Array[] => {
  const reports: Uint8Array[] = [];
  for (let i = 0; i < colors.length; i += MAX_PX_PER_REPORT) {
    reports.push(buildPixelReport(offset + i, colors.slice(i, i + MAX_PX_PER_REPORT)));
  }
  return reports;
};

/**
 * 组 0xA2 报文写入任意稀疏的 {index,color} 集合：把相邻 index 合并进同一条报文，
 * 使 6 颗 Agent 灯（15..10）仍能合并成一条。
 */
export const buildSparsePixelReports = (
  writes: { index: number; color: Rgb }[],
): Uint8Array[] => {
  const sorted = [...writes].sort((a, b) => a.index - b.index);
  const reports: Uint8Array[] = [];
  let run: { start: number; colors: Rgb[] } | null = null;

  const flush = (): void => {
    if (run) {
      reports.push(...buildPixelReports(run.start, run.colors));
      run = null;
    }
  };

  for (const w of sorted) {
    if (
      run &&
      w.index === run.start + run.colors.length &&
      run.colors.length < MAX_PX_PER_REPORT
    ) {
      run.colors.push(w.color);
    } else {
      flush();
      run = { start: w.index, colors: [w.color] };
    }
  }
  flush();
  return reports;
};
