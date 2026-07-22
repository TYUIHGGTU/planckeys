import HID from "node-hid";
import {
  DEFAULT_PROFILE,
  profileForUsagePage,
  resolveProfile,
  type KeyboardProfile,
} from "@planckeys/keyboard-profile";
import { log } from "./logger.js";
import {
  LedMode,
  buildConfigReport,
  buildFillReport,
  buildSparsePixelReports,
  Rgb,
} from "./protocol.js";
import { RenderTarget } from "./threadStore.js";

/**
 * Owns the connection to a profile-matched Raw HID board and turns render
 * targets into reports. Auto-reconnects; when no device is present it degrades
 * to a no-op so the bridge can run headless / on CI.
 */
export class HidDevice {
  private device: HID.HID | null = null;
  private outputReportId = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private matchedProfile: KeyboardProfile | null = null;
  private missingProfileLogged = false;

  constructor(
    private readonly reconnectMs: number,
    private readonly dryRun = false,
  ) {}

  get profile(): KeyboardProfile | null {
    return this.matchedProfile;
  }

  start(): void {
    if (this.dryRun) {
      log.info("Dry-run: HID disabled; frames will only be logged.");
      return;
    }
    this.tryOpen();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.tryOpen();
    }, this.reconnectMs);
  }

  private findDevice(): { path: string; profile: KeyboardProfile } | null {
    let devices: HID.Device[];
    try {
      devices = HID.devices();
    } catch (e) {
      log.warn("HID.devices() failed:", (e as Error).message);
      return null;
    }

    const candidates = devices.filter(
      (d) =>
        d.path &&
        d.usagePage != null &&
        profileForUsagePage(d.usagePage) !== null,
    );
    if (!candidates.length) return null;

    const preferred =
      candidates.find((d) =>
        resolveProfile({
          productName: d.product,
          vendorId: d.vendorId,
          productId: d.productId,
        }),
      ) ?? candidates[0];

    const profile =
      resolveProfile({
        productName: preferred.product,
        vendorId: preferred.vendorId,
        productId: preferred.productId,
      }) ??
      profileForUsagePage(preferred.usagePage!) ??
      DEFAULT_PROFILE;

    if (!preferred.path) return null;

    log.info(
      `Found HID profile=${profile.id}: ${preferred.product ?? "?"} (vid=${preferred.vendorId?.toString(16)} pid=${preferred.productId?.toString(16)})`,
    );
    return { path: preferred.path, profile };
  }

  private tryOpen(): void {
    if (this.device || this.closed) return;
    const found = this.findDevice();
    if (!found) {
      if (!this.missingProfileLogged) {
        log.warn(
          "No keyboard-profile HID device found; LED control idle until a matching board is connected.",
        );
        this.missingProfileLogged = true;
      } else {
        log.debug("Profile HID not found; will retry.");
      }
      this.scheduleReconnect();
      return;
    }
    this.missingProfileLogged = false;
    try {
      const device = new HID.HID(found.path);
      device.on("error", (err) => {
        log.warn("HID error:", (err as Error).message);
        this.handleDisconnect();
      });
      this.device = device;
      this.matchedProfile = found.profile;
      log.info(`HID connected (profile=${found.profile.id}).`);
    } catch (e) {
      log.warn("Failed to open HID device:", (e as Error).message);
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    if (this.device) {
      try {
        this.device.close();
      } catch {
        /* ignore */
      }
    }
    this.device = null;
    this.matchedProfile = null;
    if (!this.closed) {
      log.info("HID disconnected; will reconnect.");
      this.scheduleReconnect();
    }
  }

  private writeReport(report: Uint8Array): boolean {
    if (!this.device) return false;
    // node-hid expects the report id as the first byte (0 when unnumbered).
    const buf = [this.outputReportId, ...report];
    try {
      this.device.write(buf);
      return true;
    } catch (e) {
      log.warn("HID write failed:", (e as Error).message);
      this.handleDisconnect();
      return false;
    }
  }

  /** Push the global mode/brightness (0xA1). */
  setConfig(mode: LedMode, brightness: number, speed: number): void {
    this.writeReport(buildConfigReport(mode, brightness, speed));
  }

  /** Push the rendered LED targets as coalesced 0xA2 pixel reports. */
  pushFrame(targets: RenderTarget[]): boolean {
    if (!this.device) return false;
    const reports = buildSparsePixelReports(
      targets.map((t) => ({ index: t.index, color: t.color })),
    );
    let ok = true;
    for (const r of reports) {
      ok = this.writeReport(r) && ok;
    }
    return ok;
  }

  /** Clear the whole canvas to a single color (used by failsafe). */
  fill(color: Rgb): void {
    this.writeReport(buildFillReport(color));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.handleDisconnect();
  }
}
