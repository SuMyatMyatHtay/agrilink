import mongoose from "mongoose";
import { User } from "./modules/users/model.js";
import { Requirement } from "./modules/requirements/model.js";
import { Bond } from "./modules/bonds/model.js";
import { Agreement } from "./modules/contracts/model.js";
import { Certificate } from "./modules/certificates/model.js";
import { Crop, StageAssessment } from "./modules/stages/model.js";
import { Notification } from "./modules/notifications/model.js";
import { MessageLog } from "./modules/messaging/model.js";
import "./modules/contact/routes.js";
import "./modules/messaging/bridge.js";
import "./modules/stages/config.js";
import "./modules/advisory/service.js";

export const models = Object.values(mongoose.models);

// Add collections and missing indexes without deleting existing data or indexes.
export async function initializeDatabase() {
  for (const model of models) {
    await model.createCollection();
    await model.createIndexes();
  }
}

export async function connectDatabase(uri) {
  return mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
}
