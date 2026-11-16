# Database setup and hosting decision

Current client/server/ML build settings: [deploy/HOSTING.md](../deploy/HOSTING.md). Telegram setup: [TELEGRAM.md](TELEGRAM.md).

## First step: create MongoDB Atlas

Keep the current React/Vite + Express + MongoDB stack for the first database milestone. MongoDB uses **collections**, rather than SQL tables. You do not need Supabase, Firebase, or a MongoDB API key. You need a MongoDB **driver connection URI** containing a database username and password.

1. Create an Atlas project and cluster at https://www.mongodb.com/atlas.
2. Under Database Access, create a database user with read/write access to `agrilink` and `agrilink_m2`. This is separate from your Atlas account login.
3. Under Network Access, permit your local public IP and, later, the backend host's outbound IPs. Restrict these to the hosts you use.
4. Choose Connect > Drivers > Node.js. Copy the URI, substitute the database user and URL-encoded password, and put `/agrilink` before the query string:

   `mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/agrilink?retryWrites=true&w=majority`

5. Copy `server/.env.example` to `server/.env` **only if `.env` does not already exist**. Preserve existing values otherwise. Set `MONGO_URI` and generate `JWT_SECRET` using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
6. From `agrilink/server`, run:

   ```powershell
   npm ci
   npm run db:check
   npm run db:init
   npm run seed
   npm start
   ```

`db:check` pings the configured database. `db:init` creates all 16 Node collections and declared indexes without deleting records or existing indexes. Resolve duplicate-data/index errors before proceeding. There are no SQL migrations to paste into Atlas.

`seed` adds four sample buyers, four future-dated sample requirements, and an onboarded farmer only when there are no requirements. Re-running it retains existing requirements. This is development data; use a dedicated development database. Sample company names are illustrative, not evidence of real buyers or commercial activity. Sample mobile numbers are identifiers; no messages are sent by seeding. Farmer: `9888888801`; buyers: `6500000001` through `6500000004`; current demo OTP: `1234` unless changed in `.env`.

Do not run `src/seed-demo.js` or Module 2's `app.seed` against valuable data: both existing scripts delete data. They are not used by this setup.

## Structure and source of truth

[`DATABASE_SCHEMA.json`](DATABASE_SCHEMA.json) is generated from the actual Node Mongoose models (`npm run db:schema`). It lists collection names, field types, required fields, enums, references and indexes. The model files also define nested subdocuments, defaults and application validation; consult those files before changing a field. Cross-collection references are application-managed, not SQL foreign keys.

| Collection | Purpose / relationships |
| --- | --- |
| users | Mobile unique; farmer profile, buyer company, operations identity |
| requirements | Buyer -> users; grade, quantity, price, delivery date |
| bonds | Requirement -> requirements; farmer/buyer -> users |
| agreements | Versioned agreement terms, signatures, document and chain metadata |
| certificates | Quality certificates and lot traceability |
| crops | Farmer -> users; season and crop identity |
| stageassessments | Crop inspections, photos and review decisions |
| stageconfigs | Crop-stage configuration |
| advisories | Farmer recommendations and evidence history |
| notifications | User -> users; in-app notification history |
| messagelogs | Delivery attempts/status; simulated is not delivered |
| messagingcursors | Notification bridge progress |
| contactmessages | Contact form submissions |

Module 2 uses a second database, `agrilink_m2`, on the **same cluster**, because Node directly reads some of its collections. Its 19 collections and indexes are defined in `module2/backend/app/db.py`, with record structures in `schemas.py`. No second Atlas account/cluster is required. When enabling it, copy its `.env.example`, set `M2_MONGO_URI` to the same cluster URI and `M2_DB_NAME=agrilink_m2`. From `module2/backend`, initialize safely with:

```powershell
python -m pip install -r requirements.txt python-dotenv
python -m dotenv -f .env run -- python -c "from app.db import get_db, ensure_indexes; ensure_indexes(get_db())"
python -m uvicorn app.main:app --env-file .env --port 8100
```

Creating indexes creates the corresponding collections as needed. Other Module 2 collections are created on first write. Do not use its destructive sample seed for setup.

## Run and verify the real client

From `agrilink/client`, preserve any existing `.env`, otherwise copy `.env.example`. Set `API_URL=http://127.0.0.1:4000`, then `npm ci` and `npm run dev`.

Open `http://localhost:5173/api/health/db`. It must return `{"status":"ok","database":"connected"}`. Login and confirm the users appear in Atlas. Local Vite forwards `/api` and Socket.IO to Express. The original frontend flow is restored; there is no standalone static demo.

The database milestone supports login and persistence without ML. Requirements pricing, forecasts, quality analysis and some dashboard screens still call Python ML; for the complete current UI, start the ML service too:

```powershell
# From agrilink/services/ml, with your Python environment activated
python -m pip install -r requirements.txt python-dotenv
python -m uvicorn app.main:app --env-file .env --port 8000
```

Copy `services/ml/.env.example` first. Model artifacts/training requirements remain as described in `DATA.md`; database connectivity does not validate the models.

## Vercel frontend + hosted backend

Blockchain is opt-in: leave `CHAIN_ENABLED=false` for database-first setup. No RPC client is created in this mode, so a missing local Hardhat node will not trigger retry messages. To enable registration later, configure/start the node and registry, then set `CHAIN_ENABLED=true` and restart the API. Signed documents can still be stored while on-chain registration remains unavailable.

The prepared deployment uses Vercel for the frontend plus a small Node proxy function, Atlas for data, and an external persistent Express/Python backend. This is a hosting change; no database rewrite is needed. An all-Vercel backend migration is a separate decision.

1. Deploy `agrilink/server` to a Node host with persistent disk and long-running processes. Build/install: `npm ci --omit=dev`; start: `npm start`; Node 22.9+. Set backend environment variables from `server/.env.example`, including Atlas URI, strong JWT secret, `SEED_ON_START=false`, public HTTPS URLs and hosted Python service URLs. Initialize/seed separately from a trusted local machine; do not seed every deployment.
2. Mount persistent storage for agreements, certificate PDFs, crop photos and advisory evidence, using the four storage directory variables. Host Module 2 uploads on persistent disk as well. The current S3 adapter is not implemented.
3. In Vercel, import **SuMyatMyatHtay/SUS4-SIH**, set Root Directory to `agrilink/client`, framework Vite, install `npm ci`, build `npm run build`, output `dist`. Enable **Include source files outside of the Root Directory** because the client imports `../module2/frontend/src/module2`.
4. Set Vercel `API_URL=https://YOUR-EXPRESS-HOST` (server-only), `VITE_REALTIME_URL=https://YOUR-EXPRESS-HOST` (public). Neither URL includes `/api`. Redeploy after changing build-time `VITE_*` values. Only the backend receives MongoDB/provider secrets.
5. `client/vercel.json` routes `/api/*` to the Node HTTP proxy before the SPA fallback. The proxy forwards authorization, request method/body, query parameters, PDFs/uploads and SSE responses to the backend. Socket.IO connects directly to `VITE_REALTIME_URL`, avoiding the HTTP proxy. Existing backend CORS permits this connection.
6. Verify `https://YOUR-VERCEL-HOST/api/health/db`, login, persistence in Atlas, deep-link refresh, and Socket.IO from the actual deployed site. Configure provider callbacks against the backend's public HTTPS URL.

The bridge remains subject to Vercel Function duration and request/response-size limits. Large base64 photo submissions currently accepted by Express (20–25 MB) require a future direct-upload/object-storage change for Vercel's smaller payload limit. Do not treat that flow as deployed/verified by this database milestone.

Vercel now offers WebSockets, but this app's Socket.IO server and in-memory broadcasting still need adaptation for multiple function instances. Background interval jobs, filesystem writes, Hardhat artifacts/deployment files, Python model assets, and cross-service calls also require explicit deployment changes. Hosted model APIs can replace conversational AI; they do not automatically replace the custom forecasting/grading endpoints. If you require every backend component on Vercel, the next phase must address persistent object storage, scheduled jobs, realtime coordination and ML hosting/replacement.

References: [Vercel runtimes](https://vercel.com/docs/functions/runtimes), [WebSocket support](https://vercel.com/changelog/websocket-support-is-now-in-public-beta), [Atlas connections](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

## Accounts and secrets by feature

| Feature | What you create / variables | Current status |
| --- | --- | --- |
| Database | Atlas cluster and DB user; `MONGO_URI`, `M2_MONGO_URI`, `M2_DB_NAME` | Implemented; setup commands above |
| Session tokens | Generate `JWT_SECRET` yourself | Implemented; production rejects weak/missing secret |
| WhatsApp | Meta developer app + WhatsApp Business phone; `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_NUMBER` | Cloud API adapter exists; unverified without credentials; needs approved `agrilink_*` templates matching `messaging/templates.js` and subscribed webhooks |
| SMS notifications | Choose one provider: MSG91 (`MSG91_AUTH_KEY` + DLT details), Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`), or generic HTTP | Adapters exist; delivery unverified; separate from login OTP |
| WhatsApp speech output | Google Cloud project, billing + Text-to-Speech API; `TTS_PROVIDER=google`, `GOOGLE_TTS_API_KEY` | Adapter exists; unverified without credentials |
| Browser STT/TTS | No account/API key; browser speech recognition/synthesis | Browser/voice/language support varies; microphone needs HTTPS or localhost |
| Telegram text bot | BotFather token/username and webhook secret; `TELEGRAM_*`, `MESSAGING_CHANNELS=telegram` | Implemented foundation; see TELEGRAM.md. No WhatsApp business account needed |
| Uploaded-audio STT | No implemented provider | Not implemented |
| Conversational AI | Anthropic or compatible hosted endpoint; `ASSISTANT_API_KEY`, `ASSISTANT_PROVIDER`, `ASSISTANT_BASE_URL`, `ASSISTANT_MODEL`; set `ASSISTANT_MODE=ai` | Basic mode works without a key; configure an actual supported model, do not rely on the existing default model string |
| Forecast/grading | Host existing Python service; `ML_URL`; optional `DATA_GOV_IN_API_KEY` on ML host | Custom/sample-trained models; not replaced by assistant API |
| Blockchain | Hosted RPC, dedicated signing wallet and deployed registry; `CHAIN_RPC`, `CHAIN_PRIVATE_KEY`, `CHAIN_DEPLOYMENT` | Local Hardhat defaults are development-only; deployment artifacts still needed |
| S3 / Zoho / DocuSign | Defer account creation | Existing code is a local storage stand-in / unimplemented e-sign adapters |

WhatsApp webhook verification: `GET /api/webhooks/whatsapp`; inbound/status notifications: `POST` to the same path. SMS callbacks: `/api/webhooks/sms`. Set the public backend URL and webhook secrets before enabling live delivery (`MESSAGING_MODE=live`). Check current provider onboarding/API-version requirements in their consoles before creating templates.

**Authentication is still a demo:** `/auth/otp` sends no OTP, verification uses `DEV_OTP`, and users can request the operations role. Do not launch this as a public production service until real identity verification and staff-role restrictions are implemented. Provider keys alone cannot fix that behavior.

## Verification without your credentials

`npm run test:database` starts an isolated temporary real MongoDB instance, checks collection/index creation, repeatable seed, login through the production proxy handler, requirement persistence, 404 routing, missing API configuration, and disconnected DB health. ML responses are faked in this test. The first run downloads a MongoDB binary; it never reads or clears your configured Atlas database.

`npm run test:isolated` runs the existing API suites against a temporary MongoDB too. Avoid plain `npm test` with a valuable `MONGO_URI`: the existing suites drop their test databases.

Actual Atlas connectivity, real provider delivery and Vercel deployment need the accounts/URLs above and must be verified after configuration. No credentials, account creation, Git push, or hosted deployment are supplied by these code changes.

Repository audit: the linked GitHub fork was inspected; the original users model and environment config blob hashes match this local checkout. The local Git `origin` currently points to `SuMyatMyatHtay/agrilink.git`, a different repository. It was left unchanged; select the requested `SUS4-SIH` repository explicitly when publishing these changes.

## Original frontend restored

Screens, layouts, styles, entrypoint and navigation match the original repository commit `90dbef7`. Later static walkthrough files, canned assistant replies, sample-photo shortcuts and demo-specific screen modifications were removed from the active frontend. API response validation and configurable Socket.IO origin remain as connection-only changes. The module2 frontend is unchanged. The pre-restore files are backed up under `.local/frontend-before-restore-*`.

## First-come, first-served claims and new-request notifications

A claim is allocated when its validated database transaction commits. It immediately reserves the requested quantity: `available = tons - filled - reserved`. A request can be shared by multiple farmers until all quantity is claimed. There is no ranking or invitation queue. The same farmer cannot concurrently exceed estimated free capacity. Claims, demand reservations and draft agreement creation commit together; failures roll back together. A database counter assigns agreement IDs across concurrent requests.

This requires a MongoDB replica set or sharded cluster; Atlas supports this. The configured database was checked for transaction support. For local MongoDB, enable a replica set; a standalone server cannot execute the claim transactions. Isolated tests use a temporary single-member replica set.

On API restart, existing requirements without `reserved` are backfilled from their unsigned, non-cancelled commitments. This retains existing data. If historical drafts already exceed demand, they consume all available quantity until released; the migration does not silently cancel them. Claims remain held until released or declined; no automatic expiry timer is implemented. A draft can be released from the agreement page. Declining before signing releases the claim; cancelled agreements remain in history. Fully signed agreements move reserved quantity to filled even if optional blockchain registration fails or is disabled.

The farmer homepage shows a compact red banner when a new-request notification has not yet been acknowledged by that farmer. Clicking its "Click here to view" link dismisses the alert immediately, persists the acknowledgement, and opens Offers. Opening Offers marks the requests displayed there as viewed in MongoDB; refreshing or logging in again does not restore the banner for those requests. A later new request brings the banner back. Viewed tracking is independent of clearing the notification bell, and each farmer has their own state. Requests update through Socket.IO, with a 15-second polling fallback. Buyer tables include reserved quantities in claimed totals. Farmer navigation keeps Home, Offers, Agreements and Profile prominent, with Planning & advice and Farm tools collapsed by default. Mobile provides the same secondary tools in a More menu.

Posting creates in-app notifications for onboarded farmers. The notification bridge now supports Telegram as the preferred channel; see TELEGRAM.md. The legacy WhatsApp adapter also maps `req_new` to `new_requirement`. To enable real delivery, configure the existing Meta variables, set live messaging, and register/approve `agrilink_new_requirement` in **English**, with body parameters in this order: buyer, grade, tons, USD price/kg, application link. The initial template is English only; other language preferences fall back to English. Template text lives in `server/src/modules/messaging/templates.js`. Public app URLs must be reachable HTTPS URLs for real phones. No additional API key is needed for this event.

Current verified configuration: messaging simulated; WhatsApp credentials absent. Consequently no real WhatsApp delivery was performed. In simulated mode an attempt is logged as `simulated`, never `delivered`. Provider acceptance is `sent`; delivery/read status comes from provider webhooks.
