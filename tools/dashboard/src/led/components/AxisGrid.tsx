import type { KeyboardProfile } from "@planckeys/keyboard-profile";
import type { Rgb } from "../../device/hid/protocol";
import { PixelCell } from "./PixelCell";

interface Props {
  pixels: Rgb[];
  profile: KeyboardProfile;
  onToggle: (idx: number) => void;
}

export function AxisGrid({ pixels, profile, onToggle }: Props) {
  return (
    <div className="axis-wrap">
      <div className="kbgrid axis">
        {profile.axisLayout.flatMap((row, r) =>
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
