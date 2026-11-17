// Real local EVM integration check, isolated from user RPCs/wallets/databases.
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { ethers } from "ethers";
const listener = createServer();
await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const cwd = fileURLToPath(new URL("../../blockchain/", import.meta.url));
const child = spawn(process.execPath, [fileURLToPath(new URL("../../blockchain/node_modules/hardhat/internal/cli/cli.js", import.meta.url)), "node", "--hostname", "127.0.0.1", "--port", String(port)], { cwd, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
let startupError; child.on("error", error => { startupError = error; }); child.stderr.on("data", () => {});
const rpc = `http://127.0.0.1:${port}`;
let provider, chain;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError || child.exitCode !== null) throw new Error("Isolated Hardhat node failed to start");
    try { const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(500) }); if ((await r.json()).result === "0x7a69") { ready = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(ready, "Hardhat becomes ready");
  // Published Hardhat key: only ever used against this isolated localhost node.
  const key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  provider = new ethers.JsonRpcProvider(rpc, 31337, { staticNetwork: true });
  const wallet = new ethers.Wallet(key, provider);
  const artifact = JSON.parse(await readFile(new URL("../../blockchain/artifacts/contracts/AgreementRegistry.sol/AgreementRegistry.json", import.meta.url), "utf8"));
  const registry = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(wallet.address); await registry.waitForDeployment();
  Object.assign(process.env, { VERCEL: "1", CHAIN_ENABLED: "true", CHAIN_ID: "31337", CHAIN_RPC: rpc, CHAIN_PRIVATE_KEY: key, CHAIN_CONTRACT_ADDRESS: await registry.getAddress() });
  const { createChain } = await import("../src/modules/contracts/chain.js"); chain = createChain();
  assert.equal(chain.enabled, true);
  const first = createHash("sha256").update("local signed PDF v1").digest("hex"), second = createHash("sha256").update("local signed PDF v2").digest("hex");
  const receipt = await chain.register("AGL-INTEGRATION-CHECK", first, 1);
  assert.equal(receipt.status, "registered"); assert.ok(receipt.blockNumber > 0); assert.equal(receipt.docHash, `0x${first}`);
  assert.equal((await chain.lookup(first)).version, 1); assert.equal((await chain.getVersion("AGL-INTEGRATION-CHECK", 1)).docHash, `0x${first}`);
  const amended = await chain.register("AGL-INTEGRATION-CHECK", second, 2); assert.equal(amended.prevDocHash, `0x${first}`);
  assert.equal((await chain.latest("AGL-INTEGRATION-CHECK")).version, 2);
  console.log("PASS: actual isolated EVM deployment, portable server ABI, hash registration, lookup and linked amendment. No public network, real funds or user database used.");
} finally { chain?.close?.(); provider?.destroy(); child.kill(); }
