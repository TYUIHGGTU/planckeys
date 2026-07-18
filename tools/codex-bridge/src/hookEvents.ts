import { ThreadStatus } from "./types.js";

/**
 * Shape of the JSON a Codex hook receives on stdin (developers.openai.com/codex/hooks).
 * We only rely on the documented common fields plus a few event extras.
 */
export interface HookPayload {
  hook_event_name?: string;
  session_id?: string;
  turn_id?: string;
  cwd?: string;
  source?: string;
  tool_name?: string;
  [k: string]: unknown;
}

export type MappedHook =
  | { kind: "status"; threadId: string; status: ThreadStatus }
  | null;

/**
 * Map a hook lifecycle event to a status. `session_id` is the stable per-session
 * identifier used as the slot key.
 *
 * NOTE: hooks have no dedicated error event — `Stop` fires on success and
 * failure alike — so `error` (red) cannot be produced from hooks. Completion is
 * reported as completeUnread (green).
 */
export const mapHook = (p: HookPayload): MappedHook => {
  const threadId = p.session_id;
  if (!threadId) return null;
  const event = p.hook_event_name;

  switch (event) {
    case "SessionStart":
      return { kind: "status", threadId, status: ThreadStatus.Idle };

    case "UserPromptSubmit":
    case "PreToolUse":
    case "PostToolUse":
      return { kind: "status", threadId, status: ThreadStatus.Working };

    // Codex fires `PermissionRequest`; Claude / CodeBuddy use `Notification`
    // for permission prompts (Notification also covers idle reminders, so it
    // may occasionally show amber without a real approval pending).
    case "PermissionRequest":
    case "Notification":
      return { kind: "status", threadId, status: ThreadStatus.RequiresInput };

    case "Stop":
      return { kind: "status", threadId, status: ThreadStatus.CompleteUnread };

    default:
      return null;
  }
};
