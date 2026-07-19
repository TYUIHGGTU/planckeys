/**
 * Hook forwarder. Registered as the `command` for each observed hook event.
 * The agent harness spawns it per event with the hook JSON on stdin.
 *
 * Contract (critical):
 * - Read all of stdin, tag with platform, forward to the bridge's Unix socket.
 * - Write NOTHING to stdout (some events reject non-JSON stdout).
 * - Always exit 0 quickly, even if the daemon is down, so the agent is never
 *   blocked or slowed by a missing/late bridge.
 *
 * Usage: node hookForwarder.js [socketPath] [platform]
 */
import net from "node:net";
import { defaultSocketPath } from "./paths.js";
import { PLATFORM_FIELD } from "./hookEvents.js";
import { isAgentPlatform } from "./types.js";

const sockPath = process.argv[2] ?? defaultSocketPath();
const platformArg = process.argv[3];
const platform = isAgentPlatform(platformArg) ? platformArg : "unknown";
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

const tagPayload = (raw: string): string => {
  const text = raw.trim();
  if (!text) return text;
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    obj[PLATFORM_FIELD] = platform;
    return JSON.stringify(obj);
  } catch {
    return text;
  }
};

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  data += chunk;
});
process.stdin.on("error", finish);
process.stdin.on("end", () => {
  const payload = tagPayload(data);
  const client = net.connect(sockPath);
  client.on("error", finish);
  client.on("connect", () => {
    client.end(payload, () => finish());
  });
});
