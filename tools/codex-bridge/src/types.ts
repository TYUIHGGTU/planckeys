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

/** Attention colors that override platform hue (per-conversation cells). */
export const ATTENTION_COLOR = {
  /** Needs approval / input — amber fast blink. */
  requiresInput: rgb(0xff, 0x6d, 0x00),
  /** Failure — red fast blink. */
  error: rgb(0xff, 0x17, 0x44),
} as const;

/**
 * Global status-bar colors (row 0). These are semantic, not platform identity:
 * the top row aggregates every conversation into one at-a-glance signal.
 */
export const GLOBAL_COLOR = {
  /** In progress — amber back-and-forth marquee. */
  working: rgb(0xff, 0x8f, 0x00),
  /** Needs a human — yellow blink. */
  requiresInput: rgb(0xff, 0xd6, 0x00),
  /** Failure — red blink. */
  error: rgb(0xff, 0x17, 0x44),
  /** All done, unread — green (bright hold, then dim). */
  completeUnread: rgb(0x00, 0xc8, 0x53),
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
}
