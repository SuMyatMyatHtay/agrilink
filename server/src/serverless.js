import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./database.js";
import { migrateReservations } from "./modules/bonds/allocation.js";
import { createMl } from "./lib/ml.js";
import { createNotifier } from "./modules/notifications/notifier.js";
import { createMessenger } from "./modules/messaging/service.js";
import { createChain } from "./modules/contracts/chain.js";
import { createStore } from "./modules/contracts/storage.js";

export async function initializeServerless() {
  if (mongoose.connection.readyState !== 1) await connectDatabase(env.mongo);
  await migrateReservations();
  // No automatic seeds, interval jobs or Socket.IO listener in request functions.
  return createApp({
    ml: createMl(env.mlUrl),
    notifier: createNotifier(),
    messenger: createMessenger(),
    contractDeps: { chain: createChain(), store: createStore() },
  });
}
