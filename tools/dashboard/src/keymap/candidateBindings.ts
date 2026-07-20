import type { BehaviorSummary, Binding } from "../device/studio/rpc";
import {
  COMMON_KB_USAGES,
  HID_USAGE_GROUPS,
  type HidUsageGroup,
} from "./hidUsages";

export const BINDING_DRAG_TYPE = "application/x-planckeys-binding";

export interface BindingCandidate {
  id: string;
  label: string;
  group: string;
  binding: Binding;
  search: string;
  /** 悬浮提示的完整说明（默认与 label 相同）。 */
  title?: string;
}

const normalize = (value: string): string =>
  value.toLowerCase().replace(/[\s&_\-()]/g, "");

const findBehavior = (
  behaviors: BehaviorSummary[],
  aliases: readonly string[],
): BehaviorSummary | undefined => {
  const normalizedAliases = aliases.map(normalize);
  return behaviors.find((behavior) => {
    const name = normalize(behavior.displayName);
    return normalizedAliases.some((alias) => name === alias || name.includes(alias));
  });
};

const usageCandidates = (
  behaviors: BehaviorSummary[],
): BindingCandidate[] => {
  const kp = findBehavior(behaviors, ["kp", "key press", "keypress"]);
  if (!kp) return [];
  return COMMON_KB_USAGES.map((usage) => ({
    id: `kp-${usage.value}`,
    label: usage.label,
    group: usage.group,
    binding: { behaviorId: kp.id, param1: usage.value, param2: 0 },
    search: `${usage.label} ${usage.search ?? ""}`.toLowerCase(),
  }));
};

const layerCandidates = (
  behaviors: BehaviorSummary[],
  layerCount: number,
): BindingCandidate[] => {
  const specs = [
    { aliases: ["mo", "momentary layer"], prefix: "MO" },
    { aliases: ["to", "to layer"], prefix: "TO" },
    { aliases: ["tog", "toggle layer", "tg"], prefix: "TG" },
  ] as const;
  const candidates: BindingCandidate[] = [];
  for (const spec of specs) {
    const behavior = findBehavior(behaviors, spec.aliases);
    if (!behavior) continue;
    for (let layer = 0; layer < layerCount; layer++) {
      candidates.push({
        id: `${spec.prefix}-${layer}`,
        label: `${spec.prefix}(${layer})`,
        group: "层",
        binding: { behaviorId: behavior.id, param1: layer, param2: 0 },
        search: `${spec.prefix} layer ${layer}`.toLowerCase(),
      });
    }
  }

  const transparent = findBehavior(behaviors, [
    "trans",
    "transparent",
    "transparent behavior",
  ]);
  if (transparent) {
    candidates.unshift({
      id: "transparent",
      label: "Trans",
      group: "层",
      binding: { behaviorId: transparent.id, param1: 0, param2: 0 },
      search: "transparent trans",
    });
  }
  return candidates;
};

/** 系统类行为的友好短名（键帽/候选键有限宽度下避免出现 `behavior_led_ne…`）。 */
const FRIENDLY_SYSTEM_NAMES: readonly { match: string; label: string }[] = [
  { match: "lednext", label: "灯效切换" },
  { match: "ledprev", label: "灯效上一个" },
  { match: "led", label: "灯效" },
  { match: "bootloader", label: "Bootloader" },
  { match: "boot", label: "Bootloader" },
  { match: "sysreset", label: "重启" },
  { match: "reset", label: "重启" },
  { match: "studiounlock", label: "Studio 解锁" },
  { match: "studio", label: "Studio 解锁" },
];

const friendlySystemLabel = (displayName: string): string => {
  const name = normalize(displayName);
  const hit = FRIENDLY_SYSTEM_NAMES.find((entry) => name.includes(entry.match));
  return hit ? hit.label : displayName.replace(/^&/, "");
};

const directBehaviorCandidates = (
  behaviors: BehaviorSummary[],
): BindingCandidate[] =>
  behaviors
    .filter((behavior) => {
      const name = normalize(behavior.displayName);
      return (
        name.includes("boot") ||
        name.includes("reset") ||
        name.includes("lednext") ||
        name.includes("led") ||
        name.includes("studio")
      );
    })
    .map((behavior) => ({
      id: `behavior-${behavior.id}`,
      label: friendlySystemLabel(behavior.displayName),
      group: "系统",
      binding: { behaviorId: behavior.id, param1: 0, param2: 0 },
      title: behavior.displayName.replace(/^&/, ""),
      // 完整原名进入搜索，便于用 behavior_led_next 等原名检索。
      search: `${friendlySystemLabel(behavior.displayName)} ${behavior.displayName}`.toLowerCase(),
    }));

export const buildBindingCandidates = (
  behaviors: BehaviorSummary[],
  layerCount: number,
): BindingCandidate[] => [
  ...usageCandidates(behaviors),
  ...layerCandidates(behaviors, layerCount),
  ...directBehaviorCandidates(behaviors),
];

export const candidateGroups = (
  candidates: readonly BindingCandidate[],
): string[] => {
  const available = new Set(candidates.map((candidate) => candidate.group));
  const ordered: string[] = (
    HID_USAGE_GROUPS as readonly HidUsageGroup[]
  ).filter((group) => available.has(group));
  for (const extra of ["层", "系统"]) {
    if (available.has(extra)) ordered.push(extra);
  }
  return ordered;
};

export const serializeBinding = (binding: Binding): string =>
  JSON.stringify(binding);

export const parseBinding = (value: string): Binding | null => {
  try {
    const parsed = JSON.parse(value) as Partial<Binding>;
    if (
      typeof parsed.behaviorId !== "number" ||
      typeof parsed.param1 !== "number" ||
      typeof parsed.param2 !== "number"
    ) {
      return null;
    }
    return {
      behaviorId: parsed.behaviorId,
      param1: parsed.param1,
      param2: parsed.param2,
    };
  } catch {
    return null;
  }
};
