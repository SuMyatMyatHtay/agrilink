import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { initializeDatabase } from "../src/database.js";
import { User } from "../src/modules/users/model.js";
import { Requirement } from "../src/modules/requirements/model.js";
import { MessageLog } from "../src/modules/messaging/model.js";
import { TelegramLink } from "../src/modules/telegram/model.js";
import { telegramProvider } from "../src/modules/telegram/provider.js";
import { createNotifier } from "../src/modules/notifications/notifier.js";
import { createMessenger } from "../src/modules/messaging/service.js";
import { signToken } from "../src/middleware/auth.js";
import { fakeMl } from "./fakes.js";

test("Telegram: authenticated single-use linking, secret validation, commands, notifications, dedupe, retries and unlink", async () => {
  const settings = { TELEGRAM_ENABLED: "true", TELEGRAM_MODE: "live", TELEGRAM_BOT_TOKEN: "123:fake-token", TELEGRAM_BOT_USERNAME: "agrilink_test_bot", TELEGRAM_WEBHOOK_SECRET: "test-secret", PUBLIC_APP_URL: "https://agrilink.example", MESSAGING_CHANNELS: "telegram" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let server;
  try {
    await mongoose.connect(mongo.getUri("telegram_test")); await initializeDatabase();
    const [farmer, other, buyer] = await User.create([
      { role: "farmer", mobile: "9876500001", name: "Farmer One" }, { role: "farmer", mobile: "9876500002", name: "Farmer Two" }, { role: "buyer", mobile: "6500000001", company: "Test Buyer" },
    ]);
    const sent = []; let failNext = false;
    const provider = { configured: true, name: "telegram", async sendText(message) { if (failNext) { failNext = false; throw new Error("Test provider unavailable"); } sent.push(message); return { providerId: String(sent.length) }; } };
    const telegram = { provider, mode: "live", answer: async () => ({ reply: "Mitra test response" }) };
    const notifier = createNotifier(), messenger = createMessenger({ telegram: provider, telegramMode: "live" });
    server = createApp({ ml: fakeMl, notifier, messenger, telegram }).listen(0);
    await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const api = async (path, { method = "GET", user, body, secret } = {}) => {
      const response = await fetch(`${origin}/api/telegram${path}`, { method, headers: { "content-type": "application/json", ...(user && { authorization: `Bearer ${signToken(user)}` }), ...(secret && { "x-telegram-bot-api-secret-token": secret }) }, body: body && JSON.stringify(body) });
      return { status: response.status, data: await response.json().catch(() => ({})) };
    };
    let updateId = 1;
    const payload = (text, chat = 1001, type = "private") => ({ update_id: updateId++, message: { chat: { id: chat, type }, from: { id: chat }, text } });
    const webhook = (body, secret = "test-secret") => api("/webhook", { method: "POST", body, secret });
    const linkFor = async (user) => {
      const response = await api("/link", { method: "POST", user }); assert.equal(response.status, 200);
      return new URL(response.data.link).searchParams.get("start");
    };
    assert.equal((await api("/link", { method: "POST" })).status, 401);
    assert.equal((await api("/link", { method: "POST", user: buyer })).status, 403);
    assert.equal((await webhook(payload("/help"), "wrong")).status, 401); assert.equal(sent.length, 0);
    const token = await linkFor(farmer);
    assert.ok(await TelegramLink.findById(createHash("sha256").update(token).digest("hex")));
    assert.equal(await TelegramLink.findById(token), null);
    await webhook(payload("/start 9876500001")); assert.ok(!await User.exists({ _id: farmer._id, telegramChatId: { $exists: true } }));
    const start = payload(`/start ${token}`);
    assert.equal((await webhook(start)).status, 200); assert.equal((await User.findById(farmer._id)).telegramChatId, "1001");
    const afterStart = sent.length; await webhook(start); assert.equal(sent.length, afterStart);
    await webhook(payload(`/start ${token}`, 1002)); assert.equal((await User.findById(farmer._id)).telegramChatId, "1001");
    const otherToken = await linkFor(other);
    await webhook(payload(`/start ${otherToken}`)); assert.equal((await User.findById(other._id)).telegramChatId, undefined);
    const beforeGroup = sent.length; await webhook(payload(`/start ${otherToken}`, 1002, "group")); assert.equal(sent.length, beforeGroup);
    await TelegramLink.updateOne({ user: other._id }, { expiresAt: new Date(Date.now() - 1000) });
    await webhook(payload(`/start ${otherToken}`, 1002)); assert.equal((await User.findById(other._id)).telegramChatId, undefined);
    await Requirement.create({ buyer: buyer._id, buyerName: buyer.company, grade: "A", tons: 10, filled: 1, reserved: 2, priceUsd: 5, deliverBy: new Date() });
    await webhook(payload("/requests")); assert.match(sent.at(-1).text, /7 t available/); assert.match(sent.at(-1).text, /farmer\/offers\?requirement=/);
    await webhook(payload("How should I harvest?")); assert.equal(sent.at(-1).text, "Mitra test response");
    let downloads = 0;
    telegram.speech = { fetchImpl: async () => ++downloads % 2 ? Response.json({ ok: true, result: { file_path: "voice/test.oga", file_size: 5 } }) : new Response(Buffer.from("audio")),
      transcribe: async () => ({ text: "How should I irrigate?" }) };
    const voiceUpdate = payload(""); voiceUpdate.message.voice = { file_id: "voice-file", duration: 4, file_size: 5 };
    assert.equal((await webhook(voiceUpdate)).status, 200); assert.match(sent.at(-1).text, /I heard: How should I irrigate/);
    const afterVoice = sent.length; await webhook(voiceUpdate); assert.equal(sent.length, afterVoice); assert.equal(downloads, 2);
    await webhook(payload("/stop")); assert.equal((await User.findById(farmer._id)).telegramEnabled, false);
    assert.equal((await messenger.dispatch(farmer._id, "new_requirement", { buyer: "Buyer", grade: "A", tons: "2", price: "5", url: "https://agrilink.example" })).length, 0);
    await webhook(payload("/subscribe")); assert.equal((await User.findById(farmer._id)).telegramEnabled, true);
    const source = { source: { kind: "test", ref: "request-1" }, dedupeKey: "request-1" };
    const results = await Promise.all([1, 2].map(() => messenger.dispatch(farmer._id, "new_requirement", { buyer: "Buyer", grade: "A", tons: "2", price: "5", url: "https://agrilink.example" }, source)));
    assert.equal(results.flat().length, 1); assert.equal(results.flat()[0].status, "sent");
    assert.equal(await MessageLog.countDocuments({ channel: "whatsapp" }), 0);
    const linked = await api("/status", { user: farmer }); assert.equal(linked.data.linked, true); assert.ok(!JSON.stringify(linked.data).includes("fake-token"));
    telegram.mode = "simulated"; const beforeSimulation = sent.length; await webhook(payload("/status")); assert.equal(sent.length, beforeSimulation); telegram.mode = "live";
    await webhook(payload("/unlink")); assert.equal((await api("/status", { user: farmer })).data.linked, false);
    const retryToken = await linkFor(other), retryPayload = payload(`/start ${retryToken}`, 1002); failNext = true;
    assert.equal((await webhook(retryPayload)).status, 502); assert.equal((await webhook(retryPayload)).status, 200);
    assert.match(sent.at(-1).text, /Connected to AgriLink as Farmer Two/);
    assert.ok(await MessageLog.exists({ channel: "telegram", status: "failed" }));
    await api("/link", { method: "DELETE", user: other }); assert.equal((await api("/status", { user: other })).data.linked, false);
    await assert.rejects(() => telegramProvider(async () => { throw new Error(`https://example/${settings.TELEGRAM_BOT_TOKEN}`); }).sendText({ to: "1001", text: "test" }), (e) => !e.message.includes(settings.TELEGRAM_BOT_TOKEN));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await mongo.stop();
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
