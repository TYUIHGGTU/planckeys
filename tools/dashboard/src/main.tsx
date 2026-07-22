import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import App from "./App";
import { theme } from "./workspace/theme";
import "./styles/global.css";

// 桌面端（Electron）隐藏了原生标题栏，需为内嵌的 macOS 交通灯预留顶栏左侧空间；
// 纯浏览器打开时不加该类，避免无谓留白。
if (/electron/i.test(navigator.userAgent)) {
  document.documentElement.classList.add("is-electron");
}

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Notifications position="bottom-right" limit={4} />
      <App />
    </MantineProvider>
  </StrictMode>,
);
