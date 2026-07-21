import HID from "node-hid";
import { log } from "./logger.js";
import {
  LedMode,
  USAGE_PAGE,
  buildConfigReport,
  buildFillReport,
  buildSparsePixelReports,
  Rgb,
} from "./protocol.js";
import { RenderTarget } from "./threadStore.js";

/**
 * Owns the connection to the Planckeys left board and turns render targets into
 * Raw HID reports. Auto-reconnects; when no device is present it degrades to a
 * no-op (frames are dropped) so the bridge can run headless / on CI.
 */
export class HidDevice {
  private device: HID.HID | null = null;
  private outputReportId = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly reconnectMs: number,
    private readonly dryRun = false,
  ) {}

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

  private findDevicePath(): string | null {
    let devices: HID.Device[];
    try {
      devices = HID.devices();
    } catch (e) {
      log.warn("HID.devices() failed:", (e as Error).message);
      return null;
    }
    const match = devices.find((d) => d.usagePage === USAGE_PAGE);
    if (!match || !match.path) return null;
    log.info(
      `Found Planckeys HID: ${match.product ?? "?"} (vid=${match.vendorId?.toString(16)} pid=${match.productId?.toString(16)})`,
    );
    return match.path;
  }

  private tryOpen(): void {
    if (this.device || this.closed) return;
    const path = this.findDevicePath();
    if (!path) {
      log.debug("Planckeys HID not found (usagePage 0xFF60); will retry.");
      this.scheduleReconnect();
      return;
    }
    try {
      const device = new HID.HID(path);
      device.on("error", (err) => {
        log.warn("HID error:", (err as Error).message);
        this.handleDisconnect();
      });
      this.device = device;
      log.info("HID connected.");
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
