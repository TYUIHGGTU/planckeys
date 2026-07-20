import { useCallback, useMemo, useRef, useState } from "react";
import { LedDevice } from "../../device/hid/ledDevice";
import {
  AXIS_LAYOUT,
  LED_COUNT,
  LedMode,
  LedZone,
  UNDERGLOW_INDICES,
  buildAllPixelReports,
  buildConfigReport,
  buildPixelReport,
  buildZoneConfigReport,
  type Rgb,
  type ZoneConfig,
} from "../../device/hid/protocol";
import { hexToRgb, isLit } from "../../led/color";
import { DEFAULT_BRIGHTNESS, DEFAULT_HEX, DEFAULT_SPEED } from "../../led/constants";
import type { ColorScheme } from "../../led/schemes";
import { pushLog } from "../log";

const makeDefaultCanvas = (): Rgb[] =>
  Array.from({ length: LED_COUNT }, () => hexToRgb(DEFAULT_HEX));

const makeDefaultZone = (): ZoneConfig => ({
  mode: LedMode.Solid,
  brightness: DEFAULT_BRIGHTNESS,
  speed: DEFAULT_SPEED,
});

export interface LedController {
  connected: boolean;
  productName: string | null;
  pixels: Rgb[];
  axis: ZoneConfig;
  underglow: ZoneConfig;
  baseColor: string;
  error: string | null;

  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setZoneMode: (zone: LedZone, mode: LedMode) => void;
  setZoneBrightness: (zone: LedZone, value: number) => void;
  setZoneSpeed: (zone: LedZone, value: number) => void;
  setBaseColorOnly: (hex: string) => void;
  applyBaseColor: (hex: string) => void;
  setPixelColor: (index: number, color: Rgb) => void;
  togglePixel: (index: number) => void;
  fillSubset: (indices: readonly number[], color: Rgb | null) => void;
  applyScheme: (scheme: ColorScheme) => void;
  setCanvas: (next: Rgb[], note?: string) => void;
}

export const useLedDevice = (): LedController => {
  const deviceRef = useRef<LedDevice>(new LedDevice());
  const [connected, setConnected] = useState(false);
  const [productName, setProductName] = useState<string | null>(null);
  const [pixels, setPixels] = useState<Rgb[]>(makeDefaultCanvas);
  const [axis, setAxis] = useState<ZoneConfig>(makeDefaultZone);
  const [underglow, setUnderglow] = useState<ZoneConfig>(makeDefaultZone);
  const [baseColor, setBaseColor] = useState(DEFAULT_HEX);
  const [error, setError] = useState<string | null>(null);

  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;
  const axisRef = useRef(axis);
  axisRef.current = axis;
  const underglowRef = useRef(underglow);
  underglowRef.current = underglow;

  const safeSend = useCallback(async (operation: () => Promise<void>) => {
    if (!deviceRef.current.isOpen) return;
    try {
      await operation();
      setError(null);
    } catch (sendError) {
      const message = (sendError as Error).message || String(sendError);
      setError(message);
      pushLog("发送失败: " + message);
    }
  }, []);

  const sendZoneConfig = useCallback(
    (zone: LedZone, config: ZoneConfig) => {
      void safeSend(() =>
        deviceRef.current.send(buildZoneConfigReport(zone, config)),
      );
      pushLog(
        `zone=${zone === LedZone.Axis ? "axis" : "under"} mode=${config.mode} br=${config.brightness} sp=${config.speed}`,
      );
    },
    [safeSend],
  );

  const sendAllPixels = useCallback(
    (next: Rgb[]) => {
      void safeSend(() =>
        deviceRef.current.sendMany(buildAllPixelReports(next)),
      );
    },
    [safeSend],
  );

  const connect = useCallback(async () => {
    try {
      const device = await deviceRef.current.request(() => {
        setConnected(false);
        setProductName(null);
        pushLog("设备已拔出");
      });
      setConnected(true);
      setProductName(device.productName ?? "HID");
      setError(null);
      pushLog("已连接并打开 HID 设备");
      sendAllPixels(pixelsRef.current);
      // Legacy CONFIG initializes older firmware; A5 then restores independent zones.
      await safeSend(() =>
        deviceRef.current.send(
          buildConfigReport(
            axisRef.current.mode,
            axisRef.current.brightness,
            axisRef.current.speed,
          ),
        ),
      );
      sendZoneConfig(LedZone.Axis, axisRef.current);
      sendZoneConfig(LedZone.Underglow, underglowRef.current);
    } catch (connectError) {
      const message = (connectError as Error).message || String(connectError);
      setError(message);
      pushLog("连接失败: " + message);
      throw connectError;
    }
  }, [safeSend, sendAllPixels, sendZoneConfig]);

  const disconnect = useCallback(async () => {
    await deviceRef.current.close();
    setConnected(false);
    setProductName(null);
    setError(null);
    pushLog("已断开 HID");
  }, []);

  const updateZone = useCallback(
    (zone: LedZone, update: (current: ZoneConfig) => ZoneConfig) => {
      if (zone === LedZone.Axis) {
        const next = update(axisRef.current);
        axisRef.current = next;
        setAxis(next);
        sendZoneConfig(zone, next);
      } else {
        const next = update(underglowRef.current);
        underglowRef.current = next;
        setUnderglow(next);
        sendZoneConfig(zone, next);
      }
    },
    [sendZoneConfig],
  );

  const setZoneMode = useCallback(
    (zone: LedZone, mode: LedMode) =>
      updateZone(zone, (current) => ({ ...current, mode })),
    [updateZone],
  );

  const setZoneBrightness = useCallback(
    (zone: LedZone, brightness: number) =>
      updateZone(zone, (current) => ({ ...current, brightness })),
    [updateZone],
  );

  const setZoneSpeed = useCallback(
    (zone: LedZone, speed: number) =>
      updateZone(zone, (current) => ({ ...current, speed })),
    [updateZone],
  );

  const setBaseColorOnly = useCallback((hex: string) => setBaseColor(hex), []);

  const setCanvas = useCallback(
    (next: Rgb[], note?: string) => {
      setPixels(next);
      pixelsRef.current = next;
      sendAllPixels(next);
      if (note) pushLog(note);
    },
    [sendAllPixels],
  );

  const applyBaseColor = useCallback(
    (hex: string) => {
      setBaseColor(hex);
      const color = hexToRgb(hex);
      setCanvas(pixelsRef.current.map(() => ({ ...color })));
    },
    [setCanvas],
  );

  const setPixelColor = useCallback(
    (index: number, color: Rgb) => {
      if (index < 0 || index >= LED_COUNT) return;
      const next = pixelsRef.current.map((pixel) => ({ ...pixel }));
      next[index] = { ...color };
      setPixels(next);
      pixelsRef.current = next;
      void safeSend(() =>
        deviceRef.current.send(buildPixelReport(index, [next[index]])),
      );
    },
    [safeSend],
  );

  const togglePixel = useCallback(
    (index: number) => {
      const current = pixelsRef.current[index];
      setPixelColor(
        index,
        isLit(current) ? { r: 0, g: 0, b: 0 } : hexToRgb(baseColor),
      );
    },
    [baseColor, setPixelColor],
  );

  const fillSubset = useCallback(
    (indices: readonly number[], color: Rgb | null) => {
      const next = pixelsRef.current.map((pixel) => ({ ...pixel }));
      for (const index of indices) {
        next[index] = color ? { ...color } : { r: 0, g: 0, b: 0 };
      }
      setCanvas(next);
    },
    [setCanvas],
  );

  const applyScheme = useCallback(
    (scheme: ColorScheme) => {
      const next = pixelsRef.current.map((pixel) => ({ ...pixel }));
      const columns = AXIS_LAYOUT[0].length;
      for (let row = 0; row < AXIS_LAYOUT.length; row++) {
        for (let column = 0; column < columns; column++) {
          const index = AXIS_LAYOUT[row][column];
          if (index !== null) {
            next[index] = hexToRgb(scheme.paint(row, column, columns));
          }
        }
      }
      UNDERGLOW_INDICES.forEach((index, position) => {
        next[index] = hexToRgb(
          scheme.under(position, UNDERGLOW_INDICES.length),
        );
      });
      setBaseColor(scheme.primary);
      setCanvas(next, "应用配色: " + scheme.name);
    },
    [setCanvas],
  );

  return useMemo(
    () => ({
      connected,
      productName,
      pixels,
      axis,
      underglow,
      baseColor,
      error,
      connect,
      disconnect,
      setZoneMode,
      setZoneBrightness,
      setZoneSpeed,
      setBaseColorOnly,
      applyBaseColor,
      setPixelColor,
      togglePixel,
      fillSubset,
      applyScheme,
      setCanvas,
    }),
    [
      connected,
      productName,
      pixels,
      axis,
      underglow,
      baseColor,
      error,
      connect,
      disconnect,
      setZoneMode,
      setZoneBrightness,
      setZoneSpeed,
      setBaseColorOnly,
      applyBaseColor,
      setPixelColor,
      togglePixel,
      fillSubset,
      applyScheme,
      setCanvas,
    ],
  );
};
