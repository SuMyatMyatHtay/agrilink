import { test } from "node:test";
import assert from "node:assert/strict";
import { createChain } from "../src/modules/contracts/chain.js";

test("blockchain defaults off without creating an RPC client or reporting fake registration", async () => {
  const previous = process.env.CHAIN_ENABLED;
  try {
    for (const setting of [undefined, "false"]) {
      if (setting === undefined) delete process.env.CHAIN_ENABLED;
      else process.env.CHAIN_ENABLED = setting;
      const chain = createChain();
      assert.equal(chain.enabled, false);
      for (const method of ["info", "ensureDeployed", "register", "lookup", "latest", "getVersion"]) {
        await assert.rejects(chain[method](), { code: "chain_disabled" });
      }
    }
  } finally {
    if (previous === undefined) delete process.env.CHAIN_ENABLED;
    else process.env.CHAIN_ENABLED = previous;
  }
});

test("invalid hosted blockchain configuration leaves the API and signing available", async () => {
  const keys = ["CHAIN_ENABLED", "VERCEL", "CHAIN_RPC", "CHAIN_PRIVATE_KEY", "CHAIN_CONTRACT_ADDRESS"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.CHAIN_ENABLED = "true"; process.env.VERCEL = "1";
    delete process.env.CHAIN_RPC; delete process.env.CHAIN_PRIVATE_KEY; delete process.env.CHAIN_CONTRACT_ADDRESS;
    const chain = createChain(); assert.equal(chain.enabled, false);
    await assert.rejects(chain.info(), { code: "chain_configuration" });
  } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
