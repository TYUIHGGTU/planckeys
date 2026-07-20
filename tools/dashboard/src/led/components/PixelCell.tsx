import type { CSSProperties } from "react";
import type { Rgb } from "../../device/hid/protocol";
import { isLit } from "../color";

interface Props {
  idx: number;
  color: Rgb;
  under?: boolean;
  onClick: (idx: number) => void;
}

/** 感知亮度，决定点亮时序号用深色还是浅色。 */
const isBright = ({ r, g, b }: Rgb): boolean =>
  0.299 * r + 0.587 * g + 0.114 * b > 150;

export function PixelCell({ idx, color, under, onClick }: Props) {
  const on = isLit(color);
  const rgb = `rgb(${color.r},${color.g},${color.b})`;
  const style: CSSProperties | undefined = on
    ? {
        background: rgb,
        borderColor: rgb,
        boxShadow: `0 0 12px 1px ${rgb}, inset 0 1px 3px rgba(255, 255, 255, 0.35)`,
        color: isBright(color) ? "rgba(0, 0, 0, 0.6)" : "rgba(255, 255, 255, 0.85)",
      }
    : undefined;

  return (
    <button
      type="button"
      className={"px" + (under ? " under" : "") + (on ? " on" : "")}
      style={style}
      onClick={() => onClick(idx)}
      title={`LED ${idx}${on ? "" : " · 已关闭"}`}
      aria-label={`LED ${idx}`}
    >
      <span className="px-idx">{idx}</span>
    </button>
  );
}
