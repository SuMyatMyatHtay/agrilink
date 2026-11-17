import mongoose from "mongoose";
export const TelegramLink = mongoose.models.TelegramLink || mongoose.model("TelegramLink", new mongoose.Schema({
  _id: String, // SHA-256 of the one-time token, not the raw deep-link secret.
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}));
export const TelegramUpdate = mongoose.models.TelegramUpdate || mongoose.model("TelegramUpdate", new mongoose.Schema({
  _id: Number, chatId: String, status: { type: String, enum: ["processing", "done", "failed"] }, leaseUntil: Date,
  reply: String, replyUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  transcript: String,
  demoVoice: Boolean,
  expiresAt: { type: Date, expires: 0 },
}));
