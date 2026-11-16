import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const config = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  const API = process.env.API_URL || config.API_URL || "http://127.0.0.1:4000";
  return {
  plugins: [react()],
  resolve: {
    // Module 2 (teammate's module) is used straight from its cloned folder: ../module2/frontend/src/module2
    alias: { "@module2": fileURLToPath(new URL("../module2/frontend/src/module2", import.meta.url)) },
    // one copy of React / router for both modules
    dedupe: ["react", "react-dom", "react-router-dom"],
  },
  server: {
    port: 5173,
    fs: { allow: [".."] },
    // One API for everything: /api/m2 is served by the AgriLink API gateway (one sign-in), which forwards to Module 2.
    proxy: {
      "/api": API,
      "/socket.io": { target: API, ws: true },
    },
  },
  };
});
