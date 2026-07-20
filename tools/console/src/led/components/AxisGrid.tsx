import { AXIS_LAYOUT, type Rgb } from "../../device/hid/protocol";
import { PixelCell } from "./PixelCell";

interface Props {
  pixels: Rgb[];
  onToggle: (idx: number) => void;
}

export function AxisGrid({ pixels, onToggle }: Props) {
  return (
    <div className="axis-wrap">
      <div className="kbgrid axis">
        {AXIS_LAYOUT.flatMap((row, r) =>
          row.map((idx, c) =>
            idx === null ? (
              <div key={`e-${r}-${c}`} className="px empty" />
            ) : (
              <PixelCell
                key={idx}
                idx={idx}
                color={pixels[idx]}
                onClick={onToggle}
              />
            ),
          ),
        )}
      </div>
    </div>
  );
}
