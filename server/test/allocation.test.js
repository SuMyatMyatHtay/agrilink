import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { User } from "../src/modules/users/model.js";
import { Requirement } from "../src/modules/requirements/model.js";
import { Bond } from "../src/modules/bonds/model.js";
import { Agreement, AgreementCounter } from "../src/modules/contracts/model.js";
import { claimRequirement, releaseClaim, activateClaim, migrateReservations, availableTons } from "../src/modules/bonds/allocation.js";
import { createNotifier } from "../src/modules/notifications/notifier.js";
import { bridgeNotifications } from "../src/modules/messaging/bridge.js";
import { createMessenger } from "../src/modules/messaging/service.js";
import { MessageLog } from "../src/modules/messaging/model.js";
import { Notification } from "../src/modules/notifications/model.js";
import { createApp } from "../src/app.js";
import { signToken } from "../src/middleware/auth.js";
import { env } from "../src/config/env.js";
import { createHash } from "node:crypto";
import { m2Id } from "../src/modules/module2/handoff.js";

test("FCFS: concurrent demand/capacity limits, releases, activation, rollback, legacy migration and WhatsApp bridge", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  try {
    await mongoose.connect(mongo.getUri("allocation_isolated"));
    await Promise.all([User.init(), Requirement.init(), Bond.init(), Agreement.init(), AgreementCounter.init()]);
    const buyer = await User.create({ mobile: "6500000088", role: "buyer", company: "Allocation Test" });
    const farm = { village: "Devgad", district: "Sindhudurg", acres: 10, trees: 1000, age: 15, irrigation: "drip" };
    const farmers = await User.create([1, 2, 3].map((n) => ({ mobile: `980000000${n}`, name: `Farmer ${n}`, role: "farmer", farm })));
    const officer = await User.create({ mobile: "9000000099", name: "Assigned FPO officer", role: "operations", officerFpoId: m2Id.fpo(farm) });
    await User.updateMany({ _id: { $in: farmers.map(f => f._id) } }, { $set: { fpoOfficer: officer._id } });
    const makeRequirement = (extra = {}) => Requirement.create({ buyer: buyer._id, buyerName: buyer.company, grade: "A", tons: 5, priceUsd: 5, deliverBy: new Date(Date.now() + 86400000 * 30), ...extra });
    const r = await makeRequirement();
    const results = await Promise.allSettled(farmers.slice(0, 2).map((f) => claimRequirement(f._id, r._id, 4)));
    assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(results.find((x) => x.status === "rejected").reason.code, "exceeds_need");
    assert.equal(await Bond.countDocuments(), 1);
    assert.equal(availableTons(await Requirement.findById(r._id)), 1);
    const last = await claimRequirement(farmers[2]._id, r._id, 1);
    assert.equal(availableTons(await Requirement.findById(r._id)), 0);
    const winner = results.find((x) => x.status === "fulfilled").value;
    await releaseClaim(winner.bond._id, { remove: true });
    assert.equal(availableTons(await Requirement.findById(r._id)), 4);
    assert.equal((await Agreement.findById(winner.agreement._id)).status, "cancelled");
    await activateClaim(last.bond._id);
    await activateClaim(last.bond._id);
    const active = await Requirement.findById(r._id);
    assert.equal(active.filled, 1); assert.equal(active.reserved, 0);
    const small = await User.create({ mobile: "9800000099", name: "Small farm", role: "farmer", farm: { ...farm, trees: 100 } });
    const [r2, r3] = await Promise.all([makeRequirement(), makeRequirement()]);
    const capacity = await Promise.allSettled([r2, r3].map((req) => claimRequirement(small._id, req._id, 2)));
    assert.equal(capacity.filter((x) => x.status === "fulfilled").length, 1);
    assert.equal(capacity.find((x) => x.status === "rejected").reason.code, "exceeds_capacity");
    const separate = await Promise.all([makeRequirement(), makeRequirement()]);
    const parallel = await Promise.all(separate.map((req, i) => claimRequirement(farmers[i]._id, req._id, 1)));
    assert.notEqual(parallel[0].agreement.agreementId, parallel[1].agreement.agreementId);
    const broken = await makeRequirement({ buyer: new mongoose.Types.ObjectId() });
    await assert.rejects(claimRequirement(farmers[0]._id, broken._id, 1));
    assert.equal((await Requirement.findById(broken._id)).reserved, 0);
    assert.equal(await Bond.countDocuments({ requirement: broken._id }), 0);
    const legacy = await makeRequirement();
    await Requirement.collection.updateOne({ _id: legacy._id }, { $unset: { reserved: "" } });
    const old = await Bond.create({ requirement: legacy._id, buyer: buyer._id, farmer: farmers[0]._id, tons: 2 });
    await migrateReservations();
    assert.equal((await Requirement.findById(legacy._id)).reserved, 2);
    assert.equal((await Bond.findById(old._id)).reservationHeld, true);
    const notifier = createNotifier();
    let resolveDelivery;
    const delivery = new Promise((resolve) => { resolveDelivery = resolve; });
    bridgeNotifications(notifier, { dispatch: async (user, key, params) => { resolveDelivery({ key, params }); } });
    await notifier.toUsers([farmers[0]._id], "req_new", { reqId: String(r2._id), buyer: buyer.company, grade: "A", tons: 5, offerUsd: 5 });
    const forwarded = await delivery;
    assert.equal(forwarded.key, "new_requirement");
    assert.ok(forwarded.params.url.includes(`/farmer/offers?requirement=${r2._id}`));
    const messenger = createMessenger({ mode: "simulated" });
    await messenger.dispatch(farmers[0], forwarded.key, forwarded.params, { dedupeKey: "test-new-requirement", source: { kind: "test", ref: "fcfs" } });
    assert.equal((await MessageLog.findOne({ template: "new_requirement" })).status, "simulated");
    // Full signatures fill the request even when optional blockchain is offline.
    const files = new Map();
    const store = { async putOnce(key, bytes) { if (files.has(key)) throw new Error("exists"); files.set(key, bytes); return { key, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; }, async get(key) { return files.get(key); } };
    const server = createApp({ noMessageBridge: true, contractDeps: { store, handoff: async () => ({ status: "skipped", reason: "isolated-test" }), chain: { async register() { throw new Error("Blockchain disabled"); } } } }).listen(0);
    try {
      await new Promise((resolve) => server.listening ? resolve() : server.once("listening", resolve));
      const api = async (path, user, body = {}) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${signToken(user)}` }, body: JSON.stringify(body) });
        const data = await response.json();
        assert.equal(response.status, 200, JSON.stringify(data));
        return data;
      };
      const notifications = async (user) => {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notifications`, { headers: { authorization: `Bearer ${signToken(user)}` } });
        assert.equal(response.status, 200);
        return response.json();
      };
      await notifier.toUsers([farmers[1]._id], "req_new", { reqId: String(r2._id), buyer: buyer.company });
      await Notification.insertMany(Array.from({ length: 35 }, () => ({ user: farmers[0]._id, type: "bond_new" })));
      assert.ok((await notifications(farmers[0])).unseenRequestIds.includes(String(r2._id))); // Independent of the latest 30 bell items.
      await api("/notifications/read-all", farmers[0]);
      assert.ok((await notifications(farmers[0])).unseenRequestIds.includes(String(r2._id))); // Clearing the bell does not mean viewing an offer.
      await api("/notifications/requests/viewed", farmers[0], { requestIds: [String(r2._id)] });
      assert.ok(!(await notifications(farmers[0])).unseenRequestIds.includes(String(r2._id)));
      assert.ok((await notifications(farmers[1])).unseenRequestIds.includes(String(r2._id))); // Other farmers are unaffected.
      await notifier.toUsers([farmers[0]._id], "req_new", { reqId: String(r3._id), buyer: buyer.company });
      assert.ok((await notifications(farmers[0])).unseenRequestIds.includes(String(r3._id)));
      const signingReq = await makeRequirement();
      const signing = await claimRequirement(farmers[0]._id, signingReq._id, 1);
      const prefix = `/contracts/${signing.agreement.agreementId}`;
      await api(`${prefix}/send`, buyer);
      for (const user of [buyer, farmers[0], officer]) {
        await api(`${prefix}/sign/start`, user);
        await api(`${prefix}/sign/verify`, user, { otp: env.devOtp });
        await api(`${prefix}/sign`, user, { type: "typed", typedName: user.name || user.company, consent: true });
      }
      assert.equal((await Agreement.findById(signing.agreement._id)).status, "signed");
      assert.equal((await Requirement.findById(signingReq._id)).filled, 1);
      assert.equal((await Requirement.findById(signingReq._id)).reserved, 0);
      assert.equal((await Bond.findById(signing.bond._id)).status, "active");
      const declinedReq = await makeRequirement();
      const declined = await claimRequirement(farmers[0]._id, declinedReq._id, 1);
      const declinedPrefix = `/contracts/${declined.agreement.agreementId}`;
      await api(`${declinedPrefix}/send`, buyer);
      await api(`${declinedPrefix}/decline`, buyer, { reason: "Cannot proceed" });
      assert.equal((await Requirement.findById(declinedReq._id)).reserved, 0);
      assert.equal((await Bond.findById(declined.bond._id)).status, "cancelled");
    } finally { await new Promise((resolve) => server.close(resolve)); }
  } finally { await mongoose.disconnect(); await mongo.stop(); }
});
