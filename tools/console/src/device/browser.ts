/** 浏览器能力检测：WebHID（控灯）与 Web Serial（改键）。 */

export const hasWebHID = (): boolean =>
  typeof navigator !== "undefined" && "hid" in navigator;

export const hasWebSerial = (): boolean =>
  typeof navigator !== "undefined" && "serial" in navigator;

export const browserHint = (): string | null => {
  if (!hasWebHID() && !hasWebSerial()) {
    return "此浏览器不支持 WebHID / Web Serial，请改用 Chrome 或 Edge。";
  }
  if (!hasWebHID()) return "此浏览器不支持 WebHID，无法控灯（请用 Chrome / Edge）。";
  if (!hasWebSerial()) return "此浏览器不支持 Web Serial，无法改键（请用 Chrome / Edge）。";
  return null;
};
