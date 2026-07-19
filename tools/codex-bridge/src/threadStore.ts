import {
  AGENT_SLOT_COUNT,
  MATRIX_ROWS,
  Rgb,
  SIDEBAR_INDICES,
  UNDERGLOW_INDICES,
  VISIBLE_LED_INDICES,
  cellIndex,
  scaleRgb,
} from "./protocol.js";
import {
  AgentPlatform,
  ATTENTION_COLOR,
  PLATFORM_COLOR,
  SlotState,
  ThreadStatus,
} from "./types.js";
import { BridgeConfig } from "./config.js";
import { blinkFactor, breatheFactor } from "./effects.js";
import { PixelWrite, stampGlyph, taskGlyphKey } from "./glyphs.js";
import { SnakeAnimator } from "./snake.js";

const emptySlot = (): SlotState => ({
  threadId: null,
  platform: "unknown",
  status: ThreadStatus.Offline,
  updatedAt: 0,
  read: true,
  completedAt: null,
  taskNumber: 0,
});

export interface RenderTarget {
  index: number;
  color: Rgb;
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/**
 * Priority for the whole-board single-platform display. In-progress work ranks
 * above a stale completion so an active platform keeps the board (attention
 * states still win).
 */
const BOARD_PRIORITY: Record<ThreadStatus, number> = {
  [ThreadStatus.Error]: 5,
  [ThreadStatus.RequiresInput]: 4,
  [ThreadStatus.Working]: 3,
  [ThreadStatus.CompleteUnread]: 2,
  [ThreadStatus.Idle]: 0,
  [ThreadStatus.Offline]: 0,
};

/**
 * Holds the 6 Agent slots, maps session ids onto them, applies the state
 * machine, and renders the dot-matrix frame (glyphs / snake / sidebar).
 */
export class ThreadStore {
  private readonly slots: SlotState[] = Array.from(
    { length: AGENT_SLOT_COUNT },
    emptySlot,
  );
  /** Per-platform monotonically increasing task counter. */
  private readonly seq = new Map<AgentPlatform, number>();
  /** epoch ms of the last status event (drives the auto-off timer). */
  private lastEventAt = 0;
  private readonly snake = new SnakeAnimator();

  constructor(private readonly config: BridgeConfig) {}

  private slotOf(threadId: string): number {
    return this.slots.findIndex((s) => s.threadId === threadId);
  }

  private nextTaskNumber(platform: AgentPlatform): number {
    const c = (this.seq.get(platform) ?? 0) + 1;
    this.seq.set(platform, c);
    return ((c - 1) % 9) + 1; // 1..9, cycles
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
    platform: AgentPlatform = "unknown",
  ): boolean {
    const slotIdx = this.resolveSlot(threadId);
    if (slotIdx < 0) return false;

    const slot = this.slots[slotIdx];
    if (slot.threadId !== threadId) {
      slot.threadId = threadId;
      slot.read = true;
      slot.completedAt = null;
      // New session binds a slot -> assign the next per-platform task number.
      slot.taskNumber = this.nextTaskNumber(platform);
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

  private isActive(s: SlotState): boolean {
    if (s.threadId === null) return false;
    if (s.status === ThreadStatus.CompleteUnread && s.read) return false;
    return BOARD_PRIORITY[s.status] > 0;
  }

  /** The single slot that owns the whole board, or null when nothing active. */
  private boardSlot(): SlotState | null {
    let best: SlotState | null = null;
    let bestRank = 0;
    for (const s of this.slots) {
      if (!this.isActive(s)) continue;
      const rank = BOARD_PRIORITY[s.status];
      if (
        rank > bestRank ||
        (rank === bestRank && best && s.updatedAt > best.updatedAt)
      ) {
        bestRank = rank;
        best = s;
      }
    }
    return best;
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
    if (this.boardSlot() === null) return null; // already blank
    return Math.max(0, this.lastEventAt + this.config.idleOffMs - now);
  }

  needsAnimation(now = Date.now()): boolean {
    if (this.shouldSleep(now)) return false;
    const active = this.boardSlot();
    if (!active) return false;
    if (
      active.status === ThreadStatus.Working ||
      active.status === ThreadStatus.RequiresInput ||
      active.status === ThreadStatus.Error
    ) {
      return true;
    }
    if (
      active.status === ThreadStatus.CompleteUnread &&
      active.completedAt !== null &&
      now - active.completedAt < this.config.completeHoldMs
    ) {
      return true; // still in the bright-hold; will settle to soft-unread
    }
    return false;
  }

  /** Distinct other-platform hints for the c3 sidebar (background activity). */
  private sidebarPlatforms(owner: SlotState): AgentPlatform[] {
    const seen = new Set<AgentPlatform>([owner.platform]);
    const out: AgentPlatform[] = [];
    const actives = this.slots
      .filter((s) => this.isActive(s))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    for (const s of actives) {
      if (seen.has(s.platform)) continue;
      seen.add(s.platform);
      out.push(s.platform);
      if (out.length >= SIDEBAR_INDICES.length) break;
    }
    return out;
  }

  private paintMain(active: SlotState, now: number): PixelWrite[] {
    const platform = PLATFORM_COLOR[active.platform];
    switch (active.status) {
      case ThreadStatus.Working: {
        if (this.config.workingEffect === "snake") {
          this.snake.ensureOwner(active.threadId ?? "", platform);
          this.snake.step(now, this.config.snakeStepMs);
          return this.snake.render();
        }
        // breathe: fill the whole main area
        const f = breatheFactor(now, this.config.breathePeriodMs);
        const color = scaleRgb(platform, f);
        const writes: PixelWrite[] = [];
        for (let r = 0; r < MATRIX_ROWS; r++) {
          for (let c = 0; c < 3; c++) {
            const idx = cellIndex(r, c);
            if (idx !== null) writes.push({ index: idx, color });
          }
        }
        return writes;
      }
      case ThreadStatus.RequiresInput: {
        const f = blinkFactor(now, this.config.blinkPeriodMs);
        return stampGlyph("?", scaleRgb(ATTENTION_COLOR.requiresInput, f));
      }
      case ThreadStatus.Error: {
        const f = blinkFactor(now, this.config.blinkPeriodMs);
        return stampGlyph("!", scaleRgb(ATTENTION_COLOR.error, f));
      }
      case ThreadStatus.CompleteUnread: {
        const age = active.completedAt === null ? 0 : now - active.completedAt;
        const color =
          age < this.config.completeHoldMs
            ? platform
            : scaleRgb(platform, this.config.softUnreadFactor);
        return stampGlyph(taskGlyphKey(active.taskNumber), color);
      }
      default:
        return [];
    }
  }

  render(now = Date.now()): RenderTarget[] {
    const canvas = new Map<number, Rgb>();
    for (const idx of VISIBLE_LED_INDICES) canvas.set(idx, BLACK);
    for (const idx of UNDERGLOW_INDICES) canvas.set(idx, BLACK);

    const active = this.shouldSleep(now) ? null : this.boardSlot();

    if (active) {
      for (const w of this.paintMain(active, now)) canvas.set(w.index, w.color);

      // c3 sidebar: hint other platforms still running in the background.
      const others = this.sidebarPlatforms(active);
      others.forEach((p, i) => {
        const idx = SIDEBAR_INDICES[i];
        if (idx !== undefined) canvas.set(idx, scaleRgb(PLATFORM_COLOR[p], 0.5));
      });

      if (this.config.underglow) {
        const under = scaleRgb(
          PLATFORM_COLOR[active.platform],
          this.config.underglowFactor,
        );
        for (const idx of UNDERGLOW_INDICES) canvas.set(idx, under);
      }
    }

    return [...canvas.entries()].map(([index, color]) => ({ index, color }));
  }
}
