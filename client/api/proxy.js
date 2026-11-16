import http from "node:http";
import https from "node:https";

// Same-origin HTTP bridge for every API consumer, including Module 2, PDFs and SSE.
// Socket.IO connects directly to VITE_REALTIME_URL on the persistent backend.
export default function handler(req, res) {
  const fail = (status, error) => {
    if (res.headersSent) return res.destroy();
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error }));
  };
  let target;
  try {
    const base = new URL(process.env.API_URL);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error();
    const incoming = new URL(req.url, "https://client.invalid");
    const route = incoming.searchParams.get("__path");
    const pathname = route ? `/api/${route}` : incoming.pathname;
    incoming.searchParams.delete("__path");
    if (!pathname.startsWith("/api/") || pathname === "/api/proxy") return fail(404, "not_found");
    target = new URL(base.origin);
    target.pathname = pathname;
    target.search = incoming.search;
    if (!target.pathname.startsWith("/api/")) return fail(400, "invalid_api_path");
  } catch {
    return fail(503, "api_url_not_configured");
  }
  const headers = { ...req.headers, host: target.host };
  // Vercel may parse JSON/form bodies before invoking the function.
  const parsedBody = req.body === undefined ? undefined
    : Buffer.isBuffer(req.body) ? req.body
    : typeof req.body === "string" ? Buffer.from(req.body)
    : (headers["content-type"] || "").includes("application/x-www-form-urlencoded")
      ? Buffer.from(new URLSearchParams(req.body).toString())
      : Buffer.from(JSON.stringify(req.body));
  if (parsedBody !== undefined) headers["content-length"] = String(parsedBody.length);
  for (const key of ["connection", "transfer-encoding", "keep-alive", "upgrade", "cookie"]) delete headers[key];
  const upstream = (target.protocol === "https:" ? https : http).request(target, { method: req.method, headers }, (response) => {
    res.statusCode = response.statusCode;
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined && !["connection", "transfer-encoding", "keep-alive", "set-cookie"].includes(key)) res.setHeader(key, value);
    }
    res.setHeader("cache-control", "no-store");
    response.on("error", () => fail(502, "backend_unavailable"));
    response.pipe(res);
  });
  upstream.setTimeout(55_000, () => upstream.destroy(new Error("timeout")));
  upstream.on("error", () => fail(502, "backend_unavailable"));
  req.on("aborted", () => upstream.destroy());
  if (parsedBody !== undefined) upstream.end(parsedBody);
  else req.pipe(upstream);
}
