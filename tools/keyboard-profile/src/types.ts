/** 用于匹配键盘的设备信息（Studio 名 / HID 产品名 / USB id）。 */
export interface DeviceMatchInfo {
  name?: string | null;
  productName?: string | null;
  vendorId?: number | null;
  productId?: number | null;
}

export interface MatrixCell {
  index: number;
  row: number;
  col: number;
}

/** agent-bridge 会话点阵分区（由 axisLayout 派生或 profile 显式给出）。 */
export interface AgentZones {
  globalRowIndices: readonly number[];
  convoIndices: readonly number[];
  alertCells: readonly MatrixCell[];
}

/**
 * 设备侧灯效 / HID 描述。物理键位几何不在此列——由 ZMK Studio
 * `getPhysicalLayouts` 动态提供。
 */
export interface KeyboardProfile {
  id: string;
  displayName: string;
  /** 是否匹配该设备。 */
  match: (info: DeviceMatchInfo) => boolean;
  hidUsagePage: number;
  ledCount: number;
  /** 轴灯网格 `[row][col] -> chain index | null`。 */
  axisLayout: readonly (number | null)[][];
  underglowIndices: readonly number[];
  /** Studio keyPosition -> WS2812 chain index。 */
  keyPositionToLedIndex: readonly number[];
  /** 轴灯链上所有有效 index（展平 axisLayout）。 */
  axisIndices: readonly number[];
  agentZones: AgentZones;
}
