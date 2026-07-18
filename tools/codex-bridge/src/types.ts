import { Rgb, rgb } from "./protocol.js";

/**
 * Semantic per-thread states, mirroring the Codex Micro / arkey status model
 * (docs/codex-micro-parity.md §3.1, codex-agent-loop-hooks-app-server.md §7).
 */
export enum ThreadStatus {
  Offline = "offline",
  Idle = "idle",
  Working = "working",
  CompleteUnread = "completeUnread",
  RequiresInput = "requiresInput",
  Error = "error",
}

/**
 * Arbitration priority when a slot could be described by several states, and
 * for aggregating the underglow. Higher wins.
 */
export const STATUS_PRIORITY: Record<ThreadStatus, number> = {
  [ThreadStatus.Error]: 6,
  [ThreadStatus.RequiresInput]: 5,
  [ThreadStatus.CompleteUnread]: 4,
  [ThreadStatus.Working]: 3,
  [ThreadStatus.Idle]: 2,
  [ThreadStatus.Offline]: 1,
};

/** Semantic colors (docs/codex-micro-parity.md §3.1, matches arkey AgentGlow). */
export const STATUS_COLOR: Record<ThreadStatus, Rgb> = {
  [ThreadStatus.Idle]: rgb(0xff, 0xff, 0xff),
  [ThreadStatus.Working]: rgb(0x30, 0x4f, 0xfe),
  [ThreadStatus.CompleteUnread]: rgb(0x00, 0xff, 0x4c),
  [ThreadStatus.RequiresInput]: rgb(0xff, 0x6d, 0x00),
  [ThreadStatus.Error]: rgb(0xff, 0x00, 0x33),
  [ThreadStatus.Offline]: rgb(0x00, 0x00, 0x00),
};

export interface SlotState {
  /** codex thread id currently bound to this slot, or null if empty. */
  threadId: string | null;
  status: ThreadStatus;
  /** epoch ms of the last status update, used for recency/eviction. */
  updatedAt: number;
  /**
   * Whether a completeUnread has been superseded. Set false on completeUnread,
   * true again once the thread starts working/idles. Guards the unread green
   * from being cleared by a trailing idle and gates slot eviction.
   */
  read: boolean;
}
