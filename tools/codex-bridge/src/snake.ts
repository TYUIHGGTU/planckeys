import { cellIndex, MATRIX_ROWS, Rgb, scaleRgb } from "./protocol.js";
import { PixelWrite } from "./glyphs.js";

interface Cell {
  x: number; // col 0..MAIN_COLS-1
  y: number; // row 0..MATRIX_ROWS-1
}

const MAIN_W = 3; // columns 0..2 (fully populated)
const MAIN_H = MATRIX_ROWS; // 6

const key = (c: Cell): string => `${c.x},${c.y}`;

/** Blend a color toward white by t in [0,1] (used to make the head pop). */
const mixWhite = (c: Rgb, t: number): Rgb => ({
  r: Math.round(c.r + (255 - c.r) * t),
  g: Math.round(c.g + (255 - c.g) * t),
  b: Math.round(c.b + (255 - c.b) * t),
});

/**
 * A small self-driving snake used as the "working" animation. It lives on the
 * 3×6 main matrix area, moves greedily toward food, grows on eating, and is
 * rendered in the owning platform's color (brighter head, white food).
 *
 * Not a game — no player. Purely an "alive / thinking" indicator.
 */
export class SnakeAnimator {
  private body: Cell[] = [];
  private food: Cell = { x: 0, y: 0 };
  private lastStepAt = 0;
  private color: Rgb = { r: 255, g: 255, b: 255 };
  private ownerKey = "";
  private readonly maxLen = MAIN_W * MAIN_H - 2;
  /** Contrast color for the food so it stands apart from any platform hue. */
  private readonly foodColor: Rgb = { r: 255, g: 176, b: 0 };

  /** (Re)start the snake for a new owner/color if the owner changed. */
  ensureOwner(ownerKey: string, color: Rgb): void {
    this.color = color;
    if (ownerKey === this.ownerKey && this.body.length > 0) return;
    this.ownerKey = ownerKey;
    this.reset();
  }

  private reset(): void {
    const cy = Math.floor(MAIN_H / 2);
    // Start 3 long so the head->tail direction reads immediately.
    this.body = [
      { x: 2, y: cy },
      { x: 1, y: cy },
      { x: 0, y: cy },
    ];
    this.placeFood();
  }

  private placeFood(): void {
    const occupied = new Set(this.body.map(key));
    const free: Cell[] = [];
    for (let y = 0; y < MAIN_H; y++) {
      for (let x = 0; x < MAIN_W; x++) {
        const c = { x, y };
        if (!occupied.has(key(c))) free.push(c);
      }
    }
    if (free.length === 0) {
      // Board full: shrink so the snake keeps moving instead of freezing.
      this.body = this.body.slice(0, 2);
      this.placeFood();
      return;
    }
    this.food = free[Math.floor(Math.random() * free.length)];
  }

  /** Advance the snake if enough wall-clock time has elapsed. */
  step(now: number, stepMs: number): void {
    if (this.body.length === 0) this.reset();
    if (now - this.lastStepAt < stepMs) return;
    this.lastStepAt = now;

    const head = this.body[0];
    const bodySet = new Set(this.body.slice(0, -1).map(key)); // tail frees up
    const candidates: Cell[] = [
      { x: head.x + 1, y: head.y },
      { x: head.x - 1, y: head.y },
      { x: head.x, y: head.y + 1 },
      { x: head.x, y: head.y - 1 },
    ].filter(
      (c) =>
        c.x >= 0 &&
        c.x < MAIN_W &&
        c.y >= 0 &&
        c.y < MAIN_H &&
        !bodySet.has(key(c)),
    );

    if (candidates.length === 0) {
      this.reset();
      return;
    }

    // Greedy: pick the neighbor closest to the food.
    candidates.sort(
      (a, b) =>
        Math.abs(a.x - this.food.x) +
        Math.abs(a.y - this.food.y) -
        (Math.abs(b.x - this.food.x) + Math.abs(b.y - this.food.y)),
    );
    const next = candidates[0];
    this.body.unshift(next);

    if (next.x === this.food.x && next.y === this.food.y) {
      if (this.body.length > this.maxLen) this.body.pop();
      this.placeFood();
    } else {
      this.body.pop();
    }
  }

  render(): PixelWrite[] {
    const writes: PixelWrite[] = [];
    const len = this.body.length;
    for (let i = 0; i < len; i++) {
      const c = this.body[i];
      const idx = cellIndex(c.y, c.x);
      if (idx === null) continue;
      let color: Rgb;
      if (i === 0) {
        // Head pops as a brightened, near-white tint of the platform color.
        color = mixWhite(this.color, 0.4);
      } else {
        // Neck (full) -> tail (dim), a strong linear gradient.
        const denom = Math.max(1, len - 2);
        const f = 1 - ((i - 1) / denom) * 0.85;
        color = scaleRgb(this.color, f);
      }
      writes.push({ index: idx, color });
    }
    const fidx = cellIndex(this.food.y, this.food.x);
    if (fidx !== null) {
      writes.push({ index: fidx, color: this.foodColor });
    }
    return writes;
  }
}
