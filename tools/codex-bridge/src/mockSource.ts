import { log } from "./logger.js";
import { CodexSource, CodexSourceEmitter } from "./source.js";
import { AgentPlatform, ThreadStatus } from "./types.js";

interface ScriptStep {
  afterMs: number;
  threadId: string;
  status: ThreadStatus;
  platform: AgentPlatform;
}

/**
 * Deterministic offline stand-in for agent hooks. Cycles fake threads across
 * platforms through every status so the full pipeline (state machine ->
 * platform colors / breathe / blink -> HID) can be exercised without a client
 * or keyboard attached.
 */
export class MockSource implements CodexSource {
  readonly events = new CodexSourceEmitter();
  private timers: NodeJS.Timeout[] = [];
  private loopTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly threads: { id: string; platform: AgentPlatform }[] = [
    { id: "t1", platform: "cursor" },
    { id: "t2", platform: "codebuddy" },
    { id: "t3", platform: "workbuddy" },
    { id: "t4", platform: "codex" },
    { id: "t5", platform: "claude" },
    { id: "t6", platform: "cursor" },
    { id: "t7", platform: "codebuddy" },
    { id: "t8", platform: "codex" },
  ];

  start(): void {
    this.stopped = false;
    this.events.emit("open");
    log.info("Mock app-server started (offline self-test).");
    this.runCycle();
    // Repeat the scripted cycle so the demo keeps animating.
    this.loopTimer = setInterval(() => this.runCycle(), 22000);
  }

  private schedule(step: ScriptStep): void {
    const t = setTimeout(() => {
      if (this.stopped) return;
      this.events.emit("status", {
        threadId: step.threadId,
        status: step.status,
        platform: step.platform,
      });
      log.info(
        `[mock] ${step.platform}/${step.threadId} -> ${step.status}`,
      );
    }, step.afterMs);
    this.timers.push(t);
  }

  private runCycle(): void {
    // Bind all threads to idle first.
    this.threads.forEach(({ id, platform }) =>
      this.schedule({
        afterMs: 100,
        threadId: id,
        status: ThreadStatus.Idle,
        platform,
      }),
    );

    const byId = new Map(this.threads.map((t) => [t.id, t.platform]));
    const step = (afterMs: number, id: string, status: ThreadStatus): void =>
      this.schedule({
        afterMs,
        threadId: id,
        status,
        platform: byId.get(id) ?? "unknown",
      });

    // Ramp several conversations into "working": global row is amber marquee,
    // the busy convo cells breathe in their platform colors.
    step(1200, "t1", ThreadStatus.Working);
    step(2000, "t2", ThreadStatus.Working);
    step(2800, "t3", ThreadStatus.Working);
    step(3600, "t4", ThreadStatus.Working);

    // A completion lands while others keep going (stays working globally).
    step(4800, "t1", ThreadStatus.CompleteUnread);
    step(5600, "t5", ThreadStatus.Working);

    // Needs input: global row flips to yellow, alert region wakes amber.
    step(6400, "t2", ThreadStatus.RequiresInput);
    step(8000, "t2", ThreadStatus.Working);

    // Error: global row goes red, alert region pulses red.
    step(8800, "t6", ThreadStatus.Working);
    step(9600, "t3", ThreadStatus.Error);
    step(11000, "t3", ThreadStatus.Working);

    // Fill all 8 conversation cells.
    step(11800, "t7", ThreadStatus.Working);
    step(12600, "t8", ThreadStatus.Working);

    // Everyone finishes -> global row settles to green (hold, then dim).
    step(13600, "t2", ThreadStatus.CompleteUnread);
    step(14200, "t3", ThreadStatus.CompleteUnread);
    step(14800, "t4", ThreadStatus.CompleteUnread);
    step(15400, "t5", ThreadStatus.CompleteUnread);
    step(16000, "t6", ThreadStatus.CompleteUnread);
    step(16600, "t7", ThreadStatus.CompleteUnread);
    step(17200, "t8", ThreadStatus.CompleteUnread);
  }

  stop(): void {
    this.stopped = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    this.events.emit("close");
  }
}
