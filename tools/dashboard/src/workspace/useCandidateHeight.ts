import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const STORAGE_KEY = "planckeys.workspace.candidateHeight";
const DEFAULT_HEIGHT = 292;
const MIN_HEIGHT = 180;

const clampHeight = (value: number): number =>
  Math.round(Math.max(MIN_HEIGHT, Math.min(window.innerHeight * 0.55, value)));

const readInitialHeight = (): number => {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0
    ? clampHeight(stored)
    : clampHeight(DEFAULT_HEIGHT);
};

export interface CandidateHeightController {
  height: number;
  resizeProps: {
    role: "separator";
    tabIndex: number;
    "aria-label": string;
    "aria-orientation": "horizontal";
    "aria-valuemin": number;
    "aria-valuemax": number;
    "aria-valuenow": number;
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  };
}

export const useCandidateHeight = (): CandidateHeightController => {
  const [height, setHeightState] = useState(readInitialHeight);

  const setHeight = useCallback((value: number) => {
    const next = clampHeight(value);
    setHeightState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const handle = event.currentTarget;
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = height;
      handle.setPointerCapture(pointerId);
      document.body.classList.add("is-resizing");

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        setHeight(startHeight + startY - moveEvent.clientY);
      };
      const onEnd = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        handle.releasePointerCapture(pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onEnd);
        handle.removeEventListener("pointercancel", onEnd);
        document.body.classList.remove("is-resizing");
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onEnd);
      handle.addEventListener("pointercancel", onEnd);
    },
    [height, setHeight],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      setHeight(height + (event.key === "ArrowUp" ? 16 : -16));
    },
    [height, setHeight],
  );

  return {
    height,
    resizeProps: {
      role: "separator",
      tabIndex: 0,
      "aria-label": "调整候选键区域高度",
      "aria-orientation": "horizontal",
      "aria-valuemin": MIN_HEIGHT,
      "aria-valuemax": Math.round(window.innerHeight * 0.55),
      "aria-valuenow": height,
      onPointerDown,
      onKeyDown,
    },
  };
};
