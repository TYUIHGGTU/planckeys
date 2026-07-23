import { useState, type CSSProperties } from "react";
import type {
  BehaviorSummary,
  Binding,
  Layer,
  PhysicalKey,
  PhysicalLayout,
} from "../../device/studio/rpc";
import { BINDING_DRAG_TYPE, parseBinding } from "../candidateBindings";
import { bindingLabel, bindingTooltip } from "../bindingLabels";

interface Props {
  layout: PhysicalLayout;
  layer: Layer;
  behaviors: BehaviorSummary[];
  selectedKey: number | null;
  onSelectKey: (keyPosition: number) => void;
  onDropBinding?: (keyPosition: number, binding: Binding) => void;
  /** 1 centi-keyunit 对应的像素，由外层根据可用空间与缩放算出。 */
  unitPx: number;
}

function keyPositionStyle(k: PhysicalKey, unitPx: number): CSSProperties {
  const style: CSSProperties = {
    left: k.x * unitPx,
    top: k.y * unitPx,
    width: k.width * unitPx - 4,
    height: k.height * unitPx - 4,
  };
  // 与 zmk-studio 一致：用 ?? 保留显式 0 的旋转原点。
  if (k.r) {
    const originX = ((k.rx ?? k.x) - k.x) * unitPx;
    const originY = ((k.ry ?? k.y) - k.y) * unitPx;
    style.transformOrigin = `${originX}px ${originY}px`;
    style.transform = `rotate(${k.r / 100}deg)`;
  }
  return style;
}

export function PhysicalKeyboard({
  layout,
  layer,
  behaviors,
  selectedKey,
  onSelectKey,
  onDropBinding,
  unitPx,
}: Props) {
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const width = Math.max(0, ...layout.keys.map((k) => k.x + k.width)) * unitPx;
  const height = Math.max(0, ...layout.keys.map((k) => k.y + k.height)) * unitPx;
  const labelSize = Math.max(9, Math.min(20, unitPx * 16));

  return (
    <div className="kb-canvas" style={{ width, height }}>
      {layout.keys.map((k, pos) => {
        const binding = layer.bindings[pos];
        const label = binding ? bindingLabel(behaviors, binding) : "—";
        const title = binding
          ? `${bindingTooltip(behaviors, binding)} · 位置 ${pos}`
          : `空 · 位置 ${pos}`;
        return (
          <button
            key={pos}
            className={
              "kb-key" +
              (pos === selectedKey ? " selected" : "") +
              (pos === dragTarget ? " drag-target" : "") +
              (binding ? "" : " empty")
            }
            style={
              {
                ...keyPositionStyle(k, unitPx),
                "--kb-label-size": `${labelSize}px`,
              } as CSSProperties
            }
            title={title}
            onClick={() => onSelectKey(pos)}
            onDragOver={(event) => {
              if (!onDropBinding) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setDragTarget(pos);
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(event) => {
              event.preventDefault();
              setDragTarget(null);
              const dropped = parseBinding(
                event.dataTransfer.getData(BINDING_DRAG_TYPE),
              );
              if (dropped) onDropBinding?.(pos, dropped);
            }}
          >
            <span className="kb-key-reg">{String(pos).padStart(2, "0")}</span>
            <span className="kb-key-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
