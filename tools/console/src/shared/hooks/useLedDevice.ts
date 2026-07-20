import { useCallback, useMemo, useRef, useState } from "react";
import { LedDevice } from "../../device/hid/ledDevice";
import {
  AXIS_INDICES,
  LED_COUNT,
  LedMode,
  UNDERGLOW_INDICES,
  buildAllPixelReports,
  buildBrightnessReport,
  buildConfigReport,
  buildPixelReport,
  type Rgb,
} from "../../device/hid/protocol";
import { hexToRgb, isLit } from "../../led/color";
import { DEFAULT_BRIGHTNESS, DEFAULT_HEX, DEFAULT_SPEED } from "../../led/constants";
import type { ColorScheme } from "../../led/schemes";
import { AXIS_LAYOUT } from "../../device/hid/protocol";
import { pushLog } from "../log";

const makeDefaultCanvas = (): Rgb[] =>
  Array.from({ length: LED_COUNT }, () => hexToRgb(DEFAULT_HEX));

export interface LedController {
  connected: boolean;
  productName: string | null;
  pixels: Rgb[];
  mode: LedMode;
  brightness: number;
  speed: number;
  baseColor: string;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setMode: (mode: LedMode) => void;
  setBrightness: (v: number) => void;
  setSpeed: (v: number) => void;
  setBaseColorOnly: (hex: string) => void;
  applyBaseColor: (hex: string) => void;
  togglePixel: (idx: number) => void;
  fillSubset: (indices: readonly number[], color: Rgb | null) => void;
  applyScheme: (scheme: ColorScheme) => void;
  setCanvas: (next: Rgb[], note?: string) => void;
}

export const useLedDevice = (): LedController => {
  const deviceRef = useRef<LedDevice>(new LedDevice());
  const [connected, setConnected] = useState(false);
  const [productName, setProductName] = useState<string | null>(null);
  const [pixels, setPixels] = useState<Rgb[]>(makeDefaultCanvas);
  const [mode, setModeState] = useState<LedMode>(LedMode.Solid);
  const [brightness, setBrightnessState] = useState(DEFAULT_BRIGHTNESS);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);
  const [baseColor, setBaseColor] = useState(DEFAULT_HEX);

  // 用 ref 镜像可变状态，避免闭包拿到旧值（发送逻辑读取时用最新值）。
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const safeSend = useCallback(async (fn: () => Promise<void>) => {
    if (!deviceRef.current.isOpen) return;
    try {
      await fn();
    } catch (e) {
      pushLog("发送失败: " + ((e as Error).message || String(e)));
    }
  }, []);

  const sendConfig = useCallback(
    (m: LedMode) => {
      void safeSend(() =>
        deviceRef.current.send(
          buildConfigReport(m, brightnessRef.current, speedRef.current),
        ),
      );
      pushLog(
        `config mode=${m} br=${brightnessRef.current} sp=${speedRef.current}`,
      );
    },
    [safeSend],
  );

  const sendAllPixels = useCallback(
    (px: Rgb[]) => {
      void safeSend(() => deviceRef.current.sendMany(buildAllPixelReports(px)));
    },
    [safeSend],
  );

  // 编辑画布后，若当前是关灯则自动切常亮让改动可见；否则保留当前动画。
  const ensureVisible = useCallback(() => {
    if (modeRef.current === LedMode.Off) {
      setModeState(LedMode.Solid);
      modeRef.current = LedMode.Solid;
      sendConfig(LedMode.Solid);
    }
  }, [sendConfig]);

  const connect = useCallback(async () => {
    try {
      const dev = await deviceRef.current.request(() => {
        setConnected(false);
        setProductName(null);
        pushLog("设备已拔出");
      });
      setConnected(true);
      setProductName(dev.productName ?? "HID");
      pushLog("已连接并打开设备");
      // 把网页画布同步到键盘（颜色以网页为准），再同步模式/亮度/速度。
      sendAllPixels(pixelsRef.current);
      sendConfig(modeRef.current);
    } catch (e) {
      pushLog("连接失败: " + ((e as Error).message || String(e)));
      throw e;
    }
  }, [sendAllPixels, sendConfig]);

  const disconnect = useCallback(async () => {
    await deviceRef.current.close();
    setConnected(false);
    setProductName(null);
    pushLog("已断开 HID");
  }, []);

  const setMode = useCallback(
    (m: LedMode) => {
      setModeState(m);
      modeRef.current = m;
      sendConfig(m);
    },
    [sendConfig],
  );

  const setBrightness = useCallback(
    (v: number) => {
      setBrightnessState(v);
      brightnessRef.current = v;
      void safeSend(() => deviceRef.current.send(buildBrightnessReport(v)));
    },
    [safeSend],
  );

  const setSpeed = useCallback(
    (v: number) => {
      setSpeedState(v);
      speedRef.current = v;
      if (modeRef.current >= LedMode.Breathing && modeRef.current <= LedMode.Melt) {
        sendConfig(modeRef.current);
      }
    },
    [sendConfig],
  );

  const setBaseColorOnly = useCallback((hex: string) => {
    setBaseColor(hex);
  }, []);

  const setCanvas = useCallback(
    (next: Rgb[], note?: string) => {
      setPixels(next);
      pixelsRef.current = next;
      sendAllPixels(next);
      ensureVisible();
      if (note) pushLog(note);
    },
    [sendAllPixels, ensureVisible],
  );

  const applyBaseColor = useCallback(
    (hex: string) => {
      setBaseColor(hex);
      const color = hexToRgb(hex);
      const next = pixelsRef.current.map((_, i) =>
        AXIS_INDICES.includes(i) || UNDERGLOW_INDICES.includes(i)
          ? { ...color }
          : { ..._ },
      );
      setCanvas(next);
    },
    [setCanvas],
  );

  const togglePixel = useCallback(
    (idx: number) => {
      const cur = pixelsRef.current[idx];
      const next = pixelsRef.current.map((p) => ({ ...p }));
      next[idx] = isLit(cur) ? { r: 0, g: 0, b: 0 } : hexToRgb(baseColor);
      setPixels(next);
      pixelsRef.current = next;
      void safeSend(() =>
        deviceRef.current.send(buildPixelReport(idx, [next[idx]])),
      );
      ensureVisible();
    },
    [baseColor, safeSend, ensureVisible],
  );

  const fillSubset = useCallback(
    (indices: readonly number[], color: Rgb | null) => {
      const next = pixelsRef.current.map((p) => ({ ...p }));
      for (const i of indices) next[i] = color ? { ...color } : { r: 0, g: 0, b: 0 };
      setCanvas(next);
    },
    [setCanvas],
  );

  const applyScheme = useCallback(
    (scheme: ColorScheme) => {
      const next = pixelsRef.current.map((p) => ({ ...p }));
      const cols = AXIS_LAYOUT[0].length;
      for (let r = 0; r < AXIS_LAYOUT.length; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = AXIS_LAYOUT[r][c];
          if (idx === null) continue;
          next[idx] = hexToRgb(scheme.paint(r, c, cols));
        }
      }
      const n = UNDERGLOW_INDICES.length;
      UNDERGLOW_INDICES.forEach((idx, i) => {
        next[idx] = hexToRgb(scheme.under(i, n));
      });
      setBaseColor(scheme.primary);
      setCanvas(next, "应用配色: " + scheme.name + "（当前模式不变，可再选预设让它动起来）");
    },
    [setCanvas],
  );

  return useMemo(
    () => ({
      connected,
      productName,
      pixels,
      mode,
      brightness,
      speed,
      baseColor,
      connect,
      disconnect,
      setMode,
      setBrightness,
      setSpeed,
      setBaseColorOnly,
      applyBaseColor,
      togglePixel,
      fillSubset,
      applyScheme,
      setCanvas,
    }),
    [
      connected,
      productName,
      pixels,
      mode,
      brightness,
      speed,
      baseColor,
      connect,
      disconnect,
      setMode,
      setBrightness,
      setSpeed,
      setBaseColorOnly,
      applyBaseColor,
      togglePixel,
      fillSubset,
      applyScheme,
      setCanvas,
    ],
  );
};
