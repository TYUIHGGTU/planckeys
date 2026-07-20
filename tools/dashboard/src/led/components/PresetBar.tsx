import type { LedMode } from "../../device/hid/protocol";
import { PRESETS } from "../constants";

interface Props {
  mode: LedMode;
  brightness: number;
  speed: number;
  onMode: (mode: LedMode) => void;
  onBrightness: (v: number) => void;
  onSpeed: (v: number) => void;
}

export function PresetBar({
  mode,
  brightness,
  speed,
  onMode,
  onBrightness,
  onSpeed,
}: Props) {
  return (
    <div className="card">
      <h2>预设灯效</h2>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.mode}
            className={mode === p.mode ? "active" : undefined}
            onClick={() => onMode(p.mode)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="sliders">
        <label className="field">
          亮度
          <input
            type="range"
            min={0}
            max={255}
            value={brightness}
            onChange={(e) => onBrightness(Number(e.target.value))}
          />
          <span>{brightness}</span>
        </label>
        <label className="field">
          速度
          <input
            type="range"
            min={1}
            max={30}
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          />
          <span>{speed}</span>
        </label>
      </div>
    </div>
  );
}
