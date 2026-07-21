/**
 * PlanckKeys 左板 Raw HID 协议（usage page 0xFF60）。
 *
 * 「线材协议 + 板载布局 + 报文打包」核心复用 codex-bridge 的单一真源，
 * 避免与固件 / codex-bridge 三处各维护一份而漂移。dashboard 只在这里额外保留
 * 自己的布局解读常量（AXIS_INDICES）。
 *
 * 说明：引用 codex-bridge 的构建产物（含 .d.ts），类型来自声明文件；
 * 因此 dashboard 的 typecheck / build 前需先构建 codex-bridge（脚本已自动预构建）。
 * 打包后核心被 vite 内联进产物，dashboard 仍作为静态 web 独立部署与演进。
 */
export * from "../../../../codex-bridge/dist/protocol/core.js";

import { AXIS_LAYOUT } from "../../../../codex-bridge/dist/protocol/core.js";

/** 所有有灯的轴灯链上 index（按 AXIS_LAYOUT 展平、去空）。 */
export const AXIS_INDICES: readonly number[] = AXIS_LAYOUT.flat().filter(
  (x): x is number => x !== null,
);
