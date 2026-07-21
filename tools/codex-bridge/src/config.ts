import { LogLevel } from "./logger.js";
import { defaultSocketPath } from "./paths.js";

export type SourceKind = "hooks" | "mock";

export interface BridgeConfig {
  /** Where thread state comes from. `hooks` is the real, global source. */
  source: SourceKind;
  /** Unix socket path the hooks source listens on / forwarder connects to. */
  socketPath: string;
  /** Global LED brightness pushed via 0xA1 (0..255). */
  brightness: number;
  /**
   * Soft-unread brightness factor (0..1) after the complete bright-hold window.
   * Keeps a faint platform-colored reminder until the next turn.
   */
  softUnreadFactor: number;
  /** How long complete stays at full brightness before soft-unread (ms). */
  completeHoldMs: number;
  /** Host-side breathe period for working conversation cells (ms). */
  breathePeriodMs: number;
  /** Host-side blink period for requiresInput / error (ms). */
  blinkPeriodMs: number;
  /** Animation / complete-hold tick rate (frames per second). */
  animFps: number;
  /** Global-row "working" scanner sweep period (ms). */
  marqueePeriodMs: number;
  /** Alert-region wave pulse period (ms). */
  alertPeriodMs: number;
  /**
   * Auto-off: when nothing is working/needs-input/errored, blank the whole
   * board after this many ms since the last event (Codex Micro style, 3 min).
   * Any new event wakes it. 0 disables.
   */
  idleOffMs: number;
  /** Light up the underglow (0..5) as an aggregate "needs attention" signal. */
  underglow: boolean;
  /** Underglow aggregate brightness factor (0..1). */
  underglowFactor: number;
  /** Reconnect backoff (ms) for the HID device. */
  hidReconnectMs: number;
  /** Slot binding strategy. */
  binding: "recent" | "fixed";
  /**
   * Give Cursor subagents (Task-tool children) their own LED. Off by default:
   * subagents run under a fresh conversation_id with no parent link, so tracking
   * them lights an extra lamp per subagent. Detected via null `transcript_path`.
   */
  trackSubagents: boolean;
  /** Never open the HID device; only log rendered frames (for debugging). */
  dryRun: boolean;
  logLevel: LogLevel;
}

const num = (v: string | undefined, fallback: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const bool = (v: string | undefined, fallback: boolean): boolean => {
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
};

export const loadConfig = (argv: string[]): BridgeConfig => {
  const flags = new Set(argv);
  const env = process.env;

  const getFlagValue = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    const prefixed = argv.find((a) => a.startsWith(`${name}=`));
    return prefixed ? prefixed.slice(name.length + 1) : undefined;
  };

  const logLevel = (getFlagValue("--log") ??
    env.CODEX_BRIDGE_LOG ??
    "info") as LogLevel;

  const source: SourceKind =
    flags.has("--mock") || bool(env.CODEX_BRIDGE_MOCK, false) ? "mock" : "hooks";

  return {
    source,
    socketPath: getFlagValue("--sock") ?? defaultSocketPath(),
    brightness: num(
      getFlagValue("--brightness") ?? env.CODEX_BRIDGE_BRIGHTNESS,
      160,
    ),
    softUnreadFactor: num(
      env.CODEX_BRIDGE_SOFT_UNREAD_FACTOR ?? env.CODEX_BRIDGE_IDLE_FACTOR,
      0.08,
    ),
    completeHoldMs: num(env.CODEX_BRIDGE_COMPLETE_HOLD_MS, 5000),
    breathePeriodMs: num(env.CODEX_BRIDGE_BREATHE_PERIOD_MS, 2000),
    blinkPeriodMs: num(env.CODEX_BRIDGE_BLINK_PERIOD_MS, 400),
    animFps: num(env.CODEX_BRIDGE_ANIM_FPS, 15),
    marqueePeriodMs: num(env.CODEX_BRIDGE_MARQUEE_PERIOD_MS, 1400),
    alertPeriodMs: num(env.CODEX_BRIDGE_ALERT_PERIOD_MS, 900),
    idleOffMs: num(env.CODEX_BRIDGE_IDLE_OFF_MS, 180000),
    underglow: bool(env.CODEX_BRIDGE_UNDERGLOW, true),
    underglowFactor: num(env.CODEX_BRIDGE_UNDERGLOW_FACTOR, 0.35),
    hidReconnectMs: num(env.CODEX_BRIDGE_HID_RECONNECT_MS, 2000),
    binding:
      (getFlagValue("--binding") as "recent" | "fixed" | undefined) ?? "recent",
    trackSubagents: bool(env.CODEX_BRIDGE_TRACK_SUBAGENTS, false),
    dryRun: flags.has("--no-hid") || flags.has("--dry-run"),
    logLevel,
  };
};
