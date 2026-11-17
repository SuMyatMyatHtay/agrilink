import { Router } from "express";
import { z } from "zod";
import { wrap, HttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { loadFor } from "../contracts/service.js";
import { env } from "../../config/env.js";
import { User } from "../users/model.js";
import { PilotDeal, PhotoReview, TrainingExample, VisionModel, DeliveryRating, DemoAnchor } from "./models.js";
import { signed, pilotDeal, mutateDeal, canReview, vector, predict, retrain, digest, dealKey } from "./service.js";

export default function pilotModule({ notifier, visionAnalyze } = {}) {
  const r = Router(); r.use(requireAuth());
  const notify = async (...args) => { try { await notifier?.toUsers(...args); } catch { console.warn("Pilot update saved; notification unavailable"); } };
  const load = req => loadFor(req.params.id, req.auth, { read: true });
  r.get("/:id", wrap(async (req, res) => {
    const a = await load(req);
    const [deal, photos, ratings, model, proof, reviewer] = await Promise.all([
      pilotDeal(a), PhotoReview.find({ agreementId: a.agreementId, version: a.version }).select("-image").sort({ createdAt: -1 }),
      DeliveryRating.find({ agreementId: a.agreementId, version: a.version }), VisionModel.findById(a.terms.variety || "Alphonso"),
      DemoAnchor.findById(dealKey(a)), canReview(a, req.auth),
    ]);
    res.json({ agreement: { id: a.agreementId, version: a.version, total: a.terms.totalValueUsd, kg: a.terms.quantityTons * 1000,
      buyer: a.parties.buyer.company, farmer: a.parties.seller.farmerName, grade: a.terms.grade, crop: a.terms.variety,
      signed: a.signers.every(s => s.status === "signed") && a.documents.some(d => d.kind === "signed" && d.version === a.version), chain: a.chain },
      permissions: { buyer: String(a.buyer) === req.auth.id, farmer: String(a.farmer) === req.auth.id, reviewer },
      deal, photos, ratings, model: model ? { revision: model.revision, examples: model.examples, trainedAt: model.trainedAt,
        classes: Object.keys(model.centroids || {}), ready: model.examples >= 4 && Object.keys(model.centroids || {}).length >= 2 } : null,
      proof, simulation: "Escrow is a demonstration ledger. No money moves. Photo simulations are labelled and excluded from training." });
  }));
  r.post("/:id/escrow/:action", wrap(async (req, res) => {
    const a = await load(req);
    const out = await mutateDeal(a, req.auth, req.params.action, req.body);
    await notify([a.buyer, a.farmer], "pilot_update", { agreementId: a.agreementId, event: req.params.action });
    notifier?.changed("contracts", "pilot"); res.json(out);
  }));
  r.post("/:id/quality", wrap(async (req, res) => {
    const a = await load(req);
    if (String(a.farmer) !== req.auth.id && !(await canReview(a, req.auth))) throw new HttpError(403, "Farmer or assigned quality reviewer only", "forbidden");
    const body = z.object({ sample: z.enum(["good", "poor"]).optional(), image: z.string().max(1500000).optional() }).parse(req.body);
    let analysis, image = null;
    if (body.sample) analysis = { grade_hint: body.sample === "good" ? "A" : "REJECT", defect_pct: body.sample === "good" ? 2 : 24,
      colour_score: 0.82, confidence: 0.92, photos_used: 1, simulated: true, model: "illustrative-scenario", notes: ["Demonstration values, not analysis of an uploaded image."] };
    else {
      if (!body.image || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(body.image)) throw new HttpError(400, "Upload a JPEG, PNG or WebP photo", "photo_required");
      image = body.image;
      const bytes = Buffer.from(image.split(",")[1], "base64");
      const form = new FormData(); form.set("files", new Blob([bytes]), "fruit.jpg");
      try {
        if (visionAnalyze) analysis = await visionAnalyze(bytes);
        else {
          const response = await fetch(new URL("/vision/analyze", env.mlUrl), { method: "POST", body: form, signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error("vision_unavailable"); analysis = await response.json();
        }
      } catch { throw new HttpError(503, "Live photo analysis is unavailable. Retry or explicitly choose a labelled demo scenario.", "vision_unavailable"); }
      if (!Number.isFinite(analysis.defect_pct) || !Number.isFinite(analysis.colour_score)) throw new HttpError(502, "Invalid vision response", "vision_invalid");
      const model = await VisionModel.findById(a.terms.variety || "Alphonso");
      analysis.learned = predict(model, vector(analysis)); analysis.learningRevision = model?.revision || 0;
    }
    const photo = await PhotoReview.create({ agreementId: a.agreementId, version: a.version, farmer: a.farmer, image,
      imageHash: image ? digest(Buffer.from(image.split(",")[1], "base64")) : undefined,
      analysis, simulated: !!body.sample || analysis.simulated === true });
    const farmer = await User.findById(a.farmer).select("fpoOfficer");
    if (farmer?.fpoOfficer) await notify([farmer.fpoOfficer], "quality_review_ready", { agreementId: a.agreementId });
    res.status(201).json({ id: photo._id, analysis });
  }));
  r.post("/:id/quality/:photoId/review", wrap(async (req, res) => {
    const a = await load(req);
    if (!(await canReview(a, req.auth))) throw new HttpError(403, "Assigned FPO or farmer doctor review required", "forbidden");
    const body = z.object({ grade: z.enum(["A", "B", "REJECT"]), note: z.string().min(5).max(500) }).parse(req.body);
    const photo = await PhotoReview.findOneAndUpdate({ _id: req.params.photoId, agreementId: a.agreementId, version: a.version, status: "pending_review" },
      { $set: { status: "confirmed", grade: body.grade, note: body.note, reviewedBy: req.auth.id, reviewedAt: new Date() } }, { new: true });
    if (!photo) throw new HttpError(409, "This assessment was already reviewed or is unavailable", "already_reviewed");
    let model = null;
    if (!photo.simulated && photo.analysis.photos_used > 0 && photo.analysis.confidence >= 0.5) {
      const crop = a.terms.variety || "Alphonso";
      await TrainingExample.updateOne({ _id: `${crop}:${photo.imageHash}` }, { $set: { crop, features: vector(photo.analysis), grade: photo.grade,
        review: photo._id, confirmedBy: req.auth.id } }, { upsert: true });
      model = await retrain(crop);
    }
    const result = photo.toObject(); delete result.image;
    await notify([a.buyer, a.farmer], "pilot_update", { agreementId: a.agreementId, event: "quality_confirmed" });
    res.json({ photo: result, learning: model ? { revision: model.revision, examples: model.examples } : null });
  }));
  r.get("/:id/quality/:photoId/image", wrap(async (req, res) => {
    const a = await load(req); const photo = await PhotoReview.findOne({ _id: req.params.photoId, agreementId: a.agreementId, version: a.version });
    if (!photo?.image) throw new HttpError(404, "No uploaded image for this sample", "not_found");
    res.type(photo.image.slice(5, photo.image.indexOf(";"))).set("Cache-Control", "private, no-store").send(Buffer.from(photo.image.split(",")[1], "base64"));
  }));
  r.post("/:id/rating", wrap(async (req, res) => {
    const a = await load(req);
    const buyer = String(a.buyer) === req.auth.id, farmer = String(a.farmer) === req.auth.id;
    if (!buyer && !farmer) throw new HttpError(403, "Only the buyer and farmer can rate each other", "forbidden");
    const deal = await PilotDeal.findById(dealKey(a));
    if (!deal || !["released", "refunded"].includes(deal.escrow.status)) throw new HttpError(409, "Settle this delivery before rating", "delivery_not_complete");
    const body = z.object({ quality: z.number().int().min(1).max(5), reliability: z.number().int().min(1).max(5), communication: z.number().int().min(1).max(5), note: z.string().max(500).default("") }).parse(req.body);
    try { res.status(201).json(await DeliveryRating.create({ ...body, agreementId: a.agreementId, version: a.version, from: req.auth.id,
      to: buyer ? a.farmer : a.buyer, side: buyer ? "buyer" : "farmer", score: (body.quality + body.reliability + body.communication) / 3 })); }
    catch (error) { if (error.code === 11000) throw new HttpError(409, "You already rated this delivery", "already_rated"); throw error; }
  }));
  r.post("/:id/proof", wrap(async (req, res) => {
    const a = await load(req); signed(a);
    if (![String(a.buyer), String(a.farmer)].includes(req.auth.id) && !(await canReview(a, req.auth))) throw new HttpError(403, "Participant only", "forbidden");
    // Backfill preserved signed versions in order, so an amended agreement can
    // create its first demo proof without silently dropping the previous link.
    const versions = [...a.history, { version: a.version, documents: a.documents }].sort((x, y) => x.version - y.version);
    let previousHash = null;
    for (const version of versions) {
      const doc = version.documents.find(d => d.kind === "signed" && d.version === version.version);
      if (!doc) throw new HttpError(409, "A preserved signed version is missing its document", "missing_version_document");
      const key = `${a.agreementId}:v${version.version}`;
      const record = { agreementId: a.agreementId, version: version.version, docHash: doc.sha256, previousHash, recordedBy: req.auth.id };
      record.proofHash = digest(JSON.stringify([record.agreementId, record.version, record.docHash, record.previousHash]));
      try { await DemoAnchor.updateOne({ _id: key }, { $setOnInsert: record }, { upsert: true }); } catch (error) { if (error.code !== 11000) throw error; }
      const saved = await DemoAnchor.findById(key);
      if (saved.docHash !== record.docHash || saved.proofHash !== record.proofHash) throw new HttpError(409, "The preserved proof does not match this version", "proof_conflict");
      previousHash = saved.proofHash;
    }
    res.json({ mode: "demo_ledger", publicBlockchain: false, proof: await DemoAnchor.findById(dealKey(a)) });
  }));
  r.post("/:id/proof/verify", wrap(async (req, res) => {
    const a = await load(req); const { hash } = z.object({ hash: z.string().regex(/^[a-f\d]{64}$/i) }).parse(req.body);
    const proof = await DemoAnchor.findById(dealKey(a));
    const intact = !!proof && proof.proofHash === digest(JSON.stringify([proof.agreementId, proof.version, proof.docHash, proof.previousHash]));
    res.json({ mode: "demo_ledger", publicBlockchain: false, recorded: !!proof, proofIntact: intact, matches: intact && proof.docHash === hash.toLowerCase(), expected: proof?.docHash });
  }));
  return { path: "/pilot", router: r };
}
