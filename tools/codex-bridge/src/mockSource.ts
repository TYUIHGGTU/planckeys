import { log } from "./logger.js";
import { CodexSource, CodexSourceEmitter } from "./source.js";
import { ThreadStatus } from "./types.js";

interface ScriptStep {
  afterMs: number;
  threadId: string;
  status: ThreadStatus;
}

/**
 * Deterministic offline stand-in for `codex app-server`. Cycles 6 fake threads
 * through every status so the full pipeline (state machine -> render -> HID)
 * can be exercised without the Codex CLI or a keyboard attached.
 */
export class MockSource implements CodexSource {
  readonly events = new CodexSourceEmitter();
  private timers: NodeJS.Timeout[] = [];
  private loopTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  private readonly threads = ["t1", "t2", "t3", "t4", "t5", "t6"];

  start(): void {
    this.stopped = false;
    this.events.emit("open");
    log.info("Mock app-server started (offline self-test).");
    this.runCycle();
    // Repeat the scripted cycle so the demo keeps animating.
    this.loopTimer = setInterval(() => this.runCycle(), 16000);
  }

  private schedule(step: ScriptStep): void {
    const t = setTimeout(() => {
      if (this.stopped) return;
      this.events.emit("status", {
        threadId: step.threadId,
        status: step.status,
      });
      log.info(`[mock] ${step.threadId} -> ${step.status}`);
    }, step.afterMs);
    this.timers.push(t);
  }

  private runCycle(): void {
    // Bind all 6 threads to idle first.
    this.threads.forEach((id) => this.schedule({ afterMs: 100, threadId: id, status: ThreadStatus.Idle }));

    const script: ScriptStep[] = [
      { afterMs: 1500, threadId: "t1", status: ThreadStatus.Working },
      { afterMs: 2500, threadId: "t2", status: ThreadStatus.Working },
      { afterMs: 4000, threadId: "t1", status: ThreadStatus.CompleteUnread },
      { afterMs: 5000, threadId: "t3", status: ThreadStatus.Working },
      { afterMs: 6500, threadId: "t2", status: ThreadStatus.RequiresInput },
      { afterMs: 8000, threadId: "t4", status: ThreadStatus.Working },
      { afterMs: 9000, threadId: "t3", status: ThreadStatus.Error },
      { afterMs: 10500, threadId: "t2", status: ThreadStatus.Working },
      { afterMs: 11500, threadId: "t2", status: ThreadStatus.CompleteUnread },
      { afterMs: 12500, threadId: "t3", status: ThreadStatus.Idle },
      { afterMs: 13500, threadId: "t4", status: ThreadStatus.CompleteUnread },
      { afterMs: 14500, threadId: "t1", status: ThreadStatus.Idle },
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
