import mongoose from "mongoose";
import { createHash, randomBytes } from "node:crypto";
import { TelegramLink, TelegramUpdate } from "./model.js";
import { telegramProvider, telegramMode, botUsername, telegramEnabled } from "./provider.js";
import { User } from "../users/model.js";
import { Requirement } from "../requirements/model.js";
import { availableTons } from "../bonds/allocation.js";
import { answer } from "../assistant/routes.js";
import { MessageLog } from "../messaging/model.js";
import { HttpError } from "../../lib/http.js";
const hash = (token) => createHash("sha256").update(token).digest("hex");
const appUrl = () => (process.env.PUBLIC_APP_URL || "http://localhost:5173").replace(/\/$/, "");
const HELP = "/requests - open buyer requests\n/status - account status\n/stop - pause notifications\n/subscribe - resume notifications\n/unlink - disconnect\n/help - commands\nYou can also type a farming question. Voice notes are not supported yet.";
export async function createLink(userId) {
  if (!telegramEnabled() || !botUsername() || !process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET) throw new HttpError(503, "Telegram is not configured yet", "telegram_not_configured");
  const token = randomBytes(24).toString("base64url"), expiresAt = new Date(Date.now() + 10 * 60_000);
  await TelegramLink.deleteMany({ user: userId });
  await TelegramLink.create({ _id: hash(token), user: userId, expiresAt });
  return { link: `https://t.me/${botUsername()}?start=${token}`, expiresAt };
}
async function connect(token, chatId) {
  let user;
  await mongoose.connection.transaction(async (session) => {
    const link = await TelegramLink.findOneAndDelete({ _id: hash(token), expiresAt: { $gt: new Date() } }, { session });
    if (!link) throw new HttpError(400, "This link expired or was already used. Create a new link from your AgriLink Profile.", "invalid_link");
    const existing = await User.findOne({ telegramChatId: chatId }).session(session);
    if (existing && String(existing._id) !== String(link.user)) throw new HttpError(409, "This Telegram account is already connected. Use /unlink first.", "already_linked");
    user = await User.findOneAndUpdate({ _id: link.user, role: "farmer" }, { $set: { telegramChatId: chatId, telegramEnabled: true } }, { new: true, session });
    if (!user) throw new HttpError(404, "Farmer account no longer exists", "not_found");
  });
  return user;
}
export async function disconnect(userId) {
  await mongoose.connection.transaction(async (session) => {
    await User.updateOne({ _id: userId }, { $unset: { telegramChatId: "" }, $set: { telegramEnabled: false } }, { session });
    await TelegramLink.deleteMany({ user: userId }, { session });
  });
}
export async function handleUpdate(update, inject = {}) {
  const message = update.message;
  if (!message || message.chat?.type !== "private" || message.from?.is_bot || message.from?.id !== message.chat.id) return { ignored: true };
  const chatId = String(message.chat.id), now = new Date();
  const previous = await TelegramUpdate.findById(update.update_id);
  if (previous && previous.chatId !== chatId) throw new HttpError(409, "Update identity mismatch", "update_mismatch");
  if (previous?.status === "done") return { duplicate: true };
  if (previous?.status === "processing" && previous.leaseUntil > now) throw new HttpError(503, "Update processing; retry later", "processing");
  try {
    await TelegramUpdate.findOneAndUpdate({ _id: update.update_id, $or: [{ status: "failed" }, { leaseUntil: { $lte: now } }, { status: { $exists: false } }] }, {
      $set: { chatId, status: "processing", leaseUntil: new Date(Date.now() + 120_000), expiresAt: new Date(Date.now() + 7 * 86400000) },
    }, { upsert: true, new: true });
  } catch (error) { if (error.code === 11000) throw new HttpError(503, "Update processing; retry later", "processing"); throw error; }
  try {
    let user = await User.findOne({ telegramChatId: chatId, role: "farmer" });
    const text = (message.text || "").trim().slice(0, 1500), [raw, parameter] = text.split(/\s+/), command = raw?.split("@")[0].toLowerCase();
    let reply = previous?.reply;
    if (reply && previous.replyUser) user = await User.findById(previous.replyUser);
    if (!reply) {
      if (command === "/start" && parameter) {
        try { user = await connect(parameter, chatId); reply = `Connected to AgriLink as ${user.name || "farmer"}. New buyer requests will be sent here.\n\n${HELP}`; }
        catch (error) { if (error instanceof HttpError) reply = error.message; else throw error; }
      } else if (!user) reply = `Welcome to Mitra. Sign in and open Profile > Connect Telegram to link your AgriLink account.\n${appUrl()}/farmer/profile`;
      else if (command === "/help" || command === "/start") reply = HELP;
      else if (command === "/status") reply = `Connected as ${user.name || "farmer"}. Notifications: ${user.telegramEnabled === false ? "paused" : "enabled"}. Mode: ${inject.mode || telegramMode()}.`;
      else if (command === "/stop" || command === "/subscribe") { user.telegramEnabled = command === "/subscribe"; await user.save(); reply = user.telegramEnabled ? "Notifications resumed." : "Notifications paused. Use /subscribe to resume or /unlink to disconnect."; }
      else if (command === "/unlink") { await disconnect(user._id); reply = "Your Telegram account is disconnected from AgriLink."; }
      else if (command === "/requests") {
        const rows = await Requirement.find({ $expr: { $gt: [{ $subtract: ["$tons", { $add: ["$filled", { $ifNull: ["$reserved", 0] }] }] }, 0] } }).sort({ createdAt: -1 }).limit(5);
        reply = rows.length ? "Open buyer requests (first come, first served):\n\n" + rows.map((r) => `${r.buyerName}: Grade ${r.grade}, ${availableTons(r)} t available, USD ${r.priceUsd}/kg.\n${appUrl()}/farmer/offers?requirement=${r._id}`).join("\n\n") : "No open buyer requests right now.";
      } else if (!text || message.voice || message.audio) reply = "Please type your question. Telegram voice transcription is not implemented yet.";
      else if (text.startsWith("/")) reply = HELP;
      else { try { reply = (await (inject.answer || answer)(user._id, [{ role: "user", content: text }], user.lang || "en", inject)).reply; } catch { reply = "Mitra is temporarily unavailable. You can still use /requests."; } }
      await TelegramUpdate.updateOne({ _id: update.update_id }, { $set: { reply, replyUser: user?._id } });
    }
    const provider = inject.provider || telegramProvider(), mode = inject.mode || telegramMode();
    const log = await MessageLog.create({ user: user?._id, channel: "telegram", template: "chat_reply", lang: user?.lang || "en", to: `chat:***${chatId.slice(-3)}`, body: reply.slice(0, 4000), mode, status: "queued", provider: "telegram", source: { kind: "telegram_chat", ref: String(update.update_id) } });
    if (mode === "simulated") log.status = "simulated";
    else {
      try {
        if (!provider.configured) throw new HttpError(503, "Telegram not configured", "telegram_not_configured");
        const result = await provider.sendText({ to: chatId, text: log.body }); log.status = "sent"; log.providerId = result.providerId;
      } catch { log.status = "failed"; log.lastError = "Telegram reply was not confirmed"; await log.save(); throw new HttpError(502, "Telegram reply could not be confirmed; retry this update", "telegram_unavailable"); }
    }
    await log.save();
    await TelegramUpdate.updateOne({ _id: update.update_id }, { $set: { status: "done" } });
    return { ok: true };
  } catch (error) { await TelegramUpdate.updateOne({ _id: update.update_id }, { $set: { status: "failed" } }); throw error; }
}
