import { useCallback, useEffect, useRef, useState } from "react";
import type { Rgb } from "../../device/hid/protocol";
import { hexToRgb } from "../color";
import { DIGIT_MAX } from "../constants";
import { paintNumber, parseDigitInput } from "../glyphs";

interface Props {
  pixels: Rgb[];
  baseColor: string;
  setCanvas: (next: Rgb[], note?: string) => void;
}

export function DigitPanel({ pixels, baseColor, setCanvas }: Props) {
  const [input, setInput] = useState("0");
  const [interval, setIntervalMs] = useState(800);
  const [playing, setPlaying] = useState(false);
  const [activeDigit, setActiveDigit] = useState<number | null>(0);

  // 用 ref 保证定时器回调读到最新画布/颜色。
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;
  const baseColorRef = useRef(baseColor);
  baseColorRef.current = baseColor;

  const showDigit = useCallback(
    (n: number) => {
      const next = paintNumber(pixelsRef.current, n, hexToRgb(baseColorRef.current));
      if (!next) return;
      setActiveDigit(n);
      setInput(String(n));
      setCanvas(next, "点阵显示: " + n);
    },
    [setCanvas],
  );

  const onShow = () => {
    const n = parseDigitInput(input);
    if (n == null) return;
    setPlaying(false);
    showDigit(n);
  };

  useEffect(() => {
    if (!playing) return;
    let i = 0;
    const tick = () => {
      const n = i % (DIGIT_MAX + 1);
      const next = paintNumber(pixelsRef.current, n, hexToRgb(baseColorRef.current));
      if (next) {
        setActiveDigit(n);
        setInput(String(n));
        setCanvas(next, `轮播: ${n} (${n + 1}/${DIGIT_MAX + 1})`);
      }
      i++;
    };
    tick();
    const id = window.setInterval(tick, interval);
    return () => window.clearInterval(id);
  }, [playing, interval, setCanvas]);

  return (
    <>
      <h2 className="section-gap">点阵数字</h2>
      <div className="digit-tools">
        <input
          className="digit-input"
          type="text"
          inputMode="numeric"
          maxLength={1}
          spellCheck={false}
          value={input}
          title="0–9"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onShow();
          }}
        />
        <button type="button" onClick={onShow}>
          显示
        </button>
        <button
          type="button"
          className="primary"
          disabled={playing}
          onClick={() => setPlaying(true)}
        >
          开始轮播
        </button>
        <button type="button" disabled={!playing} onClick={() => setPlaying(false)}>
          停止轮播
        </button>
        <label className="field shrink">
          间隔
          <input
            type="range"
            min={200}
            max={2000}
            step={100}
            value={interval}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
          />
          <span>{interval}</span>ms
        </label>
      </div>
      <div className="digit-keys">
        {Array.from({ length: DIGIT_MAX + 1 }, (_, d) => (
          <button
            key={d}
            type="button"
            className={activeDigit === d ? "active" : undefined}
            onClick={() => {
              setPlaying(false);
              showDigit(d);
            }}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="hint">仅 0–9，3×5 点阵。「开始轮播」按 0→9 循环，「停止轮播」停下。</div>
    </>
  );
}
