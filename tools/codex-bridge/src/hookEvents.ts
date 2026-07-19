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
 * Map a hook lifecycle event to a status. Thread key is `session_id` (Codex /
 * Claude-family) or `conversation_id` (Cursor).
 *
 * NOTE: Claude-family hooks have no dedicated error event — `Stop` fires on
 * success and failure alike. Cursor's `stop` carries `status`, so we can map
 * `error` there.
 */
export const mapHook = (p: HookPayload): MappedHook => {
  const threadId = p.session_id ?? p.conversation_id;
  if (!threadId) return null;
  const event = p.hook_event_name;
  const platform = resolvePlatform(p);

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
