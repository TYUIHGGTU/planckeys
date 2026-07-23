/**
 * Planckeys Raw HID 线材协议 —— 报文命令与打包（usage page 见 keyboard-profile）。
 *
 * 板载 LED 几何已迁至 `@planckeys/keyboard-profile`。本文件短期再导出
 * `LED_COUNT` / `AXIS_LAYOUT` / `UNDERGLOW_INDICES` / `USAGE_PAGE`，避免一次改爆消费方。
 * 新代码请直接从 keyboard-profile 读取几何。
 *
 * 必须与固件 `src/led_control.c` 对齐。
 */

import {
  DEFAULT_PROFILE,
  PLANCKEYS_LEFT_AXIS_LAYOUT,
  PLANCKEYS_LEFT_UNDERGLOW,
} from "@planckeys/keyboard-profile";

/** @deprecated 请用 `@planckeys/keyboard-profile` 的 profile.hidUsagePage */
export const USAGE_PAGE = DEFAULT_PROFILE.hidUsagePage;

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

/** @deprecated 请用 profile.ledCount */
export const LED_COUNT = DEFAULT_PROFILE.ledCount;

/** 单个 0xA2 报文最多可写颗数：floor((32 - 3) / 3) = 9。 */
export const MAX_PX_PER_REPORT = Math.floor((REPORT_SIZE - 3) / 3);

/** @deprecated 请用 profile.underglowIndices */
export const UNDERGLOW_INDICES = PLANCKEYS_LEFT_UNDERGLOW;

/** @deprecated 请用 profile.axisLayout */
export const AXIS_LAYOUT = PLANCKEYS_LEFT_AXIS_LAYOUT;

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

/** 把整块画布切成多条 0xA2 报文（每条最多 9 颗）。 */
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
 * 组 0xA2 报文写入任意稀疏的 {index,color} 集合：把相邻 index 合并进同一条报文。
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
