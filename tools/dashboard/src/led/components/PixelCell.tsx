import type { Rgb } from "../../device/hid/protocol";
import { isLit } from "../color";

interface Props {
  idx: number;
  color: Rgb;
  under?: boolean;
  onClick: (idx: number) => void;
}

export function PixelCell({ idx, color, under, onClick }: Props) {
  const on = isLit(color);
  return (
    <div
      className={"px" + (under ? " under" : "")}
      style={{
        background: on ? `rgb(${color.r},${color.g},${color.b})` : "#2a2f3a",
        color: on ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.35)",
      }}
      onClick={() => onClick(idx)}
    >
      {idx}
    </div>
  );
}
