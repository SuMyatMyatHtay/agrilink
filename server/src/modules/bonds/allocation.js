import mongoose from "mongoose";
import { User } from "../users/model.js";
import { Requirement } from "../requirements/model.js";
import { Bond } from "./model.js";
import { Agreement, AgreementCounter } from "../contracts/model.js";
import { expectedYield, committedTons } from "../farmers/service.js";
import { createFromBond } from "../contracts/service.js";
import { HttpError } from "../../lib/http.js";
import { AllocationApplication, DeliveryRating } from "../pilot/models.js";

export const availableTons = (r) => Math.max(0, +(r.tons - r.filled - (r.reserved || 0)).toFixed(1));

// Run at startup for data created before reservations existed. Existing data is retained.
export async function migrateReservations() {
  await Promise.all([AgreementCounter.init(), AllocationApplication.init(), DeliveryRating.init()]);
  const legacy = await Requirement.find({ reserved: { $exists: false } }).select("_id").lean();
  for (const r of legacy) await mongoose.connection.transaction(async (session) => {
    const claims = await Bond.find({ requirement: r._id, status: { $nin: ["active", "cancelled"] } }).session(session);
    await Requirement.updateOne({ _id: r._id, reserved: { $exists: false } }, { $set: { reserved: claims.reduce((n, b) => n + b.tons, 0) } }, { session });
    await Bond.updateMany({ _id: { $in: claims.map((b) => b._id) } }, { $set: { reservationHeld: true } }, { session });
  });
}

export async function claimRequirement(farmerId, requirementId, tons, { applicationId } = {}) {
  let result;
  for (let attempt = 0; ; attempt++) {
    try {
      await mongoose.connection.transaction(async (session) => {
        const policy = await Requirement.findById(requirementId).session(session);
        if (policy?.allocationMode === "rating") {
          if (!applicationId) throw new HttpError(409, "Apply to this rated request; the buyer awards it using delivery ratings", "application_required");
          const app = await AllocationApplication.findOneAndUpdate({ _id: applicationId, requirement: requirementId, farmer: farmerId, tons, status: "pending" }, { $set: { status: "awarded" } }, { new: true, session });
          if (!app) throw new HttpError(409, "This application has already been awarded or is unavailable", "application_unavailable");
        } else if (applicationId) throw new HttpError(409, "The allocation policy changed", "policy_changed");
        // Serialize claims from the same farmer, even against different requirements.
        const farmer = await User.findOneAndUpdate({ _id: farmerId, role: "farmer" }, { $inc: { allocationVersion: 1 } }, { new: true, session });
        if (!farmer?.farm) throw new HttpError(409, "Complete your farm profile first", "needs_onboarding");
        const free = Math.max(0, expectedYield(farmer.farm).gradeATons - await committedTons(farmer._id, session));
        if (tons > free) throw new HttpError(400, `Only ${free.toFixed(1)} t of your capacity is free`, "exceeds_capacity");
        const reqt = await Requirement.findOneAndUpdate({ _id: requirementId, $expr: {
          $gte: [{ $subtract: ["$tons", { $add: ["$filled", { $ifNull: ["$reserved", 0] }] }] }, tons],
        } }, { $inc: { reserved: tons, interested: applicationId ? 0 : 1 } }, { new: true, session });
        if (!reqt) throw new HttpError(409, "This quantity has already been claimed. Refresh to see what is still available.", "exceeds_need");
        const [bond] = await Bond.create([{
          requirement: reqt._id, buyer: reqt.buyer, farmer: farmer._id, buyerName: reqt.buyerName,
          farmerName: `${farmer.name} · ${farmer.farm.village}`, grade: reqt.grade, tons,
          priceUsd: reqt.priceUsd, deliverBy: reqt.deliverBy, escalation: reqt.escalation, reservationHeld: true,
        }], { session });
        const agreement = await createFromBond(bond._id, session);
        if (applicationId) await AllocationApplication.updateOne({ _id: applicationId }, { $set: { agreementId: agreement.agreementId } }, { session });
        result = { bond, agreement };
      });
      return result;
    } catch (error) {
      // An initial concurrent sequence upsert can lose an _id race. The transaction
      // rolled back completely; retry against the now-created counter.
      if (error.code === 11000 && attempt < 2) continue;
      throw error;
    }
  }
}

export async function activateClaim(bondId) {
  await mongoose.connection.transaction(async (session) => {
    const b = await Bond.findById(bondId).session(session);
    if (!b || b.status === "active") return;
    if (b.status === "cancelled") throw new HttpError(409, "This claim was released", "claim_released");
    await Requirement.updateOne({ _id: b.requirement }, { $inc: { filled: b.tons, reserved: b.reservationHeld ? -b.tons : 0 } }, { session });
    b.status = "active"; b.reservationHeld = false;
    await b.save({ session });
  });
}

export async function resizeClaim(bondId, tons) {
  await mongoose.connection.transaction(async (session) => {
    const b = await Bond.findById(bondId).session(session);
    if (!b || b.tons === tons) return;
    if (!b.reservationHeld || b.status !== "draft") throw new HttpError(409, "Quantity cannot change after signing or releasing a claim", "locked");
    const farmer = await User.findOneAndUpdate({ _id: b.farmer }, { $inc: { allocationVersion: 1 } }, { new: true, session });
    const delta = +(tons - b.tons).toFixed(1);
    if (delta > 0 && delta > expectedYield(farmer.farm).gradeATons - await committedTons(farmer._id, session)) throw new HttpError(409, "Insufficient farmer capacity for this change", "exceeds_capacity");
    const updated = await Requirement.updateOne({ _id: b.requirement, $expr: { $gte: [{ $subtract: ["$tons", { $add: ["$filled", { $ifNull: ["$reserved", 0] }] }] }, delta] } }, { $inc: { reserved: delta } }, { session });
    if (!updated.matchedCount) throw new HttpError(409, "That quantity is no longer available", "exceeds_need");
    b.tons = tons; await b.save({ session });
  });
}

export async function releaseClaim(bondId, { remove = false } = {}) {
  await mongoose.connection.transaction(async (session) => {
    const b = await Bond.findById(bondId).session(session);
    if (!b) return;
    if (b.status === "active") throw new HttpError(409, "Cannot release an active agreement", "locked");
    if (remove && await Agreement.exists({ bond: b._id, "signers.status": "signed" }).session(session)) throw new HttpError(409, "A party has already signed. Use the agreement's decline workflow if you have not signed.", "locked");
    if (b.reservationHeld) await Requirement.updateOne({ _id: b.requirement }, { $inc: { reserved: -b.tons } }, { session });
    if (remove) await b.deleteOne({ session });
    else { b.reservationHeld = false; b.status = "cancelled"; await b.save({ session }); }
    await Agreement.updateMany({ bond: b._id, status: { $in: ["draft", "pending_signature"] } }, { $set: { status: "cancelled" } }, { session });
  });
}
