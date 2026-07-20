import { UNDERGLOW_INDICES, type Rgb } from "../../device/hid/protocol";
import { PixelCell } from "./PixelCell";

interface Props {
  pixels: Rgb[];
  onToggle: (idx: number) => void;
}

export function UnderGrid({ pixels, onToggle }: Props) {
  return (
    <div className="kbgrid under">
      {UNDERGLOW_INDICES.map((idx) => (
        <PixelCell
          key={idx}
          idx={idx}
          color={pixels[idx]}
          under
          onClick={onToggle}
        />
      ))}
    </div>
  );
}
