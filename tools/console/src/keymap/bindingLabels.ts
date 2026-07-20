import type { BehaviorSummary, Binding } from "../device/studio/rpc";

/** 由 behaviorId 找显示名（找不到回退到 id）。 */
export const behaviorName = (
  behaviors: BehaviorSummary[],
  behaviorId: number,
): string => {
  const b = behaviors.find((x) => x.id === behaviorId);
  return b ? b.displayName : `#${behaviorId}`;
};

/** 一个键位的简短标签：behavior 名 + 非零参数。 */
export const bindingLabel = (
  behaviors: BehaviorSummary[],
  binding: Binding,
): string => {
  const name = behaviorName(behaviors, binding.behaviorId);
  const params: number[] = [];
  if (binding.param1 !== 0 || binding.param2 !== 0) params.push(binding.param1);
  if (binding.param2 !== 0) params.push(binding.param2);
  return params.length ? `${name} ${params.join(" ")}` : name;
};
