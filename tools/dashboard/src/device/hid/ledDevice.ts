/**
 * WebHID 传输层（零 React）。负责打开/发送/关闭 Raw HID 设备，
 * 上层只经由此类发送已组好的 32 字节报文。
 */
import { DEFAULT_PROFILE } from "@planckeys/keyboard-profile";
import { REPORT_SIZE } from "./protocol";

export type LedDeviceListener = (device: HIDDevice | null) => void;

export class LedDevice {
  private device: HIDDevice | null = null;
  private disconnectHandler: ((e: HIDConnectionEvent) => void) | null = null;

  get productName(): string | null {
    return this.device?.productName ?? null;
  }

  get isOpen(): boolean {
    return this.device?.opened ?? false;
  }

  /** 让用户手势选设备并打开（须由点击等用户手势触发）。 */
  async request(
    onLost: () => void,
    usagePage: number = DEFAULT_PROFILE.hidUsagePage,
  ): Promise<HIDDevice> {
    if (!("hid" in navigator)) {
      throw new Error("此浏览器不支持 WebHID（请用 Chrome / Edge）");
    }
    const devices = await navigator.hid.requestDevice({
      filters: [{ usagePage }],
    });
    if (!devices.length) {
      throw new Error("未选择设备");
    }
    await this.open(devices[0], onLost);
    return devices[0];
  }

  private async open(device: HIDDevice, onLost: () => void): Promise<void> {
    this.device = device;
    if (!device.opened) await device.open();

    this.disconnectHandler = (e: HIDConnectionEvent) => {
      if (e.device === this.device) {
        this.device = null;
        onLost();
      }
    };
    navigator.hid.addEventListener("disconnect", this.disconnectHandler);
  }

  /** 找到输出报文的 reportId（无编号时为 0）。 */
  private outputReportId(): number {
    if (!this.device) return 0;
    for (const c of this.device.collections ?? []) {
      for (const r of c.outputReports ?? []) return r.reportId ?? 0;
    }
    return 0;
  }

  /** 发送单条报文（自动补齐/截断到 REPORT_SIZE）。 */
  async send(bytes: Uint8Array): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error("HID 未连接");
    }
    const data = new Uint8Array(REPORT_SIZE);
    data.set(bytes.slice(0, REPORT_SIZE));
    const reportId = this.outputReportId();
    try {
      await this.device.sendReport(reportId, data);
    } catch {
      // 某些系统上 output 报文不通，退回 feature 报文。
      await this.device.sendFeatureReport(reportId, data);
    }
  }

  /** 依次发送多条报文（用于整块逐颗写）。 */
  async sendMany(reports: Uint8Array[]): Promise<void> {
    for (const r of reports) await this.send(r);
  }

  async close(): Promise<void> {
    if (this.disconnectHandler && "hid" in navigator) {
      navigator.hid.removeEventListener("disconnect", this.disconnectHandler);
      this.disconnectHandler = null;
    }
    if (this.device?.opened) {
      try {
        await this.device.close();
      } catch {
        /* ignore */
      }
    }
    this.device = null;
  }
}
