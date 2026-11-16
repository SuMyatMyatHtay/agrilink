import { Router } from "express";
import { wrap } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { Notification } from "./model.js";
import { z } from "zod";

export default function notificationsModule() {
  const r = Router();
  r.use(requireAuth());

  // Latest notifications + unread count (used on login and as a fallback when the socket is down)
  r.get("/", wrap(async (req, res) => {
    const [items, unread, unseenRequestIds] = await Promise.all([
      Notification.find({ user: req.auth.id }).sort({ createdAt: -1 }).limit(30),
      Notification.countDocuments({ user: req.auth.id, read: false }),
      Notification.distinct("data.reqId", { user: req.auth.id, type: "req_new", requestViewedAt: { $exists: false } }),
    ]);
    res.json({ items, unread, unseenRequestIds });
  }));

  r.post("/requests/viewed", requireAuth("farmer"), wrap(async (req, res) => {
    const { requestIds } = z.object({ requestIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(200) }).parse(req.body);
    await Notification.updateMany({ user: req.auth.id, type: "req_new", "data.reqId": { $in: requestIds }, requestViewedAt: { $exists: false } }, { $set: { requestViewedAt: new Date(), read: true } });
    res.json({ ok: true });
  }));

  r.post("/read-all", wrap(async (req, res) => {
    await Notification.updateMany({ user: req.auth.id, read: false }, { read: true });
    res.json({ ok: true });
  }));

  return { path: "/notifications", router: r };
}
