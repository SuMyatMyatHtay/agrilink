import { test } from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import { PassThrough } from "node:stream";
import { EventEmitter, once } from "node:events";
import { forward } from "../src/modules/module2/gateway.js";

test("farm-operations gateway selects HTTPS, forwards parsed bodies and replaces forged identity/secret", async () => {
  const old = { url: process.env.M2_API_URL, secret: process.env.M2_GATEWAY_SECRET, request: https.request };
  process.env.M2_API_URL = "https://python.example/farm-operations/api/m2";
  process.env.M2_GATEWAY_SECRET = "trusted-test-gateway-secret";
  try {
    for (const body of [{ tons: 2 }, Buffer.from([0, 255, 42, 10])]) {
      let captured;
      https.request = (options, respond) => {
        const upstream = new EventEmitter(); upstream.setTimeout = () => upstream; upstream.destroy = () => {};
        upstream.end = bytes => {
          captured = { options, bytes };
          const response = new PassThrough(); response.statusCode = 200; response.headers = { "content-type": "application/json" };
          respond(response); response.end('{"ok":true}');
        };
        return upstream;
      };
      const req = new PassThrough(); req.method = "POST"; req.body = body;
      req.headers = { host: "frontend.example", authorization: "Bearer private-user-token", "x-m2-role": "admin", "x-m2-actor": "other-user", "x-m2-gateway-secret": "forged", "content-type": "application/json" };
      const res = new PassThrough(); res.writeHead = () => {}; res.resume();
      const done = once(res, "finish");
      forward(req, res, "/actions?x=1", { role: "farmer", actor: "AGL-F-actual" }); await done;
      assert.equal(captured.options.hostname, "python.example"); assert.equal(captured.options.path, "/farm-operations/api/m2/actions?x=1");
      assert.equal(captured.options.headers.authorization, undefined); assert.equal(captured.options.headers.host, undefined);
      assert.equal(captured.options.headers["x-m2-role"], "farmer"); assert.equal(captured.options.headers["x-m2-actor"], "AGL-F-actual");
      assert.equal(captured.options.headers["x-m2-gateway-secret"], "trusted-test-gateway-secret");
      assert.deepEqual(captured.bytes, Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
    }
  } finally {
    https.request = old.request;
    for (const [key, value] of [["M2_API_URL", old.url], ["M2_GATEWAY_SECRET", old.secret]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
