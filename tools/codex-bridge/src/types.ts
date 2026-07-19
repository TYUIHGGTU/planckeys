import { Rgb, rgb } from "./protocol.js";

/**
 * Semantic per-thread states. Hue now comes from the agent platform; status
 * is expressed via brightness / host-side motion (breathe, blink, hold).
 */
export enum ThreadStatus {
  Offline = "offline",
  Idle = "idle",
  Working = "working",
  CompleteUnread = "completeUnread",
  RequiresInput = "requiresInput",
  Error = "error",
}

/** Platforms that can install hooks into this bridge. */
export type AgentPlatform =
  | "cursor"
  | "codebuddy"
  | "workbuddy"
  | "codex"
  | "claude"
  | "unknown";

export const AGENT_PLATFORMS: readonly AgentPlatform[] = [
  "cursor",
  "codebuddy",
  "workbuddy",
  "codex",
  "claude",
  "unknown",
] as const;

export const isAgentPlatform = (v: unknown): v is AgentPlatform =>
  typeof v === "string" && (AGENT_PLATFORMS as readonly string[]).includes(v);

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

/** Brand / identity color per platform (working & complete use this hue). */
export const PLATFORM_COLOR: Record<AgentPlatform, Rgb> = {
  cursor: rgb(0xe8, 0xee, 0xf5),
  codebuddy: rgb(0x7c, 0x4d, 0xff),
  workbuddy: rgb(0x00, 0xc8, 0x53),
  codex: rgb(0x30, 0x4f, 0xfe),
  /** Claude is supported by hooks but not in the primary brand set. */
  claude: rgb(0xd9, 0x77, 0x57),
  unknown: rgb(0xc0, 0xc0, 0xc0),
};

/** Attention colors that override platform hue. */
export const ATTENTION_COLOR = {
  /** Needs approval / input — fast blink. */
  requiresInput: rgb(0xff, 0x6d, 0x00),
  /** Failure — yellow fast blink. */
  error: rgb(0xff, 0xc1, 0x07),
} as const;

export interface SlotState {
  /** Session / conversation id currently bound to this slot, or null if empty. */
  threadId: string | null;
  platform: AgentPlatform;
  status: ThreadStatus;
  /** epoch ms of the last status update, used for recency/eviction. */
  updatedAt: number;
  /**
   * Whether a completeUnread has been superseded. Set false on completeUnread,
   * true again once the thread starts working/idles. Soft-unread dim stays
   * until a new turn; gates slot eviction while unread.
   */
  read: boolean;
  /** epoch ms when completeUnread was entered; drives the bright-hold window. */
  completedAt: number | null;
  /**
   * Per-platform task order number (1..9, cycles). Assigned when the session
   * first binds a slot; shown as a dot-matrix digit on completion.
   */
  taskNumber: number;
}
