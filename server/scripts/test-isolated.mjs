import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { once } from "node:events";

// Existing suites drop their test databases. Never point them at user data.
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
try {
  const child = spawn(process.execPath, ["--test", "test/**/*.test.js"], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test", MONGO_URI: mongo.getUri("agrilink_test").split("?")[0] },
  });
  const [code] = await once(child, "exit");
  process.exitCode = code ?? 1;
} finally {
  await mongo.stop();
}
