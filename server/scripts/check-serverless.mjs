import assert from "node:assert/strict";
import http from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// This check owns its temporary database; it never loads .env or user data.
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
let server;
try {
  process.env.MONGO_URI = mongo.getUri("entry_test");
  process.env.JWT_SECRET = "isolated-entry-test-secret-at-least-32-characters";
  process.env.CHAIN_ENABLED = "false";
  const { default: app } = await import("../src/app.js");
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  // Concurrent cold requests must share initialization.
  const responses = await Promise.all([
    fetch(`${base}/api/health/db`), fetch(`${base}/api/health/db`), fetch(`${base}/api/health`),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  }
  const { createMongoStore } = await import("../src/modules/contracts/storage.js");
  const data = Buffer.from("%PDF-1.4 isolated storage test");
  const store = createMongoStore();
  await store.putOnce("entry-test/v1-draft.pdf", data);
  assert.deepEqual(await createMongoStore().get("entry-test/v1-draft.pdf"), data);
  await assert.rejects(store.putOnce("entry-test/v1-draft.pdf", data), { code: "EEXIST" });
  await assert.rejects(store.get("missing.pdf"), { code: "ENOENT" });
  console.log("Serverless default export: concurrent database and API health checks passed");
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await (await import("mongoose")).default.disconnect();
  await mongo.stop();
}
