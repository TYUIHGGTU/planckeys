import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PhysicalLayout } from "../device/studio/rpc";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.15;
// 横向留白（左右各半）。
const PADDING_X = 48;
// 纵向留白：除常规上下留白外，还要为 .kb-canvas::after 那道向画布下方延伸约 30px 的
// 彩虹辉光预留空间，否则竖长布局（分体左板）自适应铺满后辉光溢出会触发竖向滚动条。
const PADDING_Y = 88;

const clampZoom = (value: number): number =>
  Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100;

export interface KeyboardScaleController {
  containerRef: RefObject<HTMLDivElement>;
  /** 最终 centi-unit -> px 比例（含缩放）。 */
  unitPx: number;
  /** 相对“适应”基准的缩放百分比。 */
  zoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

/**
 * 让键盘默认按可用空间自适应（fit-to-container），并支持在此基准上 +/- 缩放。
 */
export const useKeyboardScale = (
  layout: PhysicalLayout | undefined,
): KeyboardScaleController => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fitUnit, setFitUnit] = useState(0.56);
  const [zoom, setZoom] = useState(1);

  const naturalWidth = layout
    ? Math.max(1, ...layout.keys.map((k) => k.x + k.width))
    : 0;
  const naturalHeight = layout
    ? Math.max(1, ...layout.keys.map((k) => k.y + k.height))
    : 0;

  const recompute = useCallback(() => {
    const node = containerRef.current;
    if (!node || !naturalWidth || !naturalHeight) return;
    const availWidth = node.clientWidth - PADDING_X;
    const availHeight = node.clientHeight - PADDING_Y;
    if (availWidth <= 0 || availHeight <= 0) return;
    const next = Math.min(
      availWidth / naturalWidth,
      availHeight / naturalHeight,
    );
    if (next > 0 && Number.isFinite(next)) setFitUnit(next);
  }, [naturalWidth, naturalHeight]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(node);
    return () => observer.disconnect();
  }, [recompute]);

  return {
    containerRef,
    unitPx: fitUnit * zoom,
    zoomPercent: Math.round(zoom * 100),
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    zoomIn: () => setZoom((current) => clampZoom(current + ZOOM_STEP)),
    zoomOut: () => setZoom((current) => clampZoom(current - ZOOM_STEP)),
    resetZoom: () => setZoom(1),
  };
};
