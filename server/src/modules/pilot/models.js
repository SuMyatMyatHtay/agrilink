import mongoose from "mongoose";
const { ObjectId, Mixed } = mongoose.Schema.Types;
const model = (name, fields, options = {}) => mongoose.models[name] || mongoose.model(name, new mongoose.Schema(fields, { timestamps: true, ...options }));
export const PilotDeal = model("PilotDeal", {
  _id: String, version: Number,
  escrow: { type: Mixed, default: () => ({ status: "unfunded", deposited: 0, held: 0, paid: 0, refunded: 0, ledger: [] }) },
  delivery: { type: Mixed, default: () => ({ status: "not_dispatched" }) },
});
export const PhotoReview = model("PhotoReview", {
  agreementId: { type: String, index: true }, version: Number, farmer: ObjectId, image: String, imageHash: String,
  analysis: Mixed, simulated: Boolean, status: { type: String, default: "pending_review" },
  grade: String, reviewedBy: ObjectId, reviewedAt: Date, note: String,
});
export const TrainingExample = model("TrainingExample", { _id: String, crop: String, features: [Number], grade: String, review: ObjectId, confirmedBy: ObjectId });
export const VisionModel = model("VisionModel", { _id: String, revision: Number, examples: Number, centroids: Mixed, trainedAt: Date });
export const DeliveryRating = model("DeliveryRating", {
  agreementId: String, version: Number, from: ObjectId, to: { type: ObjectId, index: true }, side: String,
  quality: Number, reliability: Number, communication: Number, score: Number, note: String,
  simulated: { type: Boolean, default: true },
});
DeliveryRating.schema.index({ agreementId: 1, version: 1, from: 1 }, { unique: true });
export const AllocationApplication = model("AllocationApplication", {
  requirement: { type: ObjectId, index: true }, farmer: ObjectId, tons: Number,
  status: { type: String, default: "pending" }, agreementId: String,
});
AllocationApplication.schema.index({ requirement: 1, farmer: 1 }, { unique: true });
export const DemoAnchor = model("DemoAnchor", { _id: String, agreementId: String, version: Number, docHash: String, previousHash: String, proofHash: String, recordedBy: ObjectId });
