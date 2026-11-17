// Runs actual Node → mounted Python → isolated MongoDB integration. No .env loaded.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
const root = fileURLToPath(new URL("../../", import.meta.url));
const python = process.env.PYTHON || [root + ".venv/Scripts/python.exe", root + ".venv/bin/python"].find(existsSync) || "python";
const run = (args, cwd, env) => new Promise((resolve, reject) => {
  const child = spawn(python, args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", b => output += b); child.stderr.on("data", b => output += b);
  child.on("error", reject); child.on("exit", code => code === 0 ? resolve(output) : reject(new Error(output)));
});
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
let pythonServer, apiServer, mongoose;
try {
  await run(["scripts/prepare_models.py"], root + "services/ml", { ...process.env, VERCEL: "" });
  const listener = createServer(); await new Promise(r => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port; await new Promise(r => listener.close(r));
  const secret = "isolated-farmops-gateway-secret", url = `http://127.0.0.1:${port}`;
  const pythonEnv = { ...process.env, VERCEL: "1", M2_MONGO_URI: mongo.getUri(), M2_DB_NAME: "farmops_integration", M2_GATEWAY_SECRET: secret,
    M2_ALLOW_DEMO_CONTROLS: "true", M2_CV_URL: "", M2_CV_IN_PROCESS: "true" };
  pythonServer = spawn(python, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port)], { cwd: root + "services/ml", env: pythonEnv, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let pythonError = ""; pythonServer.stderr.on("data", b => pythonError += b);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (pythonServer.exitCode !== null) throw new Error(pythonError);
    try { if ((await fetch(url + "/health", { signal: AbortSignal.timeout(500) })).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise(r => setTimeout(r, 150));
  }
  assert.ok(ready, "Combined ML/farm-operations service starts");
  assert.equal((await fetch(url + "/farm-operations/api/m2/meta")).status, 401);
  Object.assign(process.env, { NODE_ENV: "test", M2_API_URL: url + "/farm-operations/api/m2", M2_DB_NAME: "farmops_integration", M2_GATEWAY_SECRET: secret });
  mongoose = (await import("mongoose")).default; await mongoose.connect(mongo.getUri("module1_integration"));
  const { createApp } = await import("../src/app.js");
  const { initializeDatabase } = await import("../src/database.js"); await initializeDatabase();
  const { User } = await import("../src/modules/users/model.js");
  const { Requirement } = await import("../src/modules/requirements/model.js");
  const { Agreement } = await import("../src/modules/contracts/model.js");
  const { signToken } = await import("../src/middleware/auth.js");
  const { m2Id } = await import("../src/modules/module2/handoff.js");
  const { createMongoStore } = await import("../src/modules/contracts/storage.js");
  const { createNotifier } = await import("../src/modules/notifications/notifier.js");
  const { fakeMl } = await import("../test/fakes.js");
  const farm = { village: "Devgad", fpo: "Integration FPO", district: "Sindhudurg", trees: 1000, acres: 10, age: 15, irrigation: "drip" };
  const officer = await User.create({ mobile: "9000330001", name: "FPO Integration Officer", role: "operations", m2Role: "fpo", m2Actor: m2Id.fpo(farm), officerFpoId: m2Id.fpo(farm) });
  const farmer = await User.create({ mobile: "9800330001", name: "Integration Farmer", role: "farmer", farm, fpoOfficer: officer._id });
  const buyer = await User.create({ mobile: "6500330001", name: "Integration Buyer", company: "Integration Buyer", role: "buyer" });
  const requirement = await Requirement.create({ buyer: buyer._id, buyerName: buyer.company, tons: 3, grade: "A", priceUsd: 5, deliverBy: new Date(Date.now() + 35 * 86400000) });
  apiServer = createApp({ ml: fakeMl, notifier: createNotifier(), noMessageBridge: true, contractDeps: { store: createMongoStore(), chain: { enabled: false } } }).listen(0, "127.0.0.1");
  await new Promise(r => apiServer.listening ? r() : apiServer.once("listening", r));
  const base = `http://127.0.0.1:${apiServer.address().port}/api`;
  const call = async (path, user, body) => {
    const response = await fetch(base + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${signToken(user)}`, ...(body && { "content-type": "application/json" }) }, body: body && JSON.stringify(body) });
    const value = await response.json(); assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(value)}`); return value;
  };
  const meta = await call("/m2/meta", officer); assert.ok(meta.actors.fpo.some(f => f.id === m2Id.fpo(farm)));
  const claim = await call("/bonds", farmer, { requirementId: String(requirement._id), tons: 1 });
  const id = claim.agreementId;
  await call(`/contracts/${id}/send`, buyer, {});
  for (const user of [buyer, farmer, officer]) {
    await call(`/contracts/${id}/sign/start`, user, {}); await call(`/contracts/${id}/sign/verify`, user, { otp: "1234" });
    await call(`/contracts/${id}/sign`, user, { type: "typed", typedName: user.name, consent: true });
  }
  const agreement = await Agreement.findOne({ agreementId: id });
  assert.equal(agreement.module2.status, "handed_over"); assert.equal(agreement.chain.status, "not_registered");
  const board = await call("/m2/agreements", buyer); assert.ok(JSON.stringify(board).includes(id));
  const view = await call("/m2/farmer-view", farmer); assert.ok(view.prompts.length > 0);
  const bytes = await run(["-c", "import sys,base64; sys.path.insert(0,'tests'); from mango_images import mango; print(base64.b64encode(mango()).decode())"], root + "services/ml", { ...process.env });
  const form = new FormData(); form.set("photos", new Blob([Buffer.from(bytes.trim(), "base64")], { type: "image/jpeg" }), "test-mango.jpg");
  const uploaded = await fetch(base + `/m2/quality-checks/${view.prompts[0].check_id}/photos`, { method: "POST", headers: { authorization: `Bearer ${signToken(farmer)}` }, body: form });
  assert.ok(uploaded.ok, await uploaded.text());
  const m2db = mongoose.connection.useDb("farmops_integration").db;
  const photo = await m2db.collection("photo_blobs").findOne({}); assert.ok(photo);
  const read = await fetch(base + `/m2/photos/${photo._id}`); assert.equal(read.status, 200); assert.ok((await read.arrayBuffer()).byteLength > 0);
  console.log("PASS: actual Node → mounted Python → MongoDB integration: reference sync, gateway protection, three signatures, blockchain-independent handoff, supply board, photo prompts, live in-process CV and durable photo retrieval.");
  if (process.argv.includes("--browser")) {
    const { default: puppeteer } = await import(new URL("../../../.local/browser-check/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js", import.meta.url));
    const { createServer: viteServer } = await import(new URL("../../client/node_modules/vite/dist/node/index.js", import.meta.url));
    Object.assign(process.env, { API_URL: base.replace(/\/api$/, ""), VITE_REALTIME_URL: "disabled" });
    const vite = await viteServer({ root: root + "client", configFile: root + "client/vite.config.js", server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
    let browser;
    try {
      await vite.listen();
      browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, defaultViewport: { width: 1440, height: 1000 } });
      const errors = [];
      for (const [user, path] of [[officer, "/ops/farm"], [buyer, "/buyer/ops"], [farmer, "/farmer/ops/farmer"]]) {
        console.log(`Checking farm-operations browser role: ${user.role}`);
        const context = await browser.createBrowserContext(), page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
        await page.evaluateOnNewDocument((token, company) => { sessionStorage.setItem("agrilink_token", token); localStorage.setItem("agrilink_buyer", JSON.stringify({ company })); }, signToken(user), user.company);
        await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}${path}`);
        await page.waitForSelector(".m2-root");
        await page.waitForFunction(() => !document.body.innerText.includes("Loading") && !document.querySelector(".m2-loading"));
        try { await page.waitForFunction(expected => document.querySelector(".m2-root")?.innerText.includes(expected), {}, user.role === "farmer" ? `Namaskar, ${farmer.name.split(" ")[0]}` : id); }
        catch (error) { console.log("Farm-operations page content:", (await page.evaluate(() => document.querySelector(".m2-root")?.innerText || document.body.innerText)).slice(0, 1800)); throw error; }
        assert.ok(!(await page.evaluate(() => document.body.innerText)).includes("Farm operations is temporarily unavailable"));
        await page.screenshot({ path: fileURLToPath(new URL(`../../../.local/browser-check/farmops-${user.role}.png`, import.meta.url)), fullPage: true });
      }
      assert.deepEqual(errors, []);
      console.log("PASS: actual browser operations/FPO supply board, buyer farm operations and farmer photo view render through Node and Python without placeholder API responses or runtime errors.");
    } finally { await browser?.close(); await vite.close(); }
  }
  pythonServer.kill(); pythonServer = undefined;
  if (!process.argv.includes("--browser")) {
    const output = await run(["-m", "pytest", "-q"], root + "module2/backend", { ...process.env, VERCEL: "", M2_GATEWAY_SECRET: "", M2_CV_IN_PROCESS: "", M2_MONGO_URI: mongo.getUri(), M2_DB_NAME: "agrilink_m2_test" });
    console.log(output.trim());
  }
} finally {
  pythonServer?.kill(); if (apiServer) await new Promise(r => apiServer.close(r)); await mongoose?.disconnect(); await mongo.stop();
}
