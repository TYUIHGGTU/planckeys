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
        name.includes("studio")
      );
    })
    .map((behavior) => ({
      id: `behavior-${behavior.id}`,
      label: behavior.displayName.replace(/^&/, ""),
      group: "系统",
      binding: { behaviorId: behavior.id, param1: 0, param2: 0 },
      search: behavior.displayName.toLowerCase(),
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
