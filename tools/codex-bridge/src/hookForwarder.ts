/**
 * Codex hook forwarder. Registered as the `command` for each observed hook
 * event. Codex spawns it per event with the hook JSON on stdin.
 *
 * Contract (critical):
 * - Read all of stdin, forward it verbatim to the bridge's Unix socket.
 * - Write NOTHING to stdout (some events reject non-JSON stdout).
 * - Always exit 0 quickly, even if the daemon is down, so codex is never
 *   blocked or slowed by a missing/late bridge.
 *
 * Usage: node hookForwarder.js [socketPath]
 */
import net from "node:net";
import { defaultSocketPath } from "./paths.js";

const sockPath = process.argv[2] ?? defaultSocketPath();
const HARD_TIMEOUT_MS = 1500;

let data = "";
let finished = false;

const finish = (): void => {
  if (finished) return;
  finished = true;
  process.exit(0);
};

// Absolute failsafe: never hang the agent loop.
const killer = setTimeout(finish, HARD_TIMEOUT_MS);
killer.unref();

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  data += chunk;
});
process.stdin.on("error", finish);
process.stdin.on("end", () => {
  const client = net.connect(sockPath);
  client.on("error", finish);
  client.on("connect", () => {
    client.end(data, () => finish());
  });
});
