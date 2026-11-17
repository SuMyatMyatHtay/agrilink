import { User } from "../users/model.js";
import { Requirement } from "../requirements/model.js";
import { AllocationApplication } from "./models.js";
import { reputation } from "./service.js";
import { HttpError } from "../../lib/http.js";
import { expectedYield, committedTons } from "../farmers/service.js";

export async function candidates(requirementId) {
  const apps = await AllocationApplication.find({ requirement: requirementId, status: "pending" }).sort({ createdAt: 1 }).lean();
  const ranked = [];
  for (const app of apps) {
    const user = await User.findById(app.farmer);
    if (!user?.farm) continue;
    const [rating, committed] = await Promise.all([reputation(user._id), committedTons(user._id)]);
    const free = Math.max(0, expectedYield(user.farm).gradeATons - committed);
    ranked.push({ ...app, name: user.name, fpo: user.farm.fpo || user.farm.village, rating, freeTons: +free.toFixed(1), eligible: free >= app.tons });
  }
  ranked.sort((a, b) => b.rating.score - a.rating.score || b.rating.count - a.rating.count || new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));
  const awards = await AllocationApplication.countDocuments({ requirement: requirementId, status: "awarded" });
  const newcomerTurn = (awards + 1) % 5 === 0;
  const chosen = ranked.find(x => x.eligible && (!newcomerTurn || x.rating.newcomer)) || ranked.find(x => x.eligible);
  return { candidates: ranked, recommended: chosen?._id || null, newcomerTurn,
    policy: "Verified-delivery ratings with a three-review prior of 3/5. Every fifth award prioritizes an eligible newcomer; ties use application time. Capacity and remaining quantity are checked again on award." };
}
export async function ownRequirement(id, userId) {
  const req = await Requirement.findOne({ _id: id, buyer: userId });
  if (!req) throw new HttpError(404, "Requirement not found", "not_found");
  return req;
}
