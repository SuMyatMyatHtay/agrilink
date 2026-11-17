// One local command for client + Module 1 + combined ML/Module 2.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
for (const file of [root + "server/.env", root + "services/ml/.env"]) if (existsSync(file)) process.loadEnvFile(file);
if (!process.env.MONGO_URI) throw new Error("Set MONGO_URI in agrilink/server/.env first. The same connection will be used for farm operations.");
for (const port of [4000, 8000, 5173]) {
  const busy = await new Promise(resolve => { const socket = createConnection({ host: "127.0.0.1", port }); socket.once("connect", () => { socket.destroy(); resolve(true); }); socket.once("error", () => resolve(false)); });
  if (busy) throw new Error(`Port ${port} is already in use. Stop the old development server with Ctrl+C, then rerun this command. No existing process was stopped.`);
}
const python = process.env.PYTHON || [root + ".venv/Scripts/python.exe", root + ".venv/bin/python"].find(existsSync) || "python";
const environment = { ...process.env, NODE_ENV: "development", VERCEL: "", PORT: "4000", ML_URL: "http://127.0.0.1:8000",
  API_URL: "http://127.0.0.1:4000", VITE_REALTIME_URL: "http://127.0.0.1:4000", M2_API_URL: "http://127.0.0.1:8000/farm-operations/api/m2",
  M2_MONGO_URI: process.env.M2_MONGO_URI || process.env.MONGO_URI, M2_DB_NAME: process.env.M2_DB_NAME || "agrilink_m2",
  M2_GATEWAY_SECRET: process.env.M2_GATEWAY_SECRET || randomBytes(32).toString("hex"), M2_PHOTO_STORE: "mongodb", M2_CV_URL: "", M2_PUBLIC_TRACE_BASE: "http://127.0.0.1:5173/trace",
  SPEECH_MODE: process.env.SPEECH_MODE || "demo" };
const children = []; let stopping = false;
const stop = () => { if (stopping) return; stopping = true; for (const child of children) child.kill(); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
function launch(name, executable, args, cwd) {
  const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: "inherit" }); children.push(child);
  child.on("error", () => { console.error(`${name} could not start. Check its installed dependencies.`); process.exitCode = 1; stop(); });
  child.on("exit", code => { if (!stopping) { console.error(`${name} stopped (${code}). Stopping the combined stack.`); process.exitCode = code || 1; stop(); } });
}
console.log("Starting AgriLink: client 5173, Module 1 API 4000, ML + farm operations 8000. Ctrl+C stops this stack.");
launch("ML + farm operations", python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], root + "services/ml");
launch("Module 1", process.execPath, ["src/index.js"], root + "server");
launch("Client", process.execPath, [root + "client/node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], root + "client");
