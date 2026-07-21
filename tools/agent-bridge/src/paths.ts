import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Default Unix domain socket the hook forwarder and daemon rendezvous on. */
export const defaultSocketPath = (): string =>
  process.env.PLANCKEYS_BRIDGE_SOCK ??
  join(tmpdir(), "planckeys-agent-bridge.sock");

/** User-level codex hooks config file. */
export const codexHooksPath = (): string =>
  join(homedir(), ".codex", "hooks.json");

/** User-level CodeBuddy settings file (hooks live under the `hooks` key). */
export const codebuddySettingsPath = (): string =>
  join(homedir(), ".codebuddy", "settings.json");

/** User-level Claude Code settings file (hooks live under the `hooks` key). */
export const claudeSettingsPath = (): string =>
  join(homedir(), ".claude", "settings.json");

/** User-level WorkBuddy desktop settings file (hooks live under the `hooks` key). */
export const workbuddySettingsPath = (): string =>
  join(homedir(), ".workbuddy", "settings.json");

/** User-level Cursor hooks config (`version` + flat `hooks` map). */
export const cursorHooksPath = (): string =>
  join(homedir(), ".cursor", "hooks.json");
