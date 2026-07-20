import { useState } from "react";
import { normalizeHex } from "../color";
import { QUICK_COLORS } from "../constants";
import { COLOR_SCHEMES, type ColorScheme } from "../schemes";

interface Props {
  baseColor: string;
  onPickColor: (hex: string) => void;
  onScheme: (scheme: ColorScheme) => void;
}

export function Palette({ baseColor, onPickColor, onScheme }: Props) {
  const [hexInput, setHexInput] = useState(baseColor);

  const commitHex = () => {
    const h = normalizeHex(hexInput);
    if (h) onPickColor(h);
    else setHexInput(baseColor);
  };

  return (
    <div className="card">
      <h2>调色板</h2>
      <div className="swatches">
        {QUICK_COLORS.map((hex) => (
          <button
            key={hex}
            className={"swatch" + (hex === baseColor ? " active" : "")}
            style={{ background: hex }}
            title={hex}
            onClick={() => {
              setHexInput(hex);
              onPickColor(hex);
            }}
          />
        ))}
      </div>
      <div className="palette-tools">
        <span className="cur-swatch" style={{ background: baseColor }} title="当前基色" />
        <label className="field shrink">
          自定义
          <input
            type="color"
            value={baseColor}
            onChange={(e) => {
              setHexInput(e.target.value);
              onPickColor(e.target.value);
            }}
          />
        </label>
        <input
          className="hex"
          value={hexInput}
          maxLength={7}
          spellCheck={false}
          title="十六进制颜色"
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHex();
          }}
        />
      </div>

      <h2 className="section-gap">配色方案</h2>
      <div className="schemes">
        {COLOR_SCHEMES.map((scheme) => (
          <button
            key={scheme.id}
            className="scheme"
            title={"应用「" + scheme.name + "」"}
            onClick={() => onScheme(scheme)}
          >
            <div className="scheme-bar">
              {scheme.preview.map((c, i) => (
                <i key={i} style={{ background: c }} />
              ))}
            </div>
            <span>{scheme.name}</span>
          </button>
        ))}
      </div>
      <div className="hint">
        颜色与灯效相互独立：点色块或选自定义颜色会立即把整条灯带铺成该颜色；点格子可单独开关某颗；配色方案一键写入整块颜色。之后选预设灯效，会让这些颜色一起呼吸/跑马。
      </div>
    </div>
  );
}
