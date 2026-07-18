import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./logger.js";
import {
  claudeSettingsPath,
  codebuddySettingsPath,
  codexHooksPath,
  defaultSocketPath,
  workbuddySettingsPath,
} from "./paths.js";

/** Substring that identifies handlers installed by this bridge (idempotency). */
const MARKER = "hookForwarder.js";

export type HookTargetName = "codex" | "codebuddy" | "workbuddy" | "claude";

interface HookTarget {
  /** Config file that holds the `hooks` map. */
  file: string;
  /** Events to register. Codex uses PermissionRequest; the Claude-family uses Notification. */
  events: string[];
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

const TARGETS: Record<HookTargetName, HookTarget> = {
  codex: {
    file: codexHooksPath(),
    events: [...COMMON_EVENTS, "PermissionRequest"],
    trustHint:
      "run `codex` and `/hooks` to review & TRUST these hooks (codex skips untrusted hooks).",
  },
  codebuddy: {
    file: codebuddySettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    trustHint:
      "restart CodeBuddy; settings.json command hooks run without a per-hash trust step.",
  },
  workbuddy: {
    file: workbuddySettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    trustHint:
      "fully quit and reopen the WorkBuddy desktop app so it reloads settings.json hooks.",
  },
  claude: {
    file: claudeSettingsPath(),
    events: [...COMMON_EVENTS, "Notification"],
    trustHint: "restart Claude Code; verify with `/hooks`.",
  },
};

interface HookHandler {
  type: string;
  command: string;
  statusMessage?: string;
  [k: string]: unknown;
}
interface HookGroup {
  matcher?: string;
  hooks: HookHandler[];
  [k: string]: unknown;
}
/** The config file root (codex hooks.json OR a settings.json). We only touch `.hooks`. */
interface ConfigRoot {
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

/** Remove any groups we previously installed (detected by MARKER). */
const stripOurs = (root: ConfigRoot): void => {
  if (!root.hooks) return;
  for (const event of Object.keys(root.hooks)) {
    root.hooks[event] = root.hooks[event].filter(
      (g) => !g.hooks?.some((h) => (h.command ?? "").includes(MARKER)),
    );
    if (root.hooks[event].length === 0) delete root.hooks[event];
  }
};

export const installHooks = (
  targetName: HookTargetName = "codex",
  sockPath = defaultSocketPath(),
): void => {
  const target = TARGETS[targetName];
  if (!target) {
    log.error(`Unknown target '${targetName}'. Use codex | codebuddy | claude.`);
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

  const command = `${shellQuote(process.execPath)} ${shellQuote(forwarderPath())} ${shellQuote(sockPath)}`;
  const handler: HookHandler = {
    type: "command",
    command,
    statusMessage: "planckeys LED",
  };

  for (const event of target.events) {
    (root.hooks[event] ??= []).push({ hooks: [{ ...handler }] });
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
    log.error(`Unknown target '${targetName}'. Use codex | codebuddy | claude.`);
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
