import type { Layer } from "../../device/studio/rpc";

interface Props {
  layers: Layer[];
  selected: number;
  onSelect: (index: number) => void;
}

export function LayerTabs({ layers, selected, onSelect }: Props) {
  return (
    <div className="layer-tabs">
      {layers.map((l, i) => (
        <button
          key={l.id}
          className={i === selected ? "active" : undefined}
          onClick={() => onSelect(i)}
        >
          {l.name || `层 ${i}`}
        </button>
      ))}
    </div>
  );
}
