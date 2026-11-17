import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { HttpError } from "../../lib/http.js";
import { User } from "../users/model.js";
import { m2Id } from "../module2/handoff.js";
import { PilotDeal, PhotoReview, TrainingExample, VisionModel, DeliveryRating } from "./models.js";

export const digest = data => createHash("sha256").update(data).digest("hex");
export const dealKey = a => `${a.agreementId}:v${a.version}`;
export const money = n => Math.round(n * 100) / 100;
export function signed(a) {
  if (!a.documents.some(d => d.version === a.version && d.kind === "signed") || !a.signers.every(s => s.status === "signed"))
    throw new HttpError(409, "Complete all required signatures first", "signatures_required");
}
export async function canReview(a, auth) {
  if (auth.role !== "operations") return false;
  const user = await User.findById(auth.id);
  const fpo = a.signers.find(s => s.role === "witness")?.fpoId || m2Id.fpo({ fpo: a.parties.seller.fpo, village: a.parties.seller.village });
  return !!user && (user.officerFpoId === fpo || user.m2Role === "admin" ||
    (user.m2Role === "doctor" && user.m2Actor === `DOC-${fpo}`));
}
export async function pilotDeal(a) {
  try { return await PilotDeal.findOneAndUpdate({ _id: dealKey(a) }, { $setOnInsert: { version: a.version } }, { upsert: true, new: true, setDefaultsOnInsert: true }); }
  catch (error) { if (error.code === 11000) return PilotDeal.findById(dealKey(a)); throw error; }
}
export async function mutateDeal(a, auth, action, body = {}) {
  signed(a);
  const reviewer = await canReview(a, auth);
  const buyer = String(a.buyer) === auth.id, farmer = String(a.farmer) === auth.id;
  const can = allowed => { if (!allowed) throw new HttpError(403, "This action belongs to another participant", "forbidden"); };
  const allowedActions = { fund: buyer, advance: buyer, ship: farmer || reviewer, receive: buyer, release: buyer, dispute: buyer,
    resolve_release: reviewer, resolve_refund: reviewer };
  can(allowedActions[action]);
  let result;
  await (await import("mongoose")).default.connection.transaction(async session => {
    const deal = await PilotDeal.findById(dealKey(a)).session(session);
    if (!deal) throw new HttpError(409, "Refresh the delivery workspace first", "refresh_required");
    const e = deal.escrow, d = deal.delivery, total = money(a.terms.totalValueUsd);
    const need = condition => { if (!condition) throw new HttpError(409, "This step is not available in the current workflow state", "invalid_state"); };
    const log = (step, amount = 0) => e.ledger.push({ at: new Date(), step, amount: money(amount), actor: auth.id, simulated: true });
    if (action === "fund") { need(e.status === "unfunded"); e.deposited = total; e.held = total; e.status = "funded"; log("Simulated buyer deposit — no money moved", total); }
    if (action === "advance") { need(e.status === "funded"); const advance = money(total / 2); e.held = money(e.held - advance); e.paid = advance; e.status = "advance_released"; log("Simulated 50% advance released to FPO", advance); }
    if (action === "ship") {
      need(e.status === "advance_released" && d.status === "not_dispatched");
      const review = await PhotoReview.findOne({ agreementId: a.agreementId, version: a.version }).sort({ createdAt: -1, _id: -1 }).session(session);
      need(!!review && review.status === "confirmed" && (a.terms.grade === "A" ? review.grade === "A" : ["A", "B"].includes(review.grade)));
      const kg = Number(body.kg); need(Number.isFinite(kg) && kg > 0 && kg <= a.terms.quantityTons * 1000);
      Object.assign(d, { status: "dispatched", shippedKg: kg, dispatchedAt: new Date(), qualityReview: String(review._id), simulatedQuality: review.simulated });
      log("Shipment recorded; funds remain held");
    }
    if (action === "receive") { need(d.status === "dispatched" && e.status === "advance_released"); d.status = "received"; d.receivedAt = new Date(); e.status = "received"; log("Buyer recorded receipt; awaiting acceptance"); }
    if (action === "dispute") { need(e.status === "received" && String(body.note || "").trim().length >= 5); e.status = "disputed"; e.dispute = String(body.note).slice(0, 500); log("Dispute opened — remaining funds frozen"); }
    if (action === "release" || action === "resolve_release") {
      need(action === "release" ? e.status === "received" : e.status === "disputed");
      const payable = money(total * d.shippedKg / (a.terms.quantityTons * 1000));
      const due = Math.min(e.held, Math.max(0, money(payable - e.paid)));
      const refund = money(e.held - due);
      e.paid = money(e.paid + due); e.refunded = refund; e.held = 0; e.status = "released";
      e.advanceExcessOwed = Math.max(0, money(e.paid - payable));
      d.status = "accepted"; d.completedAt = new Date(); log("Simulated settlement for shipped kilograms", due);
      if (refund) log("Simulated unused balance refunded to buyer", refund);
    }
    if (action === "resolve_refund") { need(e.status === "disputed"); const refund = e.held; e.refunded = money(e.refunded + refund); e.held = 0; e.status = "refunded"; d.status = "resolved_refund"; d.completedAt = new Date(); log("FPO review: simulated remaining funds refunded", refund); }
    need(money(e.paid + e.held + e.refunded) === money(e.deposited));
    deal.markModified("escrow"); deal.markModified("delivery"); await deal.save({ session }); result = deal;
  });
  return result;
}

export async function retrain(crop) {
  try { await VisionModel.updateOne({ _id: crop }, { $setOnInsert: { revision: 0, examples: 0 } }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  let result;
  await mongoose.connection.transaction(async session => {
    // Serialize rebuilds so an older training snapshot cannot replace a newer one.
    const model = await VisionModel.findOneAndUpdate({ _id: crop }, { $inc: { revision: 1 } }, { new: true, session });
    const examples = await TrainingExample.find({ crop }).session(session).lean(), groups = {};
    for (const x of examples) { (groups[x.grade] ||= []).push(x.features); }
    model.centroids = Object.fromEntries(Object.entries(groups).map(([grade, rows]) => [grade,
      rows[0].map((_, i) => rows.reduce((sum, row) => sum + row[i], 0) / rows.length)]));
    model.examples = examples.length; model.trainedAt = new Date(); await model.save({ session }); result = model;
  });
  return result;
}
export const vector = analysis => [analysis.defect_pct / 100, analysis.colour_score];
export function predict(model, features) {
  if (!model || model.examples < 4 || Object.keys(model.centroids || {}).length < 2) return null;
  return Object.entries(model.centroids).map(([grade, values]) => ({ grade, distance: Math.hypot(...values.map((v, i) => v - features[i])) })).sort((a, b) => a.distance - b.distance)[0];
}
export async function reputation(userId) {
  const ratings = await DeliveryRating.find({ to: userId }).lean();
  const score = (ratings.reduce((sum, r) => sum + r.score, 0) + 3 * 3) / (ratings.length + 3);
  return { score: +score.toFixed(2), count: ratings.length, newcomer: ratings.length === 0 };
}
