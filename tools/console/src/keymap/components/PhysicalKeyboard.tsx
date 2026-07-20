import type {
  BehaviorSummary,
  Layer,
  PhysicalLayout,
} from "../../device/studio/rpc";
import { bindingLabel } from "../bindingLabels";

/** 1 键位单位（centi-keyunit）对应的像素。 */
const UNIT_PX = 0.56;

interface Props {
  layout: PhysicalLayout;
  layer: Layer;
  behaviors: BehaviorSummary[];
  selectedKey: number | null;
  onSelectKey: (keyPosition: number) => void;
}

export function PhysicalKeyboard({
  layout,
  layer,
  behaviors,
  selectedKey,
  onSelectKey,
}: Props) {
  const width =
    Math.max(0, ...layout.keys.map((k) => k.x + k.width)) * UNIT_PX;
  const height =
    Math.max(0, ...layout.keys.map((k) => k.y + k.height)) * UNIT_PX;

  return (
    <div className="kb-canvas" style={{ width, height }}>
      {layout.keys.map((k, pos) => {
        const binding = layer.bindings[pos];
        return (
          <button
            key={pos}
            className={"kb-key" + (pos === selectedKey ? " selected" : "")}
            style={{
              left: k.x * UNIT_PX,
              top: k.y * UNIT_PX,
              width: k.width * UNIT_PX - 4,
              height: k.height * UNIT_PX - 4,
            }}
            title={`位置 ${pos}`}
            onClick={() => onSelectKey(pos)}
          >
            <span className="kb-key-label">
              {binding ? bindingLabel(behaviors, binding) : "—"}
            </span>
            <span className="kb-key-pos">{pos}</span>
          </button>
        );
      })}
    </div>
  );
}
