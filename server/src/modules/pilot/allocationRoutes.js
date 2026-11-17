import { Router } from "express";
import { z } from "zod";
import { wrap, HttpError } from "../../lib/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { Requirement } from "../requirements/model.js";
import { User } from "../users/model.js";
import { AllocationApplication } from "./models.js";
import { candidates, ownRequirement } from "./allocation.js";
import { claimRequirement, availableTons } from "../bonds/allocation.js";
import mongoose from "mongoose";
export default function allocationModule({ notifier }) {
  const r = Router(); r.use(requireAuth());
  const notify = async (...args) => { try { await notifier.toUsers(...args); } catch { console.warn("Allocation saved; notification unavailable"); } };
  r.post("/:id/apply", requireAuth("farmer"), wrap(async (req, res) => {
    const { tons } = z.object({ tons: z.number().positive().multipleOf(0.1).max(10000) }).parse(req.body);
    const requirement = await Requirement.findById(req.params.id);
    const farmer = await User.findById(req.auth.id);
    if (!farmer?.farm) throw new HttpError(409, "Complete onboarding first", "needs_onboarding");
    if (!requirement || requirement.allocationMode !== "rating" || tons > availableTons(requirement)) throw new HttpError(409, "This rated request is unavailable for this quantity", "request_unavailable");
    try {
      let application;
      await mongoose.connection.transaction(async session => {
        [application] = await AllocationApplication.create([{ requirement: requirement._id, farmer: req.auth.id, tons }], { session });
        await Requirement.updateOne({ _id: requirement._id }, { $inc: { interested: 1 } }, { session });
      });
      await notify([requirement.buyer], "allocation_application", { reqId: String(requirement._id), farmer: farmer.name });
      res.status(201).json(application);
    } catch (error) { if (error.code === 11000) throw new HttpError(409, "You already applied to this request", "already_applied"); throw error; }
  }));
  r.get("/:id", requireAuth("buyer"), wrap(async (req, res) => {
    const requirement = await ownRequirement(req.params.id, req.auth.id);
    const result = await candidates(requirement._id);
    const remaining = availableTons(requirement);
    result.candidates.forEach(c => { c.eligible = c.eligible && c.tons <= remaining; });
    const eligible = result.candidates.filter(c => c.eligible);
    result.recommended = (result.newcomerTurn ? eligible.find(c => c.rating.newcomer) : null)?._id || eligible[0]?._id || null;
    res.json(result);
  }));
  r.post("/:id/award", requireAuth("buyer"), wrap(async (req, res) => {
    const requirement = await ownRequirement(req.params.id, req.auth.id);
    if (requirement.allocationMode !== "rating") throw new HttpError(409, "This request uses first come, first served", "not_rated");
    const ranking = await candidates(requirement._id);
    const eligible = ranking.candidates.filter(c => c.eligible && c.tons <= availableTons(requirement));
    const best = (ranking.newcomerTurn && eligible.find(c => c.rating.newcomer)) || eligible[0];
    if (!best) throw new HttpError(409, "No eligible applicants with sufficient capacity", "no_candidate");
    const out = await claimRequirement(best.farmer, requirement._id, best.tons, { applicationId: best._id });
    await notify([best.farmer, requirement.buyer], "allocation_awarded", { agreementId: out.agreement.agreementId });
    notifier.changed("requirements", "bonds", "contracts"); res.json({ agreementId: out.agreement.agreementId, application: best._id });
  }));
  return { path: "/allocation", router: r };
}
