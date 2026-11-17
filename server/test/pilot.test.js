import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/modules/users/model.js";
import { Agreement } from "../src/modules/contracts/model.js";
import { Requirement } from "../src/modules/requirements/model.js";
import { PilotDeal, TrainingExample, VisionModel, DeliveryRating, AllocationApplication } from "../src/modules/pilot/models.js";
import { createNotifier } from "../src/modules/notifications/notifier.js";
import { signToken } from "../src/middleware/auth.js";
import { digest, predict } from "../src/modules/pilot/service.js";
import { candidates } from "../src/modules/pilot/allocation.js";

test("pilot: quality review/retraining, escrow conservation/disputes, ratings, ranked allocation and demo integrity", async () => {
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } }); let server;
  try {
    await mongoose.connect(mongo.getUri("pilot_isolated"));
    await Promise.all([DeliveryRating.init(), AllocationApplication.init()]);
    const farm = { village: "Devgad", fpo: "Demo FPO", district: "Sindhudurg", acres: 10, trees: 1000, age: 15, irrigation: "drip" };
    const buyer = await User.create({ mobile: "6500110001", role: "buyer", name: "Pilot Buyer", company: "Pilot Buyer" });
    const farmer = await User.create({ mobile: "9800110001", role: "farmer", name: "Pilot Farmer", farm });
    const newcomer = await User.create({ mobile: "9800110002", role: "farmer", name: "New Farmer", farm });
    const officer = await User.create({ mobile: "9000110001", role: "operations", name: "Reviewer", m2Role: "admin" });
    const outsider = await User.create({ mobile: "6500110002", role: "buyer", name: "Outsider" });
    const wrongOfficer = await User.create({ mobile: "9000110002", role: "operations", name: "Unassigned officer", m2Role: "fpo", m2Actor: "OTHER-FPO" });
    const hash = digest(Buffer.from("signed pdf fixture"));
    const makeAgreement = (id, signed = true) => Agreement.create({ agreementId: id, buyer: buyer._id, farmer: farmer._id, status: signed ? "signed" : "draft",
      parties: { buyer: { company: "Pilot Buyer" }, seller: { farmerName: "Pilot Farmer", fpo: "Demo FPO" } },
      terms: { totalValueUsd: 5000, quantityTons: 1, grade: "A", variety: "Alphonso" },
      signers: [buyer, farmer, officer].map((u, i) => ({ role: ["buyer", "farmer", "witness"][i], user: u._id, name: u.name, status: signed ? "signed" : "pending" })),
      documents: signed ? [{ version: 1, kind: "signed", key: "fixture.pdf", sha256: hash }] : [] });
    const a = await makeAgreement("AGL-PILOT-1"), draft = await makeAgreement("AGL-PILOT-DRAFT", false);
    let calls = 0;
    server = createApp({ notifier: createNotifier(), visionAnalyze: async () => {
      calls++; return { model: "injected-live-adapter", simulated: false, defect_pct: calls % 2 ? 2 : 12, colour_score: calls % 2 ? 0.9 : 0.55,
        confidence: 0.9, photos_used: 1, grade_hint: calls % 2 ? "A" : "B", notes: ["Injected adapter for workflow testing"] };
    } }).listen(0);
    await new Promise(resolve => server.listening ? resolve() : server.once("listening", resolve));
    const call = async (path, user, body, method = body ? "POST" : "GET") => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { method, headers: { authorization: `Bearer ${signToken(user)}`, ...(body && { "content-type": "application/json" }) }, body: body && JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const base = `/pilot/${a.agreementId}`;
    assert.equal((await call(base, outsider)).status, 404);
    assert.equal((await call(`/pilot/${draft.agreementId}/escrow/fund`, buyer, {})).status, 409);
    assert.equal((await call(base, farmer)).status, 200);
    assert.equal((await call(`${base}/rating`, buyer, { quality: 5, reliability: 5, communication: 5 })).status, 409);
    const sample = (await call(`${base}/quality`, farmer, { sample: "good" })).body;
    assert.equal((await call(`${base}/quality/${sample.id}/review`, buyer, { grade: "A", note: "Reviewed sample" })).status, 403);
    assert.equal((await call(`${base}/quality/${sample.id}/review`, wrongOfficer, { grade: "A", note: "Wrong FPO review" })).status, 403);
    assert.equal((await call(`${base}/quality/${sample.id}/review`, officer, { grade: "A", note: "Illustrative sample confirmed" })).status, 200);
    assert.equal(await TrainingExample.countDocuments(), 0);
    for (let i = 0; i < 4; i++) {
      const photo = (await call(`${base}/quality`, farmer, { image: `data:image/png;base64,${Buffer.from(`injected image ${i}`).toString("base64")}` })).body;
      assert.equal((await call(`${base}/quality/${photo.id}/review`, officer, { grade: i % 2 ? "B" : "A", note: "Doctor confirmed test label" })).status, 200);
      assert.equal((await call(`${base}/quality/${photo.id}/review`, officer, { grade: "A", note: "Duplicate review" })).status, 409);
    }
    const model = await VisionModel.findById("Alphonso");
    assert.equal(model.examples, 4); assert.equal(model.revision, 4); assert.equal(predict(model, [0.02, 0.9]).grade, "A");
    assert.equal((await call(`${base}/escrow/fund`, farmer, {})).status, 403);
    assert.equal((await call(`${base}/escrow/fund`, buyer, {})).status, 200);
    assert.equal((await call(`${base}/escrow/fund`, buyer, {})).status, 409);
    assert.equal((await call(`${base}/escrow/advance`, buyer, {})).status, 200);
    assert.equal((await call(`${base}/escrow/ship`, farmer, { kg: 800 })).status, 409); // Latest assessment is B; older A cannot bypass it.
    const finalPhoto = (await call(`${base}/quality`, farmer, { sample: "good" })).body;
    await call(`${base}/quality/${finalPhoto.id}/review`, officer, { grade: "A", note: "Latest sample confirmed" });
    assert.equal((await call(`${base}/escrow/ship`, farmer, { kg: 800 })).status, 200);
    assert.equal((await call(`${base}/escrow/release`, buyer, {})).status, 409);
    assert.equal((await call(`${base}/escrow/receive`, buyer, {})).status, 200);
    assert.equal((await call(`${base}/escrow/dispute`, buyer, { note: "Some fruit arrived damaged" })).status, 200);
    assert.equal((await call(`${base}/escrow/release`, buyer, {})).status, 409);
    assert.equal((await call(`${base}/escrow/resolve_release`, wrongOfficer, {})).status, 403);
    assert.equal((await call(`${base}/escrow/resolve_release`, officer, {})).status, 200);
    const settled = await PilotDeal.findById(`${a.agreementId}:v1`);
    assert.equal(settled.escrow.paid, 4000); assert.equal(settled.escrow.refunded, 1000); assert.equal(settled.escrow.held, 0);
    assert.equal(settled.escrow.deposited, settled.escrow.paid + settled.escrow.held + settled.escrow.refunded);
    const rating = { quality: 5, reliability: 5, communication: 5, note: "Great verified demo delivery" };
    assert.equal((await call(`${base}/rating`, buyer, rating)).status, 201);
    assert.equal((await call(`${base}/rating`, buyer, rating)).status, 409);
    assert.equal((await call(`${base}/rating`, farmer, rating)).status, 201);
    assert.equal((await call(`${base}/proof`, buyer, {})).body.publicBlockchain, false);
    assert.equal((await call(`${base}/proof/verify`, farmer, { hash })).body.matches, true);
    assert.equal((await call(`${base}/proof/verify`, farmer, { hash: digest(Buffer.from("changed")) })).body.matches, false);

    const req = await Requirement.create({ buyer: buyer._id, buyerName: buyer.company, grade: "A", tons: 5, priceUsd: 5, deliverBy: new Date(Date.now() + 86400000 * 30), allocationMode: "rating" });
    assert.equal((await call("/bonds", farmer, { requirementId: String(req._id), tons: 1 })).body.error, "application_required");
    assert.equal((await call(`/allocation/${req._id}/apply`, newcomer, { tons: 1 })).status, 201);
    assert.equal((await call(`/allocation/${req._id}/apply`, farmer, { tons: 1 })).status, 201);
    const ranked = (await call(`/allocation/${req._id}`, buyer)).body;
    assert.equal(String(ranked.candidates[0].farmer), String(farmer._id));
    const results = await Promise.all([1, 2].map(() => call(`/allocation/${req._id}/award`, buyer, {})));
    assert.equal(results.filter(x => x.status === 200).length, 1);
    assert.equal((await Requirement.findById(req._id)).reserved, 1);
    assert.equal((await Requirement.findById(req._id)).interested, 2);
    assert.equal(await AllocationApplication.countDocuments({ requirement: req._id, status: "awarded" }), 1);
    assert.equal((await call(`/allocation/${req._id}`, outsider)).status, 404);
    await AllocationApplication.create([1, 2, 3].map(() => ({ requirement: req._id, farmer: new mongoose.Types.ObjectId(), tons: 0.1, status: "awarded" })));
    const fifth = await candidates(req._id);
    assert.equal(fifth.newcomerTurn, true); assert.equal(String(fifth.recommended), String(ranked.candidates.find(c => c.rating.newcomer)._id));
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect(); await mongo.stop();
  }
});
