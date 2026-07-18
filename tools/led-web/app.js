// ---- 须与固件 src/led_control.c 保持一致 ----
const USAGE_PAGE = 0xFF60;
const REPORT_SIZE = 32;
const CMD_CONFIG = 0xA1;     // [1]=mode [2]=brightness [3]=speed（只改动画，不动颜色）
const CMD_PIXELS = 0xA2;     // [1]=offset [2]=count 之后每颗 3 字节 RGB（写画布，不改模式）
const CMD_BRIGHTNESS = 0xA3; // [1]=brightness
const CMD_FILL = 0xA4;       // [1]=R [2]=G [3]=B（用单色铺满整块画布）

// 灯带参数（须与固件 chain-length 对齐）。单条链 28 颗：
//   index 6..27 = 轴灯（每键一颗，共 22），index 0..5 = 底灯（正面不可见）。
const LED_COUNT = 28;
const MAX_PX_PER_REPORT = Math.floor((REPORT_SIZE - 3) / 3); // = 9

// 轴灯布局：正面 6×4 逆时针旋 90° 后为 4 列 × 6 行（与配图一致）；null = 无键。值为灯带下标。
const AXIS_LAYOUT = [
  [10, 21, 22, 6],
  [11, 20, 23, 7],
  [12, 19, 24, 8],
  [13, 18, 25, 9],
  [14, 17, 26, null],
  [15, 16, 27, null],
];
const AXIS_INDICES = AXIS_LAYOUT.flat().filter((x) => x !== null);
const UNDERGLOW_INDICES = [0, 1, 2, 3, 4, 5];

// 点阵字模（行字符串，'1'=亮）。仅支持 0–9，3×5。
const DIGIT_3X5 = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};
const DIGIT_COL0 = 0;
const DIGIT_MAX = 9;
const DIGIT_CAROUSEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const QUICK_COLORS = [
  '#ffffff', '#ff3b30', '#ff9500', '#ffd60a', '#30d158',
  '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f',
];

// 配色方案：按轴灯行列生成渐变；底灯用方案的 accent 色带。
const COLOR_SCHEMES = [
  {
    id: 'ocean', name: '海洋',
    preview: ['#003d7a', '#0077b6', '#00b4d8', '#48cae4', '#90e0ef'],
    primary: '#00b4d8',
    paint: (row, col, cols) => lerpHex('#003d7a', '#90e0ef', (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex('#0077b6', '#48cae4', i / (n - 1)),
  },
  {
    id: 'sunset', name: '日落',
    preview: ['#ff6b35', '#f7c59f', '#ef476f', '#7b2cbf', '#240046'],
    primary: '#ff6b35',
    paint: (row, col, cols) => lerpHex('#ff6b35', '#5a189a', (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex('#ef476f', '#240046', i / (n - 1)),
  },
  {
    id: 'neon', name: '霓虹',
    preview: ['#ff00aa', '#00f0ff', '#39ff14', '#ff00aa', '#00f0ff'],
    primary: '#00f0ff',
    paint: (row, col) => ((row + col) % 2 ? '#ff00aa' : '#00f0ff'),
    under: (i) => (i % 2 ? '#39ff14' : '#ff00aa'),
  },
  {
    id: 'forest', name: '森林',
    preview: ['#081c15', '#1b4332', '#2d6a4f', '#52b788', '#95d5b2'],
    primary: '#52b788',
    paint: (row, col, cols) => lerpHex('#081c15', '#95d5b2', (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex('#1b4332', '#52b788', i / (n - 1)),
  },
  {
    id: 'rainbow', name: '彩虹',
    preview: ['#ff0040', '#ffd000', '#40ff40', '#00b0ff', '#b000ff'],
    primary: '#ff0040',
    paint: (row, col, cols) => {
      const t = (row * cols + col) / (6 * cols - 1);
      return hslToHex(t * 300, 1, 0.5);
    },
    under: (i, n) => hslToHex((i / (n - 1)) * 300, 1, 0.5),
  },
  {
    id: 'cyber', name: '赛博',
    preview: ['#ff2a6d', '#05d9e8', '#d1f7ff', '#01012b', '#ff2a6d'],
    primary: '#05d9e8',
    paint: (_row, col, cols) => (col < cols / 2 ? '#ff2a6d' : '#05d9e8'),
    under: (i, n) => (i < n / 2 ? '#ff2a6d' : '#05d9e8'),
  },
  {
    id: 'amber', name: '暖琥珀',
    preview: ['#3a1800', '#7a3b00', '#c26e00', '#ffb347', '#ffe0a3'],
    primary: '#ffb347',
    paint: (row, col, cols) => lerpHex('#3a1800', '#ffe0a3', (row * cols + col) / (6 * cols - 1)),
    under: (i, n) => lerpHex('#7a3b00', '#ffb347', i / (n - 1)),
  },
  {
    id: 'mono', name: '冰蓝',
    preview: ['#0040ff', '#0040ff', '#0040ff', '#66a3ff', '#66a3ff'],
    primary: '#0040ff',
    paint: () => '#0040ff',
    under: () => '#66a3ff',
  },
];

let device = null;
let mode = 1;
let digitTimer = null;
// 画布默认冰蓝，与固件默认一致；连接时会把画布同步给键盘。
const pixels = new Array(LED_COUNT).fill(null).map(() => ({ r: 0x00, g: 0x40, b: 0xff }));

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const logEl = $('log');

function log(msg) {
  const t = new Date().toLocaleTimeString();
  logEl.textContent = `[${t}] ${msg}\n` + logEl.textContent;
}
function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}
function setControlsEnabled(on) {
  $('disconnect').disabled = !on;
  $('connect').disabled = on;
}
function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex) {
  const h = normalizeHex(hex);
  if (!h) return { r: 0, g: 0, b: 0 };
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}
function normalizeHex(hex) {
  if (!hex) return null;
  let s = String(hex).trim();
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}
function lerpHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: A.r + (B.r - A.r) * u,
    g: A.g + (B.g - A.g) * u,
    b: A.b + (B.b - A.b) * u,
  });
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}
function curColor() { return hexToRgb($('color').value); }
function curBrightness() { return Number($('brightness').value); }
function curSpeed() { return Number($('speed').value); }

// 当前「画笔颜色」：用于点格子上色。只更新画笔与界面，不写入灯带。
function setBaseColor(hex) {
  const h = normalizeHex(hex);
  if (!h) return;
  $('color').value = h;
  $('hex').value = h;
  $('curSwatch').style.background = h;
  document.querySelectorAll('.swatch').forEach((el) => {
    el.classList.toggle('active', el.dataset.hex === h);
  });
}

// 选色即生效：设为画笔颜色并立即把整条灯带铺成该颜色。
function applyBaseColor(hex) {
  const h = normalizeHex(hex);
  if (!h) return;
  setBaseColor(h);
  stopDigitPlayback();
  applySubset([...AXIS_INDICES, ...UNDERGLOW_INDICES], hexToRgb(h));
}

function renderPalette() {
  const box = $('swatches');
  box.innerHTML = '';
  for (const hex of QUICK_COLORS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.dataset.hex = hex;
    btn.style.background = hex;
    btn.title = hex;
    btn.addEventListener('click', () => applyBaseColor(hex));
    box.appendChild(btn);
  }
  const schemes = $('schemes');
  schemes.innerHTML = '';
  for (const scheme of COLOR_SCHEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scheme';
    btn.title = '应用「' + scheme.name + '」';
    const bar = document.createElement('div');
    bar.className = 'scheme-bar';
    for (const c of scheme.preview) {
      const i = document.createElement('i');
      i.style.background = c;
      bar.appendChild(i);
    }
    const label = document.createElement('span');
    label.textContent = scheme.name;
    btn.appendChild(bar);
    btn.appendChild(label);
    btn.addEventListener('click', () => applyScheme(scheme));
    schemes.appendChild(btn);
  }
  setBaseColor($('color').value);
}

function applyScheme(scheme) {
  stopDigitPlayback();
  const cols = AXIS_LAYOUT[0].length;
  for (let r = 0; r < AXIS_LAYOUT.length; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = AXIS_LAYOUT[r][c];
      if (idx === null) continue;
      pixels[idx] = hexToRgb(scheme.paint(r, c, cols));
    }
  }
  const n = UNDERGLOW_INDICES.length;
  UNDERGLOW_INDICES.forEach((idx, i) => {
    pixels[idx] = hexToRgb(scheme.under(i, n));
  });
  setBaseColor(scheme.primary);
  renderCells();
  sendAllPixels();
  ensureVisible(); // 关灯时自动切常亮，否则保留当前动画，让方案颜色一起动
  log('应用配色: ' + scheme.name + '（当前模式不变，可再选预设让它动起来）');
}

function findOutputReportId() {
  if (!device) return 0;
  for (const c of device.collections || [])
    for (const r of c.outputReports || []) return r.reportId ?? 0;
  return 0;
}

async function send(bytes) {
  if (!device || !device.opened) { log('设备未连接，忽略发送'); return; }
  const data = new Uint8Array(REPORT_SIZE);
  data.set(bytes.slice(0, REPORT_SIZE));
  const reportId = findOutputReportId();
  try {
    await device.sendReport(reportId, data);
  } catch (e) {
    try { await device.sendFeatureReport(reportId, data); }
    catch (e2) { log('发送失败: ' + (e2.message || e2)); setStatus('发送失败', 'err'); }
  }
}

function sendConfig() {
  // 只发模式/亮度/速度；颜色由画布(逐颗)决定，不随预设改变。
  send([CMD_CONFIG, mode, curBrightness(), curSpeed()]);
  log(`config mode=${mode} br=${curBrightness()} sp=${curSpeed()}`);
}

// 编辑画布后：若当前是「关灯」则自动切到常亮，让改动可见；否则保持当前动画。
function ensureVisible() {
  if (mode === 0) { mode = 1; highlightPresets(); sendConfig(); }
}

async function sendAllPixels() {
  for (let off = 0; off < LED_COUNT; off += MAX_PX_PER_REPORT) {
    const cnt = Math.min(MAX_PX_PER_REPORT, LED_COUNT - off);
    const bytes = [CMD_PIXELS, off, cnt];
    for (let i = 0; i < cnt; i++) {
      const p = pixels[off + i];
      bytes.push(p.r, p.g, p.b);
    }
    await send(bytes);
  }
  log(`发送逐颗 ${LED_COUNT} 颗`);
}

function sendOnePixel(idx) {
  const p = pixels[idx];
  send([CMD_PIXELS, idx, 1, p.r, p.g, p.b]);
}

function makeCell(idx, under) {
  const el = document.createElement('div');
  el.className = 'px' + (under ? ' under' : '');
  el.dataset.idx = idx;
  el.textContent = idx;
  paintCell(el, pixels[idx]);
  el.addEventListener('click', () => {
    const p = pixels[idx];
    const lit = p.r || p.g || p.b;
    // 切换：亮着(任意颜色)则熄灭；灭着则用当前基色点亮。
    pixels[idx] = lit ? { r: 0, g: 0, b: 0 } : curColor();
    paintCell(el, pixels[idx]);
    sendOnePixel(idx);
    ensureVisible();
  });
  return el;
}

function renderCells() {
  const ag = $('axisGrid');
  ag.innerHTML = '';
  for (const row of AXIS_LAYOUT) {
    for (const idx of row) {
      if (idx === null) {
        const empty = document.createElement('div');
        empty.className = 'px empty';
        ag.appendChild(empty);
      } else {
        ag.appendChild(makeCell(idx, false));
      }
    }
  }
  const ug = $('underGrid');
  ug.innerHTML = '';
  for (const idx of UNDERGLOW_INDICES) ug.appendChild(makeCell(idx, true));
}
function paintCell(el, p) {
  const on = p.r || p.g || p.b;
  el.style.background = on ? `rgb(${p.r},${p.g},${p.b})` : '#2a2f3a';
  el.style.color = on ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)';
}
function highlightPresets() {
  document.querySelectorAll('.presets button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.mode) === mode);
  });
}

// ---- 事件绑定 ----
document.querySelectorAll('.presets button').forEach((b) => {
  b.addEventListener('click', () => { mode = Number(b.dataset.mode); highlightPresets(); sendConfig(); });
});
// 拖动取色器时先预览画笔，松手（change）后立即整条生效。
$('color').addEventListener('input', () => setBaseColor($('color').value));
$('color').addEventListener('change', () => applyBaseColor($('color').value));
$('hex').addEventListener('change', () => {
  const h = normalizeHex($('hex').value);
  if (h) applyBaseColor(h);
  else $('hex').value = $('color').value;
});
$('hex').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('hex').dispatchEvent(new Event('change'));
});
$('brightness').addEventListener('input', () => {
  $('brightnessVal').textContent = $('brightness').value;
  send([CMD_BRIGHTNESS, curBrightness()]);
});
$('speed').addEventListener('input', () => {
  $('speedVal').textContent = $('speed').value;
  if (mode >= 2 && mode <= 4) sendConfig();
});
function applySubset(indices, color) {
  for (const i of indices) pixels[i] = color ? { ...color } : { r: 0, g: 0, b: 0 };
  renderCells(); sendAllPixels(); ensureVisible();
}
$('fillAxis').addEventListener('click', () => { stopDigitPlayback(); applySubset(AXIS_INDICES, curColor()); });
$('clearAxis').addEventListener('click', () => { stopDigitPlayback(); applySubset(AXIS_INDICES, null); });
$('fillUnder').addEventListener('click', () => applySubset(UNDERGLOW_INDICES, curColor()));
$('clearUnder').addEventListener('click', () => applySubset(UNDERGLOW_INDICES, null));

function setDigitCarouselControls(playing) {
  $('digitStart').disabled = playing;
  $('digitStop').disabled = !playing;
}

function stopDigitPlayback() {
  if (digitTimer != null) {
    clearInterval(digitTimer);
    digitTimer = null;
  }
  setDigitCarouselControls(false);
}

function clearAxisPixels() {
  for (const idx of AXIS_INDICES) pixels[idx] = { r: 0, g: 0, b: 0 };
}

function stampGlyph(glyph, row0, col0, color) {
  for (let r = 0; r < glyph.length; r++) {
    const row = glyph[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '1') continue;
      const idx = AXIS_LAYOUT[row0 + r]?.[col0 + c];
      if (idx == null) continue;
      pixels[idx] = { r: color.r, g: color.g, b: color.b };
    }
  }
}

function paintNumber(n, color) {
  if (!Number.isInteger(n) || n < 0 || n > DIGIT_MAX) return false;
  const glyph = DIGIT_3X5[String(n)];
  if (!glyph) return false;
  clearAxisPixels();
  stampGlyph(glyph, 0, DIGIT_COL0, color);
  return true;
}

function flushDigitPaint(note) {
  renderCells();
  sendAllPixels();
  ensureVisible();
  log(note);
}

function highlightDigitKey(n) {
  document.querySelectorAll('#digitKeys button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.n) === n);
  });
}

function parseDigitInput(raw) {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > DIGIT_MAX) return null;
  return n;
}

function showDigits(raw) {
  const n = parseDigitInput(raw);
  if (n == null) {
    log('点阵数字：仅支持 0–9');
    return;
  }
  stopDigitPlayback();
  $('digitInput').value = String(n);
  if (!paintNumber(n, curColor())) return;
  highlightDigitKey(n);
  flushDigitPaint('点阵显示: ' + n);
}

let digitCarouselIndex = 0;

function paintCarouselFrame() {
  const n = DIGIT_CAROUSEL[digitCarouselIndex % DIGIT_CAROUSEL.length];
  paintNumber(n, curColor());
  $('digitInput').value = String(n);
  highlightDigitKey(n);
  flushDigitPaint(`轮播: ${n} (${(digitCarouselIndex % DIGIT_CAROUSEL.length) + 1}/${DIGIT_CAROUSEL.length})`);
  digitCarouselIndex++;
}

function startDigitCarousel(fromIndex) {
  const wasPlaying = digitTimer != null;
  if (digitTimer != null) {
    clearInterval(digitTimer);
    digitTimer = null;
  }
  digitCarouselIndex = fromIndex != null ? fromIndex : 0;
  paintCarouselFrame();
  const ms = Number($('digitInterval').value) || 800;
  digitTimer = setInterval(paintCarouselFrame, ms);
  setDigitCarouselControls(true);
  if (!wasPlaying) log(`开始轮播 0–${DIGIT_MAX}，间隔 ${ms}ms`);
}

function renderDigitKeys() {
  const box = $('digitKeys');
  box.innerHTML = '';
  for (let d = 0; d <= DIGIT_MAX; d++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.n = String(d);
    btn.textContent = String(d);
    btn.addEventListener('click', () => showDigits(String(d)));
    box.appendChild(btn);
  }
}

$('digitShow').addEventListener('click', () => showDigits($('digitInput').value));
$('digitStart').addEventListener('click', () => startDigitCarousel(0));
$('digitStop').addEventListener('click', () => {
  stopDigitPlayback();
  log('已停止数字轮播');
});
$('digitInterval').addEventListener('input', () => {
  $('digitIntervalVal').textContent = $('digitInterval').value;
  if (digitTimer != null) {
    // 保持下一帧序号，只刷新间隔（digitCarouselIndex 已在上一帧自增）
    const next = digitCarouselIndex;
    clearInterval(digitTimer);
    digitTimer = null;
    digitCarouselIndex = next;
    const ms = Number($('digitInterval').value) || 800;
    digitTimer = setInterval(paintCarouselFrame, ms);
    setDigitCarouselControls(true);
  }
});
$('digitInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') showDigits($('digitInput').value);
});
renderDigitKeys();

async function openDevice(dev) {
  device = dev;
  if (!device.opened) await device.open();
  setStatus(`已连接: ${device.productName || 'HID'}`, 'ok');
  setControlsEnabled(true);
  log('已连接并打开设备');
  highlightPresets();
  await sendAllPixels(); // 把网页画布同步到键盘（颜色以网页为准）
  sendConfig();          // 再同步模式/亮度/速度
}

$('connect').addEventListener('click', async () => {
  if (!('hid' in navigator)) { setStatus('此浏览器不支持 WebHID（请用 Chrome/Edge）', 'err'); return; }
  try {
    const devices = await navigator.hid.requestDevice({ filters: [{ usagePage: USAGE_PAGE }] });
    if (!devices.length) { log('未选择设备'); return; }
    await openDevice(devices[0]);
  } catch (e) { log('连接失败: ' + (e.message || e)); setStatus('连接失败', 'err'); }
});

$('disconnect').addEventListener('click', async () => {
  if (device && device.opened) await device.close();
  device = null; setStatus('已断开'); setControlsEnabled(false);
});

if ('hid' in navigator) {
  navigator.hid.addEventListener('disconnect', (e) => {
    if (device && e.device === device) { device = null; setStatus('设备已拔出'); setControlsEnabled(false); log('设备断开连接'); }
  });
} else {
  setStatus('此浏览器不支持 WebHID（请用 Chrome/Edge）', 'err');
  $('connect').disabled = true;
}

renderPalette();
renderCells();
highlightPresets();
