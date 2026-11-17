# Presentation readiness — 17 November 2026

**Historical audit:** this describes the state before the overnight feature work. See [MORNING_CHECKLIST.md](MORNING_CHECKLIST.md) for the current demo capabilities, new voice/rating/quality/escrow/proof workflows, remaining external setup and presentation wording.

Reviewed against the 17-page `AgriLink Hackathon Pitch.pdf`. This is a source-code audit, not certification of the deployed services. Existing automated tests cover core workflows with isolated databases and simulated external providers. Rehearse the hosted flow before presenting. The PDF has not been modified.

## Main differences to explain

| Slides | Pitch claim | Current implementation / safe presentation wording |
| --- | --- | --- |
| 1–6, 11, 15 | Pusa Sarda melon, Punjab/Haryana, melon weight/Brix | The current prototype uses Alphonso mangoes and Maharashtra farm/grade/forecast data. Say “mango prototype; melon is the proposed pilot.” Melon needs crop standards, data, forms, advice and model validation, not a label change. A photo alone cannot establish sweetness/Brix. |
| 5–6, 10, 14, 16 | Blockchain digital contract | Draft → review → both-party sandbox signing → hashed PDF and audit trail implemented. Actual on-chain registration needs a configured reachable registry and funded registrar. Only integrity metadata goes on-chain, not the whole contract or payment. Local Hardhat is a development chain; Amoy is a public testnet. |
| 5–6, 9–10, 14, 16–17 | Escrow holds/releases money, fees on delivery | Module 2 has escrow workflow/ledger and a simulated bank adapter. No real money or automatic real fee collection. Say “simulated escrow workflow.” AgreementRegistry is a hash registry, not an escrow smart contract. |
| 5, 7, 10, 14, 16 | Hindi/Punjabi voice chatbot | Telegram supports linked accounts, text questions, requests and notifications. Telegram audio transcription/replies are not implemented. Do not demo voice or claim Punjabi support without a verified language-specific test. |
| 7, 10, 16 | WhatsApp and SMS live | Telegram is the selected channel. WhatsApp/SMS adapters need their own provider setup; unset/simulated credentials mean no delivery. Replace live-channel claim with “web + Telegram text; other channels planned.” |
| 5, 7, 10, 14, 16 | RAG grounded only in approved sources | Mitra uses a bundled reference guide plus farmer context; hosted AI is optional and basic fallback exists. This is not a verified retrieval/index/citation system guaranteeing approved-source-only answers. Say “reference-guided assistant prototype.” Telegram question handling is stateless, not persistent multi-turn memory. |
| 5, 7, 10, 12, 16 | AI grades, doctor confirms, corrections retrain | Photo assessment and human review workflows exist. Module 2 defaults to simulated CV unless M2_CV_URL points to the ML service. Image heuristics/gallery inference are not a field-validated melon grader. Vercel gallery training writes are disabled; do not promise online retraining there. |
| 7 | Automatic weekly photo reminders | Reminder/scheduler code needs a persistent worker or external scheduled invocation. Vercel API entry does not start interval jobs. Do not describe weekly delivery as active until scheduling is configured and tested. |
| 7, 10, 17 | Scenario Lab, risk/backup suppliers | Module 2 contains risk/scenario and recovery workflows; requires that separate Python backend and its database to be deployed and connected. Existing ML forecasts use bundled sample-data models unless validated live sources are configured. Do not present forecast numbers as measured accuracy. |
| 8, 17 | Rating-ranked allocation and 20% newcomer quota | Current marketplace deliberately uses first-come-first-served atomic quantity reservations. Two-way rating records exist in Module 2; ranked allocation and newcomer quota are future work. Slide 8 labels ranking Phase 2: keep it explicitly future. |
| 9, 11, 17 | Prices, savings, revenues, break-even, delivery targets | Proposed pilot assumptions and targets, not measured prototype outcomes. Keep those labels; this audit does not verify market statistics or commercial partnerships. |
| 6, 16 | Plain-language translated contract | English PDF terms and multilingual UI/advice exist; full Hindi/Punjabi legal contract translation and agricultural sowing/acreage planning are not completed. |

## Rehearsal order

1. Verify Node `/api/health/db`, ML `/health`, and optional Module 2 `/api/m2/health`. Do not reset the database.
2. Buyer demo: post a clearly labelled presentation requirement with a future date.
3. Farmer demo: see the red new-request banner, click to clear it, open Offers and claim a small available quantity (FCFS).
4. Open the resulting agreement, edit terms if needed, send for signature. Verify a pending signature status and downloadable draft PDF.
5. Sign as buyer and farmer in separate browser profiles. Built-in OTP is the configured `DEV_OTP` (default 1234); this is sandbox identity verification, not SMS delivery or production legal assurance.
6. Confirm both signatures, signed PDF download and reserved quantity activation. If chain disabled, explain that the hash is not anchored. If Amoy connected, register/retry and show the actual transaction in the explorer.
7. Link a farmer from Profile to Telegram. Verify `/status`, `/requests`, and a new buyer-request message. Do not use voice in this demo.
8. Only show quality/escrow/risk/ratings flows after the hosted Module 2 health check succeeds; label simulated CV and bank operations.

## Blockchain setup you must complete for a hosted on-chain demo

1. Create a dedicated test-only EVM wallet. Keep its seed phrase private. Never use the published Hardhat development wallet on public networks.
2. Get Polygon Amoy RPC access from a provider such as Alchemy. Add Amoy (chain ID 80002, POL) to the test wallet. Obtain test POL from the provider's Amoy faucet; no real funds are needed.
3. In local `server/.env`, set `CHAIN_PRIVATE_KEY` to that test wallet key and `POLYGON_AMOY_RPC` to the provider RPC. Do not commit these values.
4. From `agrilink/blockchain`, run:

   ```powershell
   npm ci
   node --env-file=../server/.env node_modules/hardhat/internal/cli/cli.js run scripts/deploy.js --network amoy
   ```

   This sends a testnet deployment transaction using test POL. The printed address and `deployments/amoy.json` identify the registry. The same wallet has registrar permission.
5. Set these on the Vercel **server** project (and local `server/.env` if testing locally):

   ```dotenv
   CHAIN_ENABLED=true
   CHAIN_ID=80002
   CHAIN_RPC=YOUR_PROVIDER_AMOY_HTTPS_RPC
   CHAIN_PRIVATE_KEY=YOUR_TEST_WALLET_PRIVATE_KEY
   CHAIN_CONTRACT_ADDRESS=YOUR_DEPLOYED_REGISTRY_ADDRESS
   ```

   Hosted runtime now loads a bundled ABI and the address, without depending on local deployment/artifact files. Do not set a Windows `CHAIN_DEPLOYMENT` path on Vercel. `POLYGON_AMOY_RPC` is for the deployment tool; `CHAIN_RPC` is for the API.
6. Redeploy server. Open Agreements → Blockchain status: it must show the network, deployed address and latest block. Finish signing an agreement and use retry registration for earlier unanchored signed agreements. Explorer: https://amoy.polygonscan.com/ . Success means a real testnet transaction, not mainnet production.
7. If setup cannot finish before the presentation, keep `CHAIN_ENABLED=false` and describe anchoring as an optional integration. Signing, MongoDB PDFs and the audit trail still work; no fake blockchain success is shown.

References: https://support.polygon.technology/support/solutions/articles/82000907114-how-to-add-the-polygon-amoy-testnet-to-your-wallet and https://www.alchemy.com/docs/choosing-a-web3-network .
