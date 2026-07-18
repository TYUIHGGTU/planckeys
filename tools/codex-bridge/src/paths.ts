import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Default Unix domain socket the hook forwarder and daemon rendezvous on. */
export const defaultSocketPath = (): string =>
  process.env.PLANCKEYS_BRIDGE_SOCK ??
  join(tmpdir(), "planckeys-codex-bridge.sock");

/** User-level codex hooks config file. */
export const codexHooksPath = (): string =>
  join(homedir(), ".codex", "hooks.json");
