import { User } from "./modules/users/model.js";
import { Requirement } from "./modules/requirements/model.js";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { env } from "./config/env.js";

const BUYERS = [
  { mobile: "6500000001", company: "FairPrice Fresh (Singapore)", grade: "A", tons: 20, priceUsd: 5.0, deliverBy: "2026-05-05", escalation: { enabled: true, pct: 8 }, filled: 6 },
  { mobile: "6500000002", company: "Mustafa Centre Imports", grade: "A", tons: 12, priceUsd: 6.2, deliverBy: "2026-05-12", escalation: { enabled: false, pct: 0 }, filled: 9 },
  { mobile: "6500000003", company: "Sheng Siong Wholesale", grade: "B", tons: 35, priceUsd: 3.4, deliverBy: "2026-04-28", escalation: { enabled: true, pct: 5 }, filled: 10 },
  { mobile: "6500000004", company: "Little India Traders", grade: "A", tons: 8, priceUsd: 4.1, deliverBy: "2026-05-20", escalation: { enabled: false, pct: 0 }, filled: 0 },
];

/** Idempotent: only seeds when there are no requirements yet. */
export async function seedIfEmpty() {
  if (await Requirement.countDocuments()) return false;
  // Clearly fictional sample farmer; never overwrite an existing profile.
  await User.updateOne({ mobile: "9888888801" }, { $setOnInsert: {
    mobile: "9888888801", role: "farmer", name: "Demo Mango Farmer", lang: "en",
    farm: { village: "Devgad", district: "Sindhudurg", acres: 5, trees: 300, age: 15, irrigation: "drip", variety: "Alphonso" },
  } }, { upsert: true });
  for (const { mobile, company, ...r } of BUYERS) {
    const buyer = await User.findOneAndUpdate({ mobile }, { mobile, role: "buyer", company, name: company }, { upsert: true, new: true });
    const deliverBy = new Date(Date.now() + (30 + BUYERS.findIndex((b) => b.mobile === mobile) * 7) * 86400000);
    await Requirement.create({ ...r, deliverBy, filled: 0, buyer: buyer._id, buyerName: company });
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await mongoose.connect(env.mongo);
    console.log(await seedIfEmpty() ? "Seeded demo buyer requirements" : "Existing requirements retained");
  } finally {
    await mongoose.disconnect();
  }
}
