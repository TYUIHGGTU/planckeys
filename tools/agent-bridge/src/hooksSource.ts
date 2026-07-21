import net from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import { log } from "./logger.js";
import { CodexSource, CodexSourceEmitter } from "./source.js";
import {
  HookPayload,
  isCursorSubagent,
  mapHook,
  PLATFORM_FIELD,
  resolvePlatform,
} from "./hookEvents.js";

/**
 * Global source: listens on a Unix domain socket that per-event hook forwarder
 * processes connect to. Because hooks run in the shared agent harness, this
 * observes every client that has trusted / installed the hooks.
 *
 * Each connection carries exactly one hook payload (read until EOF, then parse).
 */
export class HooksSource implements CodexSource {
  readonly events = new CodexSourceEmitter();
  private server: net.Server | null = null;

  constructor(
    private readonly socketPath: string,
    private readonly trackSubagents = false,
  ) {}

  start(): void {
    // Clean up a stale socket file from a previous run.
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch (e) {
        log.warn("Could not remove stale socket:", (e as Error).message);
      }
    }

    const server = net.createServer((conn) => {
      let buf = "";
      conn.setEncoding("utf8");
      conn.on("data", (c) => {
        buf += c;
      });
      conn.on("error", () => {
        /* forwarder may drop; ignore */
      });
      conn.on("end", () => this.handlePayload(buf));
    });

    server.on("error", (e) => {
      log.error("Hook socket server error:", (e as Error).message);
    });

    server.listen(this.socketPath, () => {
      log.info(`Listening for agent hooks on ${this.socketPath}`);
      this.events.emit("open");
    });

    this.server = server;
  }

  private handlePayload(raw: string): void {
    const text = raw.trim();
    if (!text) return;
    let payload: HookPayload;
    try {
      payload = JSON.parse(text) as HookPayload;
    } catch {
      log.debug("Ignoring non-JSON hook payload:", text.slice(0, 120));
      return;
    }
    log.debug(
      `hook ${payload.hook_event_name ?? "?"} platform=${payload[PLATFORM_FIELD] ?? "?"} ` +
        `session_id=${payload.session_id ?? "-"} conversation_id=${payload.conversation_id ?? "-"} ` +
        `generation_id=${payload.generation_id ?? "-"}`,
    );
    // Full payload (keys + values) so we can see any parent/subagent linkage
    // fields the bridge does not model yet.
    log.debug(`  raw=${text.slice(0, 800)}`);

    // Cursor subagents run under their own conversation_id with no parent link;
    // skip them unless explicitly tracked, so one user chat = one lamp.
    if (!this.trackSubagents && isCursorSubagent(payload, resolvePlatform(payload))) {
      log.debug(
        `  -> skipped subagent (transcript_path=${payload.transcript_path ?? "null"})`,
      );
      // Still count it as activity so the parent conversation's board does not
      // sleep out during a long subagent run.
      this.events.emit("keepAlive");
      return;
    }

    const mapped = mapHook(payload);
    if (mapped) {
      log.debug(
        `  -> thread=${mapped.threadId} status=${mapped.status} platform=${mapped.platform}`,
      );
      this.events.emit("status", {
        threadId: mapped.threadId,
        status: mapped.status,
        platform: mapped.platform,
      });
    }
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        /* ignore */
      }
    }
    this.events.emit("close");
  }
}
