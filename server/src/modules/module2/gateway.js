import http from "node:http";
import https from "node:https";
import { m2Base, m2Headers } from "../../lib/m2config.js";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { User } from "../users/model.js";
import { m2Id, syncPeople } from "./handoff.js";

/**
 * One sign-in for the whole platform: every Module 2 call goes through the AgriLink API.
 * The gateway verifies the AgriLink JWT and sets Module 2's identity headers on the server:
 *   farmer     → X-M2-Role farmer, X-M2-Actor AGL-F-<userId>   (the id Module 1 synced into Module 2)
 *   buyer      → X-M2-Role buyer,  X-M2-Actor AGL-B-<userId>
 *   operations → the farm-operations role chosen by that user (admin / fpo / doctor) and its actor id
 * Browser-supplied X-M2-* headers are discarded. Public endpoints (lot QR trace, photos, meta, health) need no login.
 * Bodies are streamed untouched, so multipart photo uploads work.
 */
const PUBLIC = [/^\/health$/, /^\/meta$/, /^\/trace\//, /^\/photos\//, /^\/system\/clock$/];

export async function m2Identity(auth) {
  const u = await User.findById(auth.id).select("role m2Role m2Actor officerFpoId");
  if (!u || u.role !== auth.role) return null;
  if (auth.role === "farmer") return { role: "farmer", actor: m2Id.farmer(auth.id) };
  if (auth.role === "buyer") return { role: "buyer", actor: m2Id.buyer(auth.id) };
  if (auth.role === "operations") {
    return { role: u?.m2Role || "admin", actor: u?.m2Role === "fpo" && u.officerFpoId ? u.officerFpoId : u?.m2Actor || "OPS-1" };
  }
  return null;
}

export function forward(req, res, path, identity) {
  const TARGET = new URL(m2Base());
  const headers = { ...req.headers };
  for (const h of Object.keys(headers)) if (h.toLowerCase().startsWith("x-m2-") || h === "authorization" || h === "host") delete headers[h];
  Object.assign(headers, m2Headers());
  if (identity) { headers["x-m2-role"] = identity.role; if (identity.actor) headers["x-m2-actor"] = identity.actor; }
  const transport = TARGET.protocol === "https:" ? https : http;
  const parsed = req.body !== undefined;
  let body;
  if (parsed) {
    body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    delete headers["transfer-encoding"]; headers["content-length"] = String(body.length);
  }
  const up = transport.request({ hostname: TARGET.hostname, port: TARGET.port || undefined, method: req.method, path: TARGET.pathname.replace(/\/$/, "") + path, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.setTimeout(25000, () => up.destroy(new Error("upstream_timeout")));
  up.on("error", () => { if (!res.headersSent) res.status(502).json({ error: { code: "farm_operations_unavailable", message: "Farm operations is unavailable. Check the Python deployment, M2_API_URL, shared gateway secret and MongoDB settings." } }); else res.destroy(); });
  req.on("aborted", () => up.destroy());
  if (parsed) up.end(body); else req.pipe(up);
}

export function m2Gateway({ notifier } = {}) {
  let lastSync = 0, sync;
  return async (req, res) => {
    // any successful change in farm operations refreshes the AI Decision Center live
    if (req.method !== "GET") res.on("finish", () => { if (res.statusCode < 400) notifier?.changed?.("farmops"); });
    const path = req.url; // already stripped of /api/m2
    const h = req.headers.authorization || "";
    let auth = null;
    if (h.startsWith("Bearer ")) { try { const p = jwt.verify(h.slice(7), env.jwtSecret); auth = { id: p.sub, role: p.role }; } catch { /* invalid */ } }
    const isPublic = PUBLIC.some((re) => re.test(path.split("?")[0]));
    if (!auth && !isPublic) return res.status(401).json({ error: { message: "Login required" } });
    if (auth && path.split("?")[0] === "/meta" && Date.now() - lastSync > 60000) {
      try { sync ||= syncPeople(); await sync; lastSync = Date.now(); }
      catch { console.warn("Farm operations reference synchronization deferred"); }
      finally { sync = undefined; }
    }
    try {
      const identity = auth ? await m2Identity(auth) : null;
      if (auth && !identity) return res.status(401).json({ error: { message: "Session user no longer exists or has changed role" } });
      forward(req, res, path, identity);
    }
    catch { if (!res.headersSent) res.status(503).json({ error: { message: "Farm operations configuration is invalid" } }); }
  };
}
