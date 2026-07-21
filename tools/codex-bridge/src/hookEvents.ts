import { AgentPlatform, isAgentPlatform, ThreadStatus } from "./types.js";

/** Injected by hookForwarder so the daemon knows which client fired the event. */
export const PLATFORM_FIELD = "_planckeys_platform";

/**
 * Shape of the JSON a hook receives on stdin (Codex / Claude-family / Cursor).
 * We only rely on the documented common fields plus a few event extras.
 */
export interface HookPayload {
  hook_event_name?: string;
  /** Codex / Claude-family stable session key. */
  session_id?: string;
  /** Cursor stable conversation key (also present as session_id on sessionStart). */
  conversation_id?: string;
  /** Cursor per-turn id (changes every generation; NOT a stable thread key). */
  generation_id?: string;
  /**
   * Cursor transcript file path. Non-null for a real (user-facing) conversation;
   * `null` for a subagent's own hooks. Cursor exposes no parent link, so this is
   * the only signal that separates a subagent from the main chat.
   */
  transcript_path?: string | null;
  turn_id?: string;
  cwd?: string;
  source?: string;
  tool_name?: string;
  /** Cursor `stop` payload: completed | aborted | error. */
  status?: string;
  /** Set by our forwarder (install-hooks --target). */
  [PLATFORM_FIELD]?: string;
  [k: string]: unknown;
}

export type MappedHook =
  | {
      kind: "status";
      threadId: string;
      status: ThreadStatus;
      platform: AgentPlatform;
    }
  | null;

export const resolvePlatform = (p: HookPayload): AgentPlatform => {
  const tagged = p[PLATFORM_FIELD];
  if (isAgentPlatform(tagged)) return tagged;
  return "unknown";
};

/**
 * The stable per-conversation key for a payload.
 *
 * Cursor keys on `conversation_id`: its `sessionStart` (and some later events)
 * also carry a `session_id`, so a blanket `session_id ?? conversation_id` would
 * split one conversation across two slots — the working slot (conversation_id)
 * would never receive its own `stop` (which arrived under session_id) and stay
 * stuck breathing. Codex / Claude-family always carry `session_id`.
 */
export const threadKeyOf = (
  p: HookPayload,
  platform: AgentPlatform,
): string | undefined =>
  platform === "cursor"
    ? p.conversation_id ?? p.session_id
    : p.session_id ?? p.conversation_id;

/**
 * Whether this Cursor payload belongs to a subagent (Task-tool child), which
 * runs under its own fresh `conversation_id` with no link back to the parent.
 * Detected by an explicit null/empty `transcript_path` (present on subagent
 * hooks, populated on the main chat). Conservative: a missing field is NOT
 * treated as a subagent, so we never blank the main conversation by mistake.
 */
export const isCursorSubagent = (
  p: HookPayload,
  platform: AgentPlatform,
): boolean =>
  platform === "cursor" &&
  "transcript_path" in p &&
  (p.transcript_path === null || p.transcript_path === "");

/**
 * Map a hook lifecycle event to a status. Thread key is `session_id` (Codex /
 * Claude-family) or `conversation_id` (Cursor).
 *
 * NOTE: Claude-family hooks have no dedicated error event — `Stop` fires on
 * success and failure alike. Cursor's `stop` carries `status`, so we can map
 * `error` there.
 */
export const mapHook = (p: HookPayload): MappedHook => {
  const platform = resolvePlatform(p);
  const threadId = threadKeyOf(p, platform);
  if (!threadId) return null;
  const event = p.hook_event_name;

  switch (event) {
    case "SessionStart":
    case "sessionStart":
      return { kind: "status", threadId, status: ThreadStatus.Idle, platform };

    case "UserPromptSubmit":
    case "beforeSubmitPrompt":
    case "PreToolUse":
    case "preToolUse":
    case "PostToolUse":
    case "postToolUse":
      return {
        kind: "status",
        threadId,
        status: ThreadStatus.Working,
        platform,
      };

    // Codex fires `PermissionRequest`; Claude / CodeBuddy use `Notification`
    // for permission prompts (Notification also covers idle reminders, so it
    // may occasionally show amber without a real approval pending).
    // Cursor has no equivalent event.
    case "PermissionRequest":
    case "Notification":
      return {
        kind: "status",
        threadId,
        status: ThreadStatus.RequiresInput,
        platform,
      };

    case "Stop":
    case "stop":
      if (p.status === "error") {
        return {
          kind: "status",
          threadId,
          status: ThreadStatus.Error,
          platform,
        };
      }
      return {
        kind: "status",
        threadId,
        status: ThreadStatus.CompleteUnread,
        platform,
      };

    default:
      return null;
  }
};
