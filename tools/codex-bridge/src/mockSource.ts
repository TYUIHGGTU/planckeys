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
  ];

  start(): void {
    this.stopped = false;
    this.events.emit("open");
    log.info("Mock app-server started (offline self-test).");
    this.runCycle();
    // Repeat the scripted cycle so the demo keeps animating.
    this.loopTimer = setInterval(() => this.runCycle(), 20000);
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

    const script: ScriptStep[] = [
      {
        afterMs: 1500,
        threadId: "t1",
        status: ThreadStatus.Working,
        platform: "cursor",
      },
      {
        afterMs: 2500,
        threadId: "t2",
        status: ThreadStatus.Working,
        platform: "codebuddy",
      },
      {
        afterMs: 4000,
        threadId: "t1",
        status: ThreadStatus.CompleteUnread,
        platform: "cursor",
      },
      {
        afterMs: 5000,
        threadId: "t3",
        status: ThreadStatus.Working,
        platform: "workbuddy",
      },
      {
        afterMs: 6500,
        threadId: "t2",
        status: ThreadStatus.RequiresInput,
        platform: "codebuddy",
      },
      {
        afterMs: 8000,
        threadId: "t4",
        status: ThreadStatus.Working,
        platform: "codex",
      },
      {
        afterMs: 9000,
        threadId: "t3",
        status: ThreadStatus.Error,
        platform: "workbuddy",
      },
      {
        afterMs: 10500,
        threadId: "t2",
        status: ThreadStatus.Working,
        platform: "codebuddy",
      },
      {
        afterMs: 11500,
        threadId: "t2",
        status: ThreadStatus.CompleteUnread,
        platform: "codebuddy",
      },
      {
        afterMs: 12500,
        threadId: "t3",
        status: ThreadStatus.Idle,
        platform: "workbuddy",
      },
      {
        afterMs: 13500,
        threadId: "t4",
        status: ThreadStatus.CompleteUnread,
        platform: "codex",
      },
      {
        afterMs: 14500,
        threadId: "t5",
        status: ThreadStatus.Working,
        platform: "claude",
      },
      {
        afterMs: 16000,
        threadId: "t5",
        status: ThreadStatus.CompleteUnread,
        platform: "claude",
      },
      {
        afterMs: 17000,
        threadId: "t1",
        status: ThreadStatus.Idle,
        platform: "cursor",
      },
    ];
    script.forEach((s) => this.schedule(s));
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
