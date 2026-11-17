import { Router } from "express";
import { z } from "zod";
import { wrap } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { speechConfigured, speechMode, transcribe } from "./speech.js";
export default function speechModule(deps) {
  const r = Router(); r.use(requireAuth("farmer"));
  r.get("/status", (_req, res) => res.json({ configured: speechConfigured(), mode: speechMode(), maxBytes: 2 * 1024 * 1024, maxSeconds: 90 }));
  r.post("/transcribe", wrap(async (req, res) => {
    const { audio, language } = z.object({ audio: z.string().max(2900000).regex(/^data:audio\/[A-Za-z0-9.+-]+(?:;codecs=[A-Za-z0-9.+-]+)?;base64,[A-Za-z0-9+/=]+$/), language: z.string().regex(/^[a-z]{2}$/).optional() }).parse(req.body);
    res.json(await (deps.transcribe || transcribe)(Buffer.from(audio.split(",")[1], "base64"), { mime: audio.slice(5, audio.indexOf(";")), language }));
  }));
  return { path: "/speech", router: r };
}
