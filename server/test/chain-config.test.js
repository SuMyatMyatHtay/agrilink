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
