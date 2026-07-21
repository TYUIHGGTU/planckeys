import {
  ALERT_CELLS,
  CONVO_INDICES,
  CONVO_SLOT_COUNT,
  GLOBAL_ROW_INDICES,
  Rgb,
  UNDERGLOW_INDICES,
  VISIBLE_LED_INDICES,
  scaleRgb,
} from "./protocol.js";
import {
  ATTENTION_COLOR,
  GLOBAL_COLOR,
  PLATFORM_COLOR,
  SlotState,
  ThreadStatus,
} from "./types.js";
import { BridgeConfig } from "./config.js";
import { blinkFactor, breatheFactor } from "./effects.js";

const emptySlot = (): SlotState => ({
  threadId: null,
  platform: "unknown",
  status: ThreadStatus.Offline,
  updatedAt: 0,
  read: true,
  completedAt: null,
});

export interface RenderTarget {
  index: number;
  color: Rgb;
}

interface PixelWrite {
  index: number;
  color: Rgb;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * The aggregate state shown on the global bar / used for auto-sleep. Ordered by
 * priority: attention (error, needs-input) beats in-progress, which beats a
 * stale completion. `null` means nothing active.
 */
type GlobalState =
  | ThreadStatus.Error
  | ThreadStatus.RequiresInput
  | ThreadStatus.Working
  | ThreadStatus.CompleteUnread
  | null;

/**
 * Dashboard state machine. Maps session ids onto 8 conversation slots and
 * renders three zones:
 *   - row 0        : global aggregate status bar
 *   - rows 1-2     : per-conversation cells (platform hue + status motion)
 *   - rows 3-5     : attention alert region (silent unless input/error)
 */
export class ThreadStore {
  private readonly slots: SlotState[] = Array.from(
    { length: CONVO_SLOT_COUNT },
    emptySlot,
  );
  /** epoch ms of the last status event (drives the auto-off timer). */
  private lastEventAt = 0;

  constructor(private readonly config: BridgeConfig) {}

  private slotOf(threadId: string): number {
    return this.slots.findIndex((s) => s.threadId === threadId);
  }

  private resolveSlot(threadId: string): number {
    const existing = this.slotOf(threadId);
    if (existing >= 0) return existing;

    const empty = this.slots.findIndex((s) => s.threadId === null);
    if (empty >= 0) return empty;

    if (this.config.binding === "fixed") return -1;

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

  setStatus(
    threadId: string,
    status: ThreadStatus,
    platform: SlotState["platform"] = "unknown",
  ): boolean {
    const slotIdx = this.resolveSlot(threadId);
    if (slotIdx < 0) return false;

    const slot = this.slots[slotIdx];
    if (slot.threadId !== threadId) {
      slot.threadId = threadId;
      slot.read = true;
      slot.completedAt = null;
    }
    slot.platform = platform;
    this.lastEventAt = Date.now();

    // requiresInput only makes sense mid-turn; a Notification landing on an
    // idle/complete chat is the 60s idle reminder, not a real approval. Only
    // accept it while Working, else the board sticks on amber forever.
    if (
      status === ThreadStatus.RequiresInput &&
      slot.status !== ThreadStatus.Working
    ) {
      return true;
    }

    // Do not let a trailing idle clear an unread completion.
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
      slot.completedAt = slot.updatedAt;
    } else {
      slot.completedAt = null;
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

  /** A slot counts as "unread complete" while it still awaits acknowledgement. */
  private isUnreadComplete(s: SlotState): boolean {
    return s.status === ThreadStatus.CompleteUnread && !s.read;
  }

  /** Highest-priority aggregate state across all bound slots. */
  private globalState(): GlobalState {
    let hasError = false;
    let hasRequiresInput = false;
    let hasWorking = false;
    let hasUnread = false;
    for (const s of this.slots) {
      if (s.threadId === null) continue;
      switch (s.status) {
        case ThreadStatus.Error:
          hasError = true;
          break;
        case ThreadStatus.RequiresInput:
          hasRequiresInput = true;
          break;
        case ThreadStatus.Working:
          hasWorking = true;
          break;
        case ThreadStatus.CompleteUnread:
          if (!s.read) hasUnread = true;
          break;
        default:
          break;
      }
    }
    if (hasError) return ThreadStatus.Error;
    if (hasRequiresInput) return ThreadStatus.RequiresInput;
    if (hasWorking) return ThreadStatus.Working;
    if (hasUnread) return ThreadStatus.CompleteUnread;
    return null;
  }

  /** Most recent completion time among unread-complete slots, or null. */
  private latestCompletion(): number | null {
    let latest: number | null = null;
    for (const s of this.slots) {
      if (!this.isUnreadComplete(s) || s.completedAt === null) continue;
      if (latest === null || s.completedAt > latest) latest = s.completedAt;
    }
    return latest;
  }

  /** True if any slot is working / needs input / errored (never auto-sleeps). */
  private hasUrgent(): boolean {
    return this.slots.some(
      (s) =>
        s.threadId !== null &&
        (s.status === ThreadStatus.Working ||
          s.status === ThreadStatus.RequiresInput ||
          s.status === ThreadStatus.Error),
    );
  }

  private shouldSleep(now: number): boolean {
    if (this.config.idleOffMs <= 0) return false;
    if (this.hasUrgent()) return false;
    return now - this.lastEventAt >= this.config.idleOffMs;
  }

  /** ms until the board should auto-sleep, or null if not applicable. */
  msUntilSleep(now = Date.now()): number | null {
    if (this.config.idleOffMs <= 0 || this.hasUrgent()) return null;
    if (this.globalState() === null) return null; // already blank
    return Math.max(0, this.lastEventAt + this.config.idleOffMs - now);
  }

  needsAnimation(now = Date.now()): boolean {
    if (this.shouldSleep(now)) return false;
    const state = this.globalState();
    if (
      state === ThreadStatus.Error ||
      state === ThreadStatus.RequiresInput ||
      state === ThreadStatus.Working
    ) {
      return true;
    }
    if (state === ThreadStatus.CompleteUnread) {
      const done = this.latestCompletion();
      return done !== null && now - done < this.config.completeHoldMs;
    }
    return false;
  }

  /** Row 0: one aggregate signal for the whole board. */
  private paintGlobal(state: GlobalState, now: number): PixelWrite[] {
    const cells = GLOBAL_ROW_INDICES;
    switch (state) {
      case ThreadStatus.Working: {
        // Amber back-and-forth scanner (KITT-style) across the row.
        const period = this.config.marqueePeriodMs;
        const t = (now % period) / period;
        const tri = t < 0.5 ? t * 2 : 2 - t * 2; // 0 -> 1 -> 0
        const pos = tri * (cells.length - 1);
        return cells.map((index, i) => {
          const f = Math.max(0.06, 1 - Math.abs(i - pos));
          return { index, color: scaleRgb(GLOBAL_COLOR.working, f) };
        });
      }
      case ThreadStatus.RequiresInput: {
        const f = blinkFactor(now, this.config.blinkPeriodMs);
        const color = scaleRgb(GLOBAL_COLOR.requiresInput, f);
        return cells.map((index) => ({ index, color }));
      }
      case ThreadStatus.Error: {
        const f = blinkFactor(now, this.config.blinkPeriodMs);
        const color = scaleRgb(GLOBAL_COLOR.error, f);
        return cells.map((index) => ({ index, color }));
      }
      case ThreadStatus.CompleteUnread: {
        const done = this.latestCompletion();
        const age = done === null ? Infinity : now - done;
        const color =
          age < this.config.completeHoldMs
            ? GLOBAL_COLOR.completeUnread
            : scaleRgb(GLOBAL_COLOR.completeUnread, this.config.softUnreadFactor);
        return cells.map((index) => ({ index, color }));
      }
      default:
        return [];
    }
  }

  /** Color for a single conversation cell, or null when it should stay off. */
  private convoColor(slot: SlotState, now: number): Rgb | null {
    const platform = PLATFORM_COLOR[slot.platform];
    switch (slot.status) {
      case ThreadStatus.Working:
        return scaleRgb(platform, breatheFactor(now, this.config.breathePeriodMs));
      case ThreadStatus.RequiresInput:
        return scaleRgb(
          ATTENTION_COLOR.requiresInput,
          blinkFactor(now, this.config.blinkPeriodMs),
        );
      case ThreadStatus.Error:
        return scaleRgb(
          ATTENTION_COLOR.error,
          blinkFactor(now, this.config.blinkPeriodMs),
        );
      case ThreadStatus.CompleteUnread: {
        const age = slot.completedAt === null ? Infinity : now - slot.completedAt;
        return age < this.config.completeHoldMs
          ? platform
          : scaleRgb(platform, this.config.softUnreadFactor);
      }
      default:
        return null; // idle / offline / unbound -> off
    }
  }

  /** Rows 1-2: one cell per conversation, platform hue + status motion. */
  private paintConvos(now: number): PixelWrite[] {
    const writes: PixelWrite[] = [];
    for (let i = 0; i < CONVO_SLOT_COUNT; i++) {
      const slot = this.slots[i];
      if (slot.threadId === null) continue;
      const color = this.convoColor(slot, now);
      if (color) writes.push({ index: CONVO_INDICES[i], color });
    }
    return writes;
  }

  /** Rows 3-5: a can't-miss pulsing wave only when a human is needed. */
  private paintAlert(state: GlobalState, now: number): PixelWrite[] {
    if (
      state !== ThreadStatus.Error &&
      state !== ThreadStatus.RequiresInput
    ) {
      return []; // silent otherwise
    }
    const base =
      state === ThreadStatus.Error
        ? GLOBAL_COLOR.error
        : ATTENTION_COLOR.requiresInput;
    const w = (Math.PI * 2) / this.config.alertPeriodMs;
    return ALERT_CELLS.map((cell) => {
      const phase = (cell.row - 3) * 0.9; // wave flows down the rows
      const level = 0.5 + 0.5 * Math.sin(now * w - phase);
      return { index: cell.index, color: scaleRgb(base, 0.15 + 0.85 * level) };
    });
  }

  /** Semantic underglow color for the current aggregate state. */
  private underglowColor(state: GlobalState): Rgb | null {
    switch (state) {
      case ThreadStatus.Error:
        return GLOBAL_COLOR.error;
      case ThreadStatus.RequiresInput:
        return GLOBAL_COLOR.requiresInput;
      case ThreadStatus.Working:
        return GLOBAL_COLOR.working;
      case ThreadStatus.CompleteUnread:
        return GLOBAL_COLOR.completeUnread;
      default:
        return null;
    }
  }

  render(now = Date.now()): RenderTarget[] {
    const canvas = new Map<number, Rgb>();
    for (const idx of VISIBLE_LED_INDICES) canvas.set(idx, BLACK);
    for (const idx of UNDERGLOW_INDICES) canvas.set(idx, BLACK);

    if (!this.shouldSleep(now)) {
      const state = this.globalState();
      for (const w of this.paintGlobal(state, now)) canvas.set(w.index, w.color);
      for (const w of this.paintConvos(now)) canvas.set(w.index, w.color);
      for (const w of this.paintAlert(state, now)) canvas.set(w.index, w.color);

      if (this.config.underglow) {
        const under = this.underglowColor(state);
        if (under) {
          const color = scaleRgb(under, this.config.underglowFactor);
          for (const idx of UNDERGLOW_INDICES) canvas.set(idx, color);
        }
      }
    }

    return [...canvas.entries()].map(([index, color]) => ({ index, color }));
  }
}
