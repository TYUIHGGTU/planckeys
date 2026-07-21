import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// base: "./" 便于任意子路径静态托管；WebHID / Web Serial 需安全上下文，localhost 已满足。
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
