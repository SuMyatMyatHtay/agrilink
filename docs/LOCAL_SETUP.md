# Local Windows setup

Use Node 22+ (verified with Node 24), Python 3.12, and MongoDB 7. Run commands from `agrilink` unless stated otherwise.

## Environment files

`client/.env` and `server/.env` are private local configuration; the example files are reference templates, not a statement that external providers are connected.

- Client: `API_URL=http://127.0.0.1:4000` controls Vite's `/api` and Socket.IO proxies. No client provider secrets are needed. Restart Vite after changing it.
- Server: configure `MONGO_URI`, `ML_URL`, a private `JWT_SECRET`, `M2_API_URL`, `M2_DB_NAME`, and `CHAIN_RPC`. The local files created during setup use ports 27017, 8000, 8100 and 8545 respectively, with the API on 4000.
- `DEV_OTP=1234` and `SEED_ON_START=true` enable the existing local demo login and buyer requirements.
- `MESSAGING_MODE=simulated` and `ASSISTANT_MODE=basic` deliberately work without external credentials. WhatsApp/SMS delivery is simulated and Mitra uses basic answers.
- For AI chat, supply `ANTHROPIC_API_KEY` and an available model, or configure `ASSISTANT_PROVIDER=openai`, `ASSISTANT_BASE_URL`, `ASSISTANT_API_KEY`, and `ASSISTANT_MODEL` for a compatible provider. Remove `ASSISTANT_MODE=basic` to enable it. `GROQ_API_KEY` alone is not read by this version.
- Optional live mandi prices require `DATA_GOV_IN_API_KEY` in the **ML process environment**, not just `server/.env`.
- Module 2 is a separate Python process: the startup script sets `M2_CV_URL=http://127.0.0.1:8000` and `M2_MONGO_URI=mongodb://127.0.0.1:27017`. Node's `.env` is not automatically shared with Python.

Do not copy keys into `VITE_*` variables: those are browser-visible. An apparent credential was removed from the tracked server example; rotate it at its provider if it was real, since earlier Git history may retain it.

## Install once

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r services/ml/requirements.txt -r module2/backend/requirements.txt
```

Run `npm ci` separately inside `client`, `server`, and `blockchain`. Inside `blockchain`, also run `npm run compile`.

If local environment files do not exist, create them using the reference files and the settings above. Keep existing `.env` files when updating this checkout.

## Start

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1
```

This starts missing services in hidden windows, checks their health, and reuses ports already listening. MongoDB must be installed or available under the repository root's `.local/mongodb`; alternatively pass `-MongoExecutable 'C:\path\to\mongod.exe'`. Its local database and service logs are under the root `.local` directory. Services keep running after this command returns. Check logs if a port is occupied by a different application.

Open http://localhost:5173. Choose a demo farmer (a fresh database will ask for farm onboarding), buyer, or operations account. Manual login accepts OTP `1234` for this local configuration. The API seeds four buyers automatically; it does not seed farmer profiles.

Module 2 reference/demo records can be populated, **only for a disposable demo database**, by running `..\..\.venv\Scripts\python.exe -m app.seed` from `module2/backend`. That command resets Module 2 records and enables a simulated clock. It is not part of normal startup.

## Checks

- `client`: `npm run build`
- `server`: `npm test` (uses separate local test databases; do not override `MONGO_URI` to a database you want to keep)
- `blockchain`: `npm test`
- `services/ml`: `..\..\.venv\Scripts\python.exe -m pytest -q`
- `module2/backend`: `..\..\.venv\Scripts\python.exe -m pytest -q`

The server integration tests substitute ML, chain and some provider calls. A live agreement signing check should also be run against the actual services before relying on blockchain registration.

The existing Docker Compose file does not start Module 2 or blockchain; use the Windows startup script for this complete local stack.

## Verification on 16 November 2026

### Click-through walkthrough

`VITE_DEMO_MODE=true` now selects a self-contained frontend walkthrough. Production builds default to this walkthrough unless `VITE_DEMO_MODE=false` is explicitly configured. No database, API keys, authentication server, ML service or blockchain is used. Demo login opens a sample farm, followed by offers, agreement signing, a simulated quality review and confirmation. Progress is kept in browser local storage; Restart demo clears the sample transaction. The downloaded agreement is a labelled sample text file.

Browser button checks passed for onboarding, sample chat, crop submission, buyer requirement publishing, commitment creation, buyer draft sending, both signatures, blockchain registration, consultant approval and certificate issuance. The two `demo-*.jpg` assets are synthetic fixtures produced by the existing ML test image generator. They are labelled sample images in the form.

The earlier full-app browser checks above used local services. The new static walkthrough was separately tested against the production build with all API requests blocked: login, offer selection, quantity changes, sample signing, quality approval, confirmation, refresh persistence, download and restart passed with zero API calls and no browser errors.

For Vercel, retain the client's SPA rewrite configuration and set `VITE_DEMO_MODE=true` (or leave it unset for a production build). Push the updated client source and redeploy; changing an environment variable alone cannot update an older bundle. Set the flag to false only when using the full application and a separately configured backend.

- Client production build passed; a bundle-size advisory remains.
- Server: 25 tests passed. ML: 43 tests passed. Module 2: 57 tests passed. Blockchain: 4 tests passed.
- Chromium: farmer onboarding and authenticated home, offers, demand, price, profit, agreements, farm operations and assistant pages rendered. Buyer dashboard/farm operations and operations decision/farm pages rendered. No browser exceptions or API HTTP 5xx responses occurred during this check.
- Live API + ML + MongoDB + Hardhat: agreement `AGL-2026-00001` was signed by both parties, registered on-chain, verified from its PDF hash, and handed to Module 2. A modified PDF hash was rejected as a mismatch.
- A real Socket.IO connection received a new buyer requirement notification in 23 ms. Mitra returned a basic-mode answer through the client proxy.
- Startup script health checks and a second invocation with all services already running passed.

These checks created local demo records, including a farmer profile, a registered agreement, and a buyer requirement. The seeded requirements retain the repository's historical 2026 delivery dates. Forecast models use the repository's sample training data.

External AI, WhatsApp/SMS/TTS and mandi providers were not verified without credentials. Public-chain deployment and production payment/e-signature providers were not part of this local check. Package audits also report existing dependency advisories (client: 4, server: 1, blockchain: 19); major-version dependency upgrades remain separate work. Python tests passed with a Starlette/httpx deprecation warning.
