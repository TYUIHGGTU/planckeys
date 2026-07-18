import {
  AGENT_LED_INDICES,
  AGENT_SLOT_COUNT,
  Rgb,
  UNDERGLOW_INDICES,
  scaleRgb,
} from "./protocol.js";
import {
  SlotState,
  STATUS_COLOR,
  STATUS_PRIORITY,
  ThreadStatus,
} from "./types.js";
import { BridgeConfig } from "./config.js";

const emptySlot = (): SlotState => ({
  threadId: null,
  status: ThreadStatus.Offline,
  updatedAt: 0,
  read: true,
});

export interface RenderTarget {
  index: number;
  color: Rgb;
}

/**
 * Holds the 6 Agent slots, maps codex thread ids onto them, applies the state
 * machine, and produces the LED writes for the current frame.
 */
export class ThreadStore {
  private readonly slots: SlotState[] = Array.from(
    { length: AGENT_SLOT_COUNT },
    emptySlot,
  );

  constructor(private readonly config: BridgeConfig) {}

  /** Find the slot bound to a thread id, if any. */
  private slotOf(threadId: string): number {
    return this.slots.findIndex((s) => s.threadId === threadId);
  }

  /**
   * Resolve (or allocate) a slot for a thread id according to the binding
   * strategy. Returns -1 if no slot is available (all busy, none evictable).
   */
  private resolveSlot(threadId: string): number {
    const existing = this.slotOf(threadId);
    if (existing >= 0) return existing;

    // Prefer a truly empty slot.
    const empty = this.slots.findIndex((s) => s.threadId === null);
    if (empty >= 0) return empty;

    if (this.config.binding === "fixed") return -1;

    // "recent": evict the least-recently-updated slot that is idle/offline and
    // already read (never steal an active or attention-needing thread).
    let victim = -1;
    let oldest = Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const evictable =
        s.read &&
        (s.status === ThreadStatus.Idle ||
          s.status === ThreadStatus.Offline ||
          s.status === ThreadStatus.CompleteUnread);
      if (evictable && s.updatedAt < oldest) {
        oldest = s.updatedAt;
        victim = i;
      }
    }
    return victim;
  }

  /**
   * Apply a status for a thread. Enforces the arbitration rule that error must
   * not be silently overwritten by lower-priority transitions from the same
   * event batch is handled by callers; here we always take the reported status
   * but keep `read` bookkeeping for completeUnread.
   */
  setStatus(threadId: string, status: ThreadStatus): boolean {
    const slotIdx = this.resolveSlot(threadId);
    if (slotIdx < 0) return false;

    const slot = this.slots[slotIdx];
    if (slot.threadId !== threadId) {
      slot.threadId = threadId;
      slot.read = true;
    }

    // Do not let a trailing idle transition clear an unread completion; the
    // green must persist until acknowledged. A new turn (working) still wins.
    if (
      status === ThreadStatus.Idle &&
      slot.status === ThreadStatus.CompleteUnread &&
      !slot.read
    ) {
      return true;
    }

    slot.status = status;
    slot.updatedAt = Date.now();

    if (status === ThreadStatus.CompleteUnread) {
      slot.read = false;
    }
    if (
      status === ThreadStatus.Working ||
      status === ThreadStatus.Idle ||
      status === ThreadStatus.Offline
    ) {
      slot.read = true;
    }
    return true;
  }

  snapshot(): readonly SlotState[] {
    return this.slots.map((s) => ({ ...s }));
  }

  /** Highest-priority state across all bound slots (drives underglow). */
  private aggregateStatus(): ThreadStatus | null {
    let best: ThreadStatus | null = null;
    let bestRank = -1;
    for (const s of this.slots) {
      if (s.threadId === null) continue;
      if (s.status === ThreadStatus.CompleteUnread && s.read) continue;
      const rank = STATUS_PRIORITY[s.status];
      if (rank > bestRank) {
        bestRank = rank;
        best = s.status;
      }
    }
    return best;
  }

  private slotColor(slot: SlotState): Rgb {
    if (slot.threadId === null) return STATUS_COLOR[ThreadStatus.Offline];
    const base = STATUS_COLOR[slot.status];
    if (slot.status === ThreadStatus.Idle) {
      return scaleRgb(base, this.config.idleFactor);
    }
    return base;
  }

  /** Compute the LED writes (agent axis LEDs + optional underglow aggregate). */
  render(): RenderTarget[] {
    const targets: RenderTarget[] = [];

    for (let i = 0; i < AGENT_SLOT_COUNT; i++) {
      targets.push({
        index: AGENT_LED_INDICES[i],
        color: this.slotColor(this.slots[i]),
      });
    }

    if (this.config.underglow) {
      const agg = this.aggregateStatus();
      const color =
        agg === null || agg === ThreadStatus.Idle
          ? { r: 0, g: 0, b: 0 }
          : scaleRgb(STATUS_COLOR[agg], this.config.underglowFactor);
      for (const idx of UNDERGLOW_INDICES) {
        targets.push({ index: idx, color });
      }
    }

    return targets;
  }
}
