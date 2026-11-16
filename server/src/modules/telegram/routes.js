import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.js";
import { wrap, HttpError } from "../../lib/http.js";
import { User } from "../users/model.js";
import { createLink, disconnect, handleUpdate } from "./service.js";
import { telegramEnabled, telegramMode, telegramProvider, botUsername } from "./provider.js";
export default function telegramModule(deps) {
  const r = Router();
  r.get("/bot", (_req, res) => res.json({ link: telegramProvider().configured && botUsername() && process.env.TELEGRAM_WEBHOOK_SECRET ? `https://t.me/${botUsername()}` : null }));
  r.post("/webhook", wrap(async (req, res) => {
    if (!telegramEnabled()) throw new HttpError(503, "Telegram disabled", "telegram_disabled");
    const a = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET || ""), b = Buffer.from(req.get("x-telegram-bot-api-secret-token") || "");
    if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return res.sendStatus(401);
    const payload = z.object({ update_id: z.number().int().nonnegative().safe(), message: z.object({
      chat: z.object({ id: z.number().int().safe(), type: z.string() }).passthrough(),
      from: z.object({ id: z.number().int().safe(), is_bot: z.boolean().optional() }).passthrough(),
      text: z.string().optional(),
    }).passthrough().optional() }).passthrough().parse(req.body);
    await handleUpdate(payload, { ...deps, ...deps.telegram });
    res.json({ ok: true });
  }));
  r.use(requireAuth("farmer"));
  r.get("/status", wrap(async (req, res) => {
    const user = await User.findById(req.auth.id).select("telegramChatId telegramEnabled");
    res.json({ configured: telegramProvider().configured && !!botUsername() && !!process.env.TELEGRAM_WEBHOOK_SECRET, mode: telegramMode(), linked: !!user?.telegramChatId, notificationsEnabled: user?.telegramEnabled !== false, username: botUsername() || null });
  }));
  r.post("/link", wrap(async (req, res) => res.json(await createLink(req.auth.id))));
  r.patch("/preferences", wrap(async (req, res) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    await User.updateOne({ _id: req.auth.id }, { $set: { telegramEnabled: enabled } });
    res.json({ ok: true });
  }));
  r.delete("/link", wrap(async (req, res) => { await disconnect(req.auth.id); res.json({ ok: true }); }));
  return { path: "/telegram", router: r };
}
