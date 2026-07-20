import type { BehaviorSummary, Binding } from "../device/studio/rpc";
import { encodeKbUsage, usageLabel } from "./hidUsages";

/** 由 behaviorId 找显示名（找不到回退到 id）。 */
export const behaviorName = (
  behaviors: BehaviorSummary[],
  behaviorId: number,
): string => {
  const b = behaviors.find((x) => x.id === behaviorId);
  return b ? b.displayName : `#${behaviorId}`;
};

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[\s&_\-()]/g, "");

type BehaviorKind =
  | "keyPress"
  | "momentary"
  | "toLayer"
  | "toggleLayer"
  | "layerTap"
  | "transparent"
  | "other";

const classify = (displayName: string): BehaviorKind => {
  const name = normalize(displayName);
  if (name.includes("keypress") || name === "kp") return "keyPress";
  if (name.includes("layertap") || name === "lt") return "layerTap";
  if (name.includes("momentary") || name === "mo") return "momentary";
  if (name.includes("togglelayer") || name === "tog" || name === "tg")
    return "toggleLayer";
  if (name.includes("tolayer") || name === "to") return "toLayer";
  if (name.includes("transparent") || name === "trans") return "transparent";
  return "other";
};

/** 把一个键码/参数解码成简短键帽文字。 */
const keyLabel = (usage: number): string => {
  // 完整编码（含 usage page）直接查。
  const direct = usageLabel(usage);
  if (direct) return direct;
  // 部分固件把 `&kp` 参数存成裸 HID id（无 page 高位），按键盘页补查一次。
  if (usage >>> 16 === 0) {
    const asKeyboard = usageLabel(encodeKbUsage(usage));
    if (asKeyboard) return asKeyboard;
  }
  // 仍未收录：显示 id，避免出现无意义的大整数。
  const id = usage & 0xffff;
  return `0x${id.toString(16).toUpperCase()}`;
};

/**
 * 一个键位的键帽文字：
 * - `&kp` 解码为对应按键（如 `B`、`Enter`）；
 * - 层类行为显示为 `MO(1)`、`TO(2)` 等；
 * - 透明键显示为 `▽`；
 * - 其它行为回退到显示名 + 非零参数。
 */
export const bindingLabel = (
  behaviors: BehaviorSummary[],
  binding: Binding,
): string => {
  const name = behaviorName(behaviors, binding.behaviorId);
  const kind = classify(name);

  switch (kind) {
    case "keyPress":
      return keyLabel(binding.param1);
    case "momentary":
      return `MO(${binding.param1})`;
    case "toLayer":
      return `TO(${binding.param1})`;
    case "toggleLayer":
      return `TG(${binding.param1})`;
    case "layerTap":
      return `LT ${binding.param1} · ${keyLabel(binding.param2)}`;
    case "transparent":
      return "▽";
    default: {
      const params: number[] = [];
      if (binding.param1 !== 0 || binding.param2 !== 0)
        params.push(binding.param1);
      if (binding.param2 !== 0) params.push(binding.param2);
      return params.length ? `${name} ${params.join(" ")}` : name;
    }
  }
};
