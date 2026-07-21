import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./logger.js";
import {
  claudeSettingsPath,
  codebuddySettingsPath,
  codexHooksPath,
  cursorHooksPath,
  defaultSocketPath,
  workbuddySettingsPath,
} from "./paths.js";

/** Substring that identifies handlers installed by this bridge (idempotency). */
const MARKER = "hookForwarder.js";

export type HookTargetName =
  | "codex"
  | "codebuddy"
  | "workbuddy"
  | "claude"
  | "cursor";

/**
 * `nested` = Claude/Codex/CodeBuddy: hooks[event] = [{ hooks: [{ type, command }] }]
 * `flat`   = Cursor native:          hooks[event] = [{ command }]  (+ top-level version)
 */
type HookFormat = "nested" | "flat";

interface HookTarget {
  /** Config file that holds the `hooks` map. */
  file: string;
  /** Events to register. */
  events: string[];
  format: HookFormat;
  /** Human label for the manual trust/verify step. */
  trustHint: string;
}

const COMMON_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
];

/** Cursor native camelCase events (no Notification / PermissionRequest equivalent). */
const CURSOR_EVENTS = [
  "sessionStart",
  "beforeSubmitPrompt",
  "preToolUse",
  "postToolUse",
  "stop",
];

const TARGET_NAMES =
  "codex | codebuddy | workbuddy | claude | cursor";

const TARGETS: Record<HookTargetName, HookTarget> = {
  codex: {
    file: codexHooksPath(),
    events: [...COMMON_EVENTS, "PermissionRequest"],
    format: "nested",
    trustHint:
      "run `codex` and `/hooks` to review & TRUST these hooks (codex skips untrusted hooks).",
  },
  codebuddy: {
    file: codebuddySettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    format: "nested",
    trustHint:
      "restart CodeBuddy; settings.json command hooks run without a per-hash trust step.",
  },
  workbuddy: {
    file: workbuddySettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    format: "nested",
    trustHint:
      "fully quit and reopen the WorkBuddy desktop app so it reloads settings.json hooks.",
  },
  claude: {
    file: claudeSettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    format: "nested",
    trustHint: "restart Claude Code; verify with `/hooks`.",
  },
  cursor: {
    file: cursorHooksPath(),
    events: [...CURSOR_EVENTS],
    format: "flat",
    trustHint:
      "reload Cursor (hooks.json is watched; if lamps stay dark, restart Cursor and check Settings → Hooks).",
  },
};

interface HookHandler {
  type?: string;
  command: string;
  statusMessage?: string;
  [k: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookHandler[];
  command?: string;
  [k: string]: unknown;
}
/** Config root (hooks.json OR settings.json). We only touch `.hooks` (+ Cursor `version`). */
interface ConfigRoot {
  version?: number;
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

const forwarderPath = (): string =>
  fileURLToPath(new URL("./hookForwarder.js", import.meta.url));

const shellQuote = (s: string): string => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

const readConfig = (path: string): ConfigRoot => {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as ConfigRoot;
};

const entryIsOurs = (entry: HookGroup): boolean => {
  if (typeof entry.command === "string" && entry.command.includes(MARKER)) {
    return true;
  }
  return !!entry.hooks?.some((h) => (h.command ?? "").includes(MARKER));
};

/** Remove any entries we previously installed (detected by MARKER). */
const stripOurs = (root: ConfigRoot): void => {
  if (!root.hooks) return;
  for (const event of Object.keys(root.hooks)) {
    root.hooks[event] = root.hooks[event].filter((g) => !entryIsOurs(g));
    if (root.hooks[event].length === 0) delete root.hooks[event];
  }
};

export const installHooks = (
  targetName: HookTargetName = "codex",
  sockPath = defaultSocketPath(),
): void => {
  const target = TARGETS[targetName];
  if (!target) {
    log.error(`Unknown target '${targetName}'. Use ${TARGET_NAMES}.`);
    process.exitCode = 1;
    return;
  }

  const path = target.file;
  let root: ConfigRoot;
  try {
    root = readConfig(path);
  } catch (e) {
    log.error(
      `Existing ${path} is not valid JSON (${(e as Error).message}). Aborting to avoid data loss; fix or move it first.`,
    );
    process.exitCode = 1;
    return;
  }

  if (existsSync(path)) {
    copyFileSync(path, `${path}.planckeys.bak`);
    log.info(`Backed up existing config to ${path}.planckeys.bak`);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }

  stripOurs(root);
  root.hooks ??= {};
  if (target.format === "flat") {
    // Cursor 3.x requires a numeric version on hooks.json.
    root.version ??= 1;
  }

  // argv: node hookForwarder.js <sock> <platform> — platform tags every payload
  // so the daemon can paint brand colors without guessing from event shape.
  const command = `${shellQuote(process.execPath)} ${shellQuote(forwarderPath())} ${shellQuote(sockPath)} ${shellQuote(targetName)}`;

  for (const event of target.events) {
    if (target.format === "flat") {
      (root.hooks[event] ??= []).push({ command });
    } else {
      (root.hooks[event] ??= []).push({
        hooks: [
          {
            type: "command",
            command,
            statusMessage: "planckeys LED",
          },
        ],
      });
    }
  }

  writeFileSync(path, JSON.stringify(root, null, 2) + "\n", "utf8");
  log.info(`Installed planckeys hooks for '${targetName}' into ${path}`);
  log.info(`Forwarder: ${forwarderPath()}`);
  log.info(`Socket:    ${sockPath}`);
  log.warn(`Next: ${target.trustHint}`);
  log.warn("Then start the daemon: `npm start` (or node dist/index.js).");
};

export const uninstallHooks = (targetName: HookTargetName = "codex"): void => {
  const target = TARGETS[targetName];
  if (!target) {
    log.error(`Unknown target '${targetName}'. Use ${TARGET_NAMES}.`);
    process.exitCode = 1;
    return;
  }
  const path = target.file;
  if (!existsSync(path)) {
    log.info(`No config at ${path}; nothing to uninstall.`);
    return;
  }
  let root: ConfigRoot;
  try {
    root = readConfig(path);
  } catch (e) {
    log.error(`Cannot parse ${path}: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }
  stripOurs(root);
  writeFileSync(path, JSON.stringify(root, null, 2) + "\n", "utf8");
  log.info(`Removed planckeys hooks for '${targetName}' from ${path}`);
};
