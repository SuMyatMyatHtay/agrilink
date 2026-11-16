import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDatabase, initializeDatabase, models } from "../src/database.js";
import { seedIfEmpty } from "../src/seed.js";
import { User } from "../src/modules/users/model.js";
import { Requirement } from "../src/modules/requirements/model.js";
import { createApp } from "../src/app.js";
import proxy from "../../client/api/proxy.js";
import { env } from "../src/config/env.js";
import { Agreement } from "../src/modules/contracts/model.js";
import { fakeMl } from "./fakes.js";

test("isolated MongoDB: init, seed, API, Vercel bridge, persistence, idempotency", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  let backend, frontend;
  const previous = process.env.API_URL;
  try {
    await connectDatabase(mongo.getUri("agrilink_isolated_test"));
    await initializeDatabase();
    await initializeDatabase();
    const collections = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
    for (const model of models) assert.ok(collections.includes(model.collection.name));
    assert.equal(await seedIfEmpty(), true);
    assert.equal(await seedIfEmpty(), false);
    assert.equal(await User.countDocuments(), 5);
    assert.equal(await Requirement.countDocuments(), 4);
    assert.ok((await Requirement.findOne()).deliverBy > new Date());
    const usersIndex = await User.collection.indexes();
    assert.ok(usersIndex.some((i) => i.key.mobile === 1 && i.unique));
    let modelDown = false;
    const ml = { ...fakeMl, price: (...args) => {
      if (modelDown) throw new Error("model unavailable");
      return fakeMl.price(...args);
    }, evaluate: (...args) => {
      if (modelDown) throw new Error("model unavailable");
      return fakeMl.evaluate(...args);
    } };
    backend = createApp({ noMessageBridge: true, ml }).listen(0, "127.0.0.1");
    await once(backend, "listening");
    process.env.API_URL = `http://127.0.0.1:${backend.address().port}`;
    frontend = http.createServer(proxy).listen(0, "127.0.0.1");
    await once(frontend, "listening");
    const base = `http://127.0.0.1:${frontend.address().port}`;
    const health = await fetch(`${base}/api/proxy?__path=health/db`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).database, "connected");
    const login = await fetch(`${base}/api/proxy?__path=auth/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "6500000001", role: "buyer", otp: env.devOtp }),
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const created = await fetch(`${base}/api/proxy?__path=requirements`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ grade: "A", tons: 5, priceUsd: 5, deliverBy: "2028-05-01" }),
    });
    assert.equal(created.status, 201);
    assert.equal(await Requirement.countDocuments(), 5);
    // A buyer can still publish/read an offer while the optional ML service is down.
    modelDown = true;
    const outagePost = await fetch(`${base}/api/proxy?__path=requirements`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ grade: "B", tons: 3, priceUsd: 4, deliverBy: "2028-06-01" }),
    });
    assert.equal(outagePost.status, 201);
    const published = await outagePost.json();
    assert.equal(published.verdict.status, "unavailable");
    assert.equal(published.advice, null);
    assert.equal(await Requirement.countDocuments(), 6);
    const list = await fetch(`${base}/api/proxy?__path=requirements`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(list.status, 200);
    assert.ok((await list.json()).some((r) => r._id === published._id));
    const farmerLogin = await fetch(`${base}/api/proxy?__path=auth/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mobile: "9888888801", role: "farmer", otp: env.devOtp }),
    });
    const farmer = await farmerLogin.json();
    const offers = await fetch(`${base}/api/proxy?__path=requirements`, { headers: { authorization: `Bearer ${farmer.token}` } });
    assert.equal(offers.status, 200);
    assert.ok((await offers.json()).some((r) => r._id === published._id));
    const summary = await fetch(`${base}/api/farmers/me/summary`, { headers: { authorization: `Bearer ${farmer.token}` } });
    assert.equal(summary.status, 200);
    assert.ok((await summary.json()).freeTons > 0);
    const commitment = await fetch(`${base}/api/bonds`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${farmer.token}` },
      body: JSON.stringify({ requirementId: published._id, tons: 1 }),
    });
    assert.equal(commitment.status, 201);
    const bond = await commitment.json();
    assert.ok(bond.agreementId);
    assert.equal(await Agreement.countDocuments({ bond: bond._id }), 1);
    const buyerAgreements = await fetch(`${base}/api/contracts`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(buyerAgreements.status, 200);
    assert.ok((await buyerAgreements.json()).items.some((a) => a.agreementId === bond.agreementId));
    assert.equal(await seedIfEmpty(), false);
    assert.equal(await Requirement.countDocuments(), 6);
    const bad = await fetch(`${base}/api/does-not-exist`);
    assert.equal(bad.status, 404);
    const authPost = async (path, body) => {
      const response = await fetch(`${base}/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    // Repair an account previously created by the old quick-login behavior.
    await User.create({ mobile: "9876543210", role: "farmer" });
    for (const mobile of ["9876543210", "9876543211", "9876543212"]) {
      const demo = await authPost("demo", { mobile, role: "farmer" });
      assert.equal(demo.status, 200);
      assert.equal(demo.body.needsOnboarding, false);
      assert.ok(demo.body.user.farm.trees > 0);
      assert.ok(demo.body.token);
    }
    await User.updateOne({ mobile: "9876543210" }, { $set: { "farm.trees": 444 } });
    const repeatedDemo = await authPost("demo", { mobile: "9876543210", role: "farmer" });
    assert.equal(repeatedDemo.body.user.farm.trees, 444);
    assert.equal((await authPost("demo", { mobile: "9777777700", role: "farmer" })).status, 400);
    const ordinary = await authPost("verify", { mobile: "9777777700", role: "farmer", otp: env.devOtp });
    assert.equal(ordinary.status, 200);
    assert.equal(ordinary.body.needsOnboarding, true);
    delete process.env.API_URL;
    assert.equal((await fetch(`${base}/api/health`)).status, 503);
    await mongoose.disconnect();
    process.env.API_URL = `http://127.0.0.1:${backend.address().port}`;
    assert.equal((await fetch(`${base}/api/health/db`)).status, 503);
  } finally {
    if (previous === undefined) delete process.env.API_URL; else process.env.API_URL = previous;
    await Promise.all([frontend, backend].filter(Boolean).map((s) => new Promise((resolve) => s.close(resolve))));
    await mongoose.disconnect();
    await mongo.stop();
  }
});

test("Vercel bridge preserves parsed JSON, query strings, binary bytes and SSE", async () => {
  const previous = process.env.API_URL;
  const backend = http.createServer(async (req, res) => {
    if (req.url.startsWith("/api/document")) {
      res.setHeader("content-type", "application/pdf");
      return res.end(Buffer.from([0, 255, 42, 10]));
    }
    if (req.url.startsWith("/api/stream")) {
      res.setHeader("content-type", "text/event-stream");
      res.write("data: first\n\n");
      return res.end("data: last\n\n");
    }
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ url: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(parts).toString()) }));
  }).listen(0, "127.0.0.1");
  await once(backend, "listening");
  const frontend = http.createServer(async (req, res) => {
    // Match Vercel's documented parsed req.body contract for JSON.
    if (req.headers["content-type"]?.includes("application/json")) {
      const parts = [];
      for await (const chunk of req) parts.push(chunk);
      req.body = JSON.parse(Buffer.concat(parts).toString());
    }
    proxy(req, res);
  }).listen(0, "127.0.0.1");
  await once(frontend, "listening");
  try {
    process.env.API_URL = `http://127.0.0.1:${backend.address().port}`;
    const base = `http://127.0.0.1:${frontend.address().port}/api/proxy`;
    const response = await fetch(`${base}?__path=echo&lang=mr&grade=A`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({ message: "mango", tons: 5 }),
    });
    assert.deepEqual(await response.json(), { url: "/api/echo?lang=mr&grade=A", auth: "Bearer test", body: { message: "mango", tons: 5 } });
    const pdf = await fetch(`${base}?__path=document`);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await pdf.arrayBuffer()), Buffer.from([0, 255, 42, 10]));
    const stream = await fetch(`${base}?__path=stream`);
    assert.equal(stream.headers.get("content-type"), "text/event-stream");
    assert.equal(await stream.text(), "data: first\n\ndata: last\n\n");
  } finally {
    if (previous === undefined) delete process.env.API_URL; else process.env.API_URL = previous;
    await Promise.all([frontend, backend].map((s) => new Promise((resolve) => s.close(resolve))));
  }
});
