import type { KeyboardProfile } from "@planckeys/keyboard-profile";
import type { Rgb } from "../../device/hid/protocol";
import { PixelCell } from "./PixelCell";

interface Props {
  pixels: Rgb[];
  profile: KeyboardProfile;
  onToggle: (idx: number) => void;
}

export function UnderGrid({ pixels, profile, onToggle }: Props) {
  return (
    <div className="kbgrid under">
      {profile.underglowIndices.map((idx) => (
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
