// 开发期启动器：让 Cmd-Tab / Dock / 菜单栏显示 "Planckeys" 而非 "Electron"。
//
// 原因：dev 模式下 `electron .` 跑的是 node_modules 里的 Electron.app，切换器/Dock 的名字
// 取自该包 Info.plist 的 CFBundleName，运行时 `app.setName()` 改不动。这里把 Electron 的 app
// 包用 APFS clonefile 克隆成本地 Planckeys.app（秒级、写时复制、几乎不占额外磁盘），改掉
// Info.plist 的名字并做 ad-hoc 重签名后直接运行它。
//
// 打包正式 .app（README 第四阶段）后本脚本即可弃用。
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_NAME = "Planckeys";
const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(here, "..");

// require('electron') 返回可执行文件路径：.../Electron.app/Contents/MacOS/Electron
const electronBin = require("electron");
const sourceApp = resolve(electronBin, "..", "..", ".."); // -> .../Electron.app

const devDir = join(projectDir, ".dev");
const targetApp = join(devDir, `${APP_NAME}.app`);
const targetBin = join(targetApp, "Contents", "MacOS", "Electron");
const stamp = join(devDir, ".source"); // 记录克隆自哪个源，源变了就重建

const plistBuddy = "/usr/libexec/PlistBuddy";
const plist = join(targetApp, "Contents", "Info.plist");

/** 只在首次或 electron 版本变更时重建克隆，避免每次启动都拷贝。 */
function ensureRenamedApp() {
  const needRebuild =
    !existsSync(targetBin) ||
    !existsSync(stamp) ||
    readFileSync(stamp, "utf8").trim() !== sourceApp;

  if (!needRebuild) return;

  console.log(`[run-dev] 构建 ${APP_NAME}.app（克隆自 ${sourceApp}）…`);
  mkdirSync(devDir, { recursive: true });
  rmSync(targetApp, { recursive: true, force: true });

  // -c: APFS clonefile（写时复制）。非 APFS 会自动退化成普通拷贝。
  execFileSync("cp", ["-Rc", sourceApp, targetApp], { stdio: "inherit" });

  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    // 有的键可能不存在，Set 失败就 Add。
    try {
      execFileSync(plistBuddy, ["-c", `Set :${key} ${APP_NAME}`, plist]);
    } catch {
      execFileSync(plistBuddy, ["-c", `Add :${key} string ${APP_NAME}`, plist]);
    }
  }

  // 改了 Info.plist 会让原签名失效，做一次 ad-hoc 重签，避免被系统拦下。
  try {
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", targetApp], {
      stdio: "inherit",
    });
  } catch (err) {
    console.warn(`[run-dev] ad-hoc 重签失败（通常仍可运行）：${err?.message ?? err}`);
  }

  writeFileSync(stamp, `${sourceApp}\n`);
}

ensureRenamedApp();

// Cursor 等 Electron 宿主的集成终端会注入 ELECTRON_RUN_AS_NODE=1，会让 Electron 退化成纯
// Node 跑（app 为 undefined）。这里显式剥离。
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(targetBin, [projectDir, ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
