import { User } from "../users/model.js";
import { HttpError } from "../../lib/http.js";
import { m2Id } from "../module2/handoff.js";

export const signerFor = (a, auth) => a.signers.find(s => String(s.user) === String(auth.id) &&
  (s.role === auth.role || (s.role === "witness" && auth.role === "operations")));
export const witnessReady = a => a.signers.filter(s => s.role !== "witness").every(s => s.status === "signed");

export function requireSigner(a, auth) {
  const s = signerFor(a, auth);
  if (!s) throw new HttpError(403, "You are not an assigned signatory", "not_signer");
  if (s.role === "witness" && !witnessReady(a)) throw new HttpError(409, "The buyer and farmer must sign before the FPO witness", "awaiting_parties");
  return s;
}

export async function attachWitness(a) {
  const farmer = await User.findById(a.farmer);
  const officer = farmer?.fpoOfficer && await User.findById(farmer.fpoOfficer);
  const fpoId = farmer?.farm && m2Id.fpo(farmer.farm);
  if (farmer?.farm?.fpo && farmer.farm.fpo !== a.parties.seller.fpo) {
    throw new HttpError(409, "The farmer's FPO changed after this draft was created. Release this draft and create a new agreement with the current affiliation.", "fpo_changed");
  }
  if (!officer || officer.role !== "operations" || officer.officerFpoId !== fpoId ||
      [String(a.buyer), String(a.farmer)].includes(String(officer._id))) {
    throw new HttpError(409, "Assign an FPO officer for this farmer in Operations → Farmers before sending for signature", "fpo_officer_required");
  }
  // Freeze the responsible account and affiliation for this document version.
  a.signers = a.signers.filter(s => s.role !== "witness");
  a.signers.push({ role: "witness", user: officer._id, name: officer.name || "FPO officer", organisation: a.parties.seller.fpo,
    fpoId, maskedMobile: `${officer.mobile.slice(0, 2)}XXXXXX${officer.mobile.slice(-2)}`, status: "pending" });
}
