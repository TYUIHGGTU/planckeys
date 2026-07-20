# Codex Developer Mode（CDP）说明与本仓库结合

> 记录 Codex app **26.609**（2026-06-11）起开放的 **Chrome DevTools Protocol（CDP）**
> 访问能力：它是什么、怎么开、怎么用，以及和 planckeys（`led-web` / `codex-bridge`）
> 有哪些可落地的结合点。

---

## 1. 这件事是什么

此前 Browser use 主要靠**截图 + 视觉推理**理解页面；agent 能点能看，但很难像人按
F12 那样读 console、看 Network、抓 performance trace。

26.609 起，Codex 在 **Developer mode** 下获得**受控的完整 CDP 访问**，可以在真实浏览器会话里：

| 能力 | 典型用途 |
| ---- | -------- |
| Performance profiling | 录 JS 执行 trace，找卡顿 / 长任务 |
| Network inspection | 看请求状态码、时序、失败 API |
| Console monitoring | 读 `console.*` 与 runtime exception |
| DOM / style inspection | 查计算样式、布局、可访问性属性 |
| Page state diagnosis | 用结构化 DOM 快照代替「猜截图」 |

官方同时称：通过 CDP + DOM snapshot 优化，Browser use **最多约 2× 更快**（减少截图往返）。

权威出处：

- [Codex Changelog · app 26.609](https://developers.openai.com/codex/changelog)
- [Codex App · Browser · Developer mode](https://developers.openai.com/codex/app/browser)
- CLI 等价能力：[chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp)

---

## 2. 三条浏览器能力层级（别混）

| 层级 | 入口 | 能做什么 | 适合 |
| ---- | ---- | -------- | ---- |
| **Computer Use** | 桌面端像素级操控 | 任意 GUI，不限浏览器 | 原生软件、跨应用流程 |
| **Browser Use + Developer mode** | `@Browser` / `@Chrome` + CDP 开关 | DOM 操作 + 完整 DevTools | 前端调试、localhost、已登录页 |
| **Chrome DevTools MCP** | CLI：`codex mcp add chrome-devtools` | 约 29 个 DevTools 工具（DOM / console / network / Lighthouse / trace 等） | 终端 / headless / CI |

对本仓库：日常改固件与 bridge 仍以 **CLI + hooks** 为主；调试 `tools/led-web` 时优先
**CDP（app）或 chrome-devtools MCP（CLI）**，不必上 Computer Use。

---

## 3. 怎么用

### 3.1 桌面端：打开 Developer mode

1. 升级 Codex / ChatGPT 桌面端到 **≥ 26.609**。
2. **Settings → Browser → Developer mode → Enable full CDP access**。
3. 默认关闭；首次对某站点用完整 CDP 时，会弹**按站点审批**——看清站点与任务再批准。
4. 企业策略可全局关掉：在 `requirements.toml` 的 `[features]` 下设  
   `browser_use_full_cdp_access = false`（用户本地无法再打开）。

### 3.2 两个浏览器表面

| 表面 | 怎么唤起 | 会话特征 | 本仓库场景 |
| ---- | -------- | -------- | ---------- |
| **内置浏览器** | `@Browser` | 独立 profile，**不带**你日常 Cookie / 扩展 | 开本地 `led-web`、file:// 预览、公开页 |
| **本机 Chrome** | 装 Codex Chrome 扩展后 `@Chrome` | 用你**已登录**的 Chrome | 需扩展 / 已登录态的内部页 |

示例 prompt：

```text
Use @Browser to open http://localhost:5173/ (or the led-web page),
capture a performance trace and inspect console + network,
then list any WebHID / JS errors and suggest fixes only in tools/led-web.
```

```text
This page is slow. Use @Browser to profile JS and find the bottleneck.
```

### 3.3 CLI：Chrome DevTools MCP（不依赖桌面 Developer mode）

终端里用 Codex CLI 时，装 Google 维护的 MCP 即可拿到同类 CDP 能力：

```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

或手写 `~/.codex/config.toml`：

```toml
[mcp_servers.chrome-devtools]
command = "npx"
args = ["-y", "chrome-devtools-mcp@latest"]
# 可选：Chrome 启动慢时加大超时
# startup_timeout_ms = 20000
# 可选：指定 Chrome 路径
# env = { CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }
```

常用变体：

```bash
# 仅基础自动化 + 无头（更轻）
npx chrome-devtools-mcp@latest --slim --headless

# 接到已开启远程调试的 Chrome（你先手动起浏览器）
npx chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222
```

要求：Node.js LTS、本机 Chrome（官方支持 Google Chrome / Chrome for Testing）。

> **注意**：Desktop「Enable full CDP access」与 CLI「chrome-devtools MCP」是**两条平行路径**。
> CLI 不读桌面端那个开关；企业若禁 MCP allowlist，CLI 路径也会失效。

---

## 4. 安全边界（必读）

完整 CDP ≈ 把 DevTools 级能力交给 agent，可触及：

- 页面 DOM、cookie 相关上下文（视表面而定）、网络载荷、控制台里的敏感日志；
- 在已登录的 `@Chrome` 会话里，风险更高。

因此：

1. **默认关**，需要时再开。
2. **按站点审批**，不要对生产后台 / 含密钥页盲目批准。
3. 组织可用 `browser_use_full_cdp_access = false` 一刀切。
4. 关掉整体 Browser use 也会关掉 CDP。
5. 页面内容仍是**不可信输入**（prompt injection）；CDP 只加深可观测性，不提高页面可信度。

---

## 5. 与 planckeys 的结合

本仓库已有两条和「浏览器 / Codex」相关的线：

```text
A. tools/led-web     → Chrome WebHID → Raw HID 0xFF60 → 左板灯带
B. tools/codex-bridge → ~/.codex/hooks → unix socket → node-hid → 同一条灯带（状态墙）
```

CDP **不替代** B（状态灯仍靠 hooks），也 **不替代** 固件协议；它补的是 **A 的可调试性**，
以及「用 Codex 做前端验收」时的闭环。

### 5.1 立刻可用：用 CDP / MCP 调试 `led-web`

`tools/led-web` 依赖 **Chrome/Edge + USB + WebHID**，问题常出在权限、设备选择、
report 发送与控制台报错——正是 CDP 强项。

建议工作流：

1. USB 接左板，用静态服或直接打开 `tools/led-web/index.html`（file:// 或本地 http）。
2. Codex 桌面：`@Browser` / `@Chrome` 打开该页（WebHID 选设备通常仍需你点一次授权）。
3. 或 CLI：`chrome-devtools` MCP 导航到同一 URL。
4. 让 agent：**读 console、看失败的 WebHID 调用、核对 UI 状态文案**，再改 `app.js` / 样式。

示例：

```text
Open the Planckeys led-web console, reproduce "connect keyboard",
inspect console for WebHID errors, and fix only tools/led-web/.
Do not change firmware protocol opcodes (0xA1–0xA4).
```

### 5.2 与 `codex-bridge` 并行：浏览器调试时灯仍然反映会话状态

`codex-bridge` 挂在 **共享 Codex core 的 hooks** 上（见 `tools/codex-bridge/README.md`）。
桌面端 Browser / `@Chrome` 任务若走同一套 `~/.codex` 且已 trust hooks，则：

- agent **working** → 左板点阵（贪吃蛇 / spinner 等）；
- **PermissionRequest**（含「是否允许对该站用完整 CDP」一类审批，若映射到 hook）→
  琥珀 `?`（具体事件名以当前 Codex hooks 为准）；
- **Stop** → 任务序号高亮。

也就是说：CDP 负责「看懂页面」，bridge 负责「人眼余光看到 Codex 在干活」——两条线互补，
无需为 CDP 改 HID 协议。

> 若审批弹窗**没有**对应 hook 事件，灯不会进 `requiresInput`；这与现有
> 「hooks 粒度粗」的限制一致，不是 CDP 的新问题。

### 5.3 推荐结合场景（按价值）

| 场景 | 做法 | 收益 |
| ---- | ---- | ---- |
| **led-web 回归** | MCP/`@Browser` 打开页面 → console + DOM 断言连接状态 | 少靠人肉 F12 |
| **WebHID 故障定位** | 抓 runtime error、核对 `navigator.hid` 相关日志 | 权限 / usage page `0xFF60` 问题更快收敛 |
| **点阵 UI 自测说明** | agent 对照 `docs/led-matrix-interactions.md` 看页面格子与文案是否一致 | 文档与实现漂移时可发现 |
| **长任务可见性** | 跑 Browser 调试时保持 `npm start`（codex-bridge） | Micro 式状态墙不中断 |
| **多平台对比** | Cursor / Codex 各开一轮前端任务，靠平台色区分 | 已有 bridge 能力，CDP 只加深 Codex 侧前端能力 |

### 5.4 明确不做什么（避免预期错位）

| 误解 | 事实 |
| ---- | ---- |
| 「开了 CDP，Codex 就能直接控灯」 | CDP 控的是**浏览器**；控灯仍是 WebHID（led-web）或 node-hid（bridge） |
| 「CDP 能替代 hooks 状态源」 | 不能；全局被动观测仍靠 hooks（见 bridge README「为什么是 hooks」） |
| 「CDP 能走蓝牙控灯」 | 不能；本仓库 Raw HID / WebHID 仍要求 **USB** |
| 「CLI 开了 MCP = 桌面 Developer mode」 | 否；开关与配置路径不同 |

### 5.5 可选后续（未实现，仅 backlog）

若以后要更深耦合，可考虑（**当前不必做**）：

1. **led-web 调试预设 prompt / Skill**：固定「打开 led-web → 查 console → 只改 tools/led-web」。
2. **bridge 侧「browser 忙碌」语义**：若未来 hooks 能区分 Browser/CDP 工具调用，可用不同 working 灯效（如 spinner = 浏览，snake = 写代码）——依赖上游 hook 载荷，今日无稳定字段则不做。
3. **CI**：headless `chrome-devtools-mcp` 对 led-web 做无设备冒烟（仅静态 UI / JS）；真 HID 仍需本机 USB。

---

## 6. 快速对照表

| 问题 | 答案 |
| ---- | ---- |
| 从哪一版开始？ | Codex app **26.609**（2026-06-11） |
| 桌面怎么开？ | Settings → Browser → Enable full CDP access |
| CLI 怎么开？ | `codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest` |
| 内置浏览器 vs Chrome？ | `@Browser`（干净 profile）/ `@Chrome`（已登录本机 Chrome） |
| 和本仓库最相关的目录？ | `tools/led-web`（调试）、`tools/codex-bridge`（状态灯并行） |
| 企业怎么禁？ | `browser_use_full_cdp_access = false` |

---

## 7. 参考链接

- OpenAI：[Codex changelog](https://developers.openai.com/codex/changelog)
- OpenAI：[Browser / Developer mode](https://developers.openai.com/codex/app/browser)
- Chrome DevTools MCP：[GitHub](https://github.com/ChromeDevTools/chrome-devtools-mcp) · [npm](https://www.npmjs.com/package/chrome-devtools-mcp)
- 本仓库：[`tools/codex-bridge/README.md`](../tools/codex-bridge/README.md)、[`led-web-control.md`](./led-web-control.md)、[`led-matrix-interactions.md`](./led-matrix-interactions.md)
