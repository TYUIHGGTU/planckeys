import type { BehaviorSummary, Binding } from "../device/studio/rpc";
import {
  encodeConsumerUsage,
  encodeHidUsage,
  encodeKbUsage,
  usageLabel,
} from "./hidUsages";

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

/** 未收录的行为名做一次友好清洗：去掉前缀 & 与 behavior_ 噪声。 */
export const prettyBehaviorName = (displayName: string): string =>
  displayName
    .replace(/^&/, "")
    .replace(/^behavior[_\s-]*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

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

/**
 * 把一个键码/参数解码成简短键帽文字。
 *
 * 相比旧实现，这里不再把「键盘页兜底」限制在 `usage>>>16===0`：
 * 不同固件会把 `&kp` 参数存成裸 id、带隐式修饰键高位、或非常规 page，
 * 因此始终再按解析出的 page 与键盘/消费页各兜底一次，
 * 让标准键不会掉进无意义的 `0x2F` 展示。
 */
const keyLabel = (usage: number): string => {
  const direct = usageLabel(usage);
  if (direct) return direct;

  const page = (usage >>> 16) & 0xff;
  const id = usage & 0xffff;

  if (page) {
    const byPage = usageLabel(encodeHidUsage(page, id));
    if (byPage) return byPage;
  }
  const asKeyboard = usageLabel(encodeKbUsage(id));
  if (asKeyboard) return asKeyboard;
  const asConsumer = usageLabel(encodeConsumerUsage(id));
  if (asConsumer) return asConsumer;

  // 仍未收录：显示 id，避免出现无意义的大整数。
  return `0x${id.toString(16).toUpperCase()}`;
};

/**
 * 一个键位的键帽文字：
 * - `&kp` 解码为对应按键（如 `B`、`Enter`）；
 * - 层类行为显示为 `MO(1)`、`TO(2)` 等；
 * - 透明键显示为 `▽`；
 * - 其它行为回退到友好显示名 + 非零参数。
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
      const pretty = prettyBehaviorName(name);
      const params: number[] = [];
      if (binding.param1 !== 0 || binding.param2 !== 0)
        params.push(binding.param1);
      if (binding.param2 !== 0) params.push(binding.param2);
      return params.length ? `${pretty} ${params.join(" ")}` : pretty;
    }
  }
};

/** 键位悬浮提示：友好标签 + 行为名 + 原始参数，便于排查。 */
export const bindingTooltip = (
  behaviors: BehaviorSummary[],
  binding: Binding,
): string => {
  const name = behaviorName(behaviors, binding.behaviorId);
  const label = bindingLabel(behaviors, binding);
  return `${label} · ${prettyBehaviorName(name)} (p1=${binding.param1}, p2=${binding.param2})`;
};
