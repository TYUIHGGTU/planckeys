import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { log } from "./logger.js";
import { codexHooksPath, defaultSocketPath } from "./paths.js";
import { OBSERVED_HOOK_EVENTS } from "./hookEvents.js";

/** Substring that identifies handlers installed by this bridge (idempotency). */
const MARKER = "hookForwarder.js";

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
interface HooksFile {
  description?: string;
  hooks?: Record<string, HookGroup[]>;
  [k: string]: unknown;
}

const forwarderPath = (): string =>
  fileURLToPath(new URL("./hookForwarder.js", import.meta.url));

const shellQuote = (s: string): string => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

const readHooksFile = (path: string): HooksFile => {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as HooksFile;
};

/** Remove any groups we previously installed (detected by MARKER). */
const stripOurs = (file: HooksFile): void => {
  if (!file.hooks) return;
  for (const event of Object.keys(file.hooks)) {
    file.hooks[event] = file.hooks[event].filter(
      (g) => !g.hooks?.some((h) => (h.command ?? "").includes(MARKER)),
    );
    if (file.hooks[event].length === 0) delete file.hooks[event];
  }
};

export const installHooks = (sockPath = defaultSocketPath()): void => {
  const path = codexHooksPath();
  let file: HooksFile;
  try {
    file = readHooksFile(path);
  } catch (e) {
    log.error(
      `Existing ${path} is not valid JSON (${(e as Error).message}). Aborting to avoid data loss; fix or move it first.`,
    );
    process.exitCode = 1;
    return;
  }

  if (existsSync(path)) {
    copyFileSync(path, `${path}.planckeys.bak`);
    log.info(`Backed up existing hooks to ${path}.planckeys.bak`);
  }

  stripOurs(file);
  file.hooks ??= {};

  const command = `${shellQuote(process.execPath)} ${shellQuote(forwarderPath())} ${shellQuote(sockPath)}`;
  const group: HookGroup = {
    hooks: [{ type: "command", command, statusMessage: "planckeys LED" }],
  };

  for (const event of OBSERVED_HOOK_EVENTS) {
    (file.hooks[event] ??= []).push({ ...group, hooks: [...group.hooks] });
  }

  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf8");
  log.info(`Installed planckeys hooks into ${path}`);
  log.info(`Forwarder: ${forwarderPath()}`);
  log.info(`Socket:    ${sockPath}`);
  log.warn(
    "Next: run `codex` (TUI) and `/hooks` to review & TRUST these hooks, " +
      "otherwise codex will skip them. Then start the daemon with `--source hooks`.",
  );
};

export const uninstallHooks = (): void => {
  const path = codexHooksPath();
  if (!existsSync(path)) {
    log.info("No hooks.json present; nothing to uninstall.");
    return;
  }
  let file: HooksFile;
  try {
    file = readHooksFile(path);
  } catch (e) {
    log.error(`Cannot parse ${path}: ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }
  stripOurs(file);
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf8");
  log.info(`Removed planckeys hooks from ${path}`);
};
