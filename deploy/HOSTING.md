# Hosting the current AgriLink application

## Deployment layout

There is **one frontend**, including buyer, farmer and operations/admin. Admin is not a separate application or backend. It uses `/login/operations`, then `/ops/decisions` and the other `/ops/*` routes.

Recommended current layout:

- **Vercel:** the React/Vite app and its small `/api/*` forwarding function.
- **Persistent Node host:** Express, Socket.IO, recurring jobs and signed documents/photos. The settings below use a Render Web Service as a concrete example.
- **MongoDB Atlas:** the existing cluster, with `agrilink` and `agrilink_m2` databases.
- **Private Python services:** ML and Module 2/farm operations, for the complete current feature set.

The existing Node backend is not packaged as a Vercel Function. Putting `server/` into a second Vercel project with a build command will not preserve its persistent files and long-running job behavior. Converting it to that hosting model is separate implementation work. Vercel supports Python and WebSockets, but the current app still requires explicit adaptation; it is not a matter of adding keys.

**This configuration is for a controlled hosted demo.** Current login uses a shared OTP and publicly selectable demo accounts, including operations. Real identity verification and restricted staff provisioning are required before a public production launch. A separate admin hostname does not fix that.

## Build and start settings

Use the `SuMyatMyatHtay/SUS4-SIH` repository. The local Git `origin` currently names a different repository (`agrilink.git`); ensure your changed files are committed/pushed to the repository the hosts actually deploy.

| Setting | Web app: buyer/farmer/admin | Node API | ML | Farm operations / Module 2 |
| --- | --- | --- | --- | --- |
| Suggested host/type | Vercel project | Render Web Service, Node runtime | Render Private Service, Python runtime | Render Private Service, Python runtime |
| Root Directory | `agrilink/client` | `agrilink/server` | `agrilink/services/ml` | `agrilink/module2/backend` |
| Runtime | Node `24.x` | Node `24.x` | Python `3.11` | Python `3.11` |
| Framework | Vite | Node/Express | FastAPI | FastAPI |
| Install command | `npm ci` | Included in build below | Included in build below | Included in build below |
| Build command | `npm run build` | `npm ci --omit=dev` | `python -m pip install -r requirements.txt` | `python -m pip install -r requirements.txt` |
| Start command | Managed by Vercel | `npm start` | `python -m uvicorn app.main:app --host 0.0.0.0 --port 10000` | `python -m uvicorn app.main:app --host 0.0.0.0 --port 10000` |
| Output Directory | `dist` | None / leave blank | None / leave blank | None / leave blank |
| Health endpoint | `/api/health/db` tests the whole HTTP bridge | `/api/health/db` | `/health` | `/api/m2/health` |
| Production env template | [`client.env.example`](client.env.example) | [`server.env.example`](server.env.example) | [`ml.env.example`](ml.env.example) | [`farm-operations.env.example`](farm-operations.env.example) |

Python commands use fixed internal port `10000` because these examples are private services. If you choose a public web service instead, use the host-provided port, e.g. `--port $PORT` on Render's Linux runtime. The latter is a hosting command, not a Windows PowerShell local-start command.

For the two Node services, configure Node `24.x` in the host's runtime settings; on Render use its Node version configuration. Do not select Docker unless you intentionally want the Docker workflow; the table describes native runtimes. The API Dockerfile has also been updated from Node 20 to 24 to match the app's requirements, but it is not needed for these settings.

## Vercel frontend settings

1. Import the repository and select `agrilink/client` as Root Directory.
2. Select Vite, install `npm ci`, build `npm run build`, output `dist`, Node `24.x`.
3. Enable **Include source files outside of the Root Directory**. The integrated farm-operations UI is imported from `agrilink/module2/frontend/src/module2`; a client-only upload will omit it.
4. Keep the existing `client/vercel.json`: its API rewrite must run before the SPA fallback. The `api/proxy.js` Node function is required; this is not a purely static deployment.
5. Add these environment variables for each Vercel environment you deploy:

   ```dotenv
   API_URL=https://YOUR-API.onrender.com
   VITE_REALTIME_URL=https://YOUR-API.onrender.com
   ```

6. Redeploy after setting/changing variables. `VITE_REALTIME_URL` is embedded at build time. `API_URL` is read by the server-side proxy at runtime; local Vite also uses it as its development proxy target.

Both values are **origins**, without `/api` or `/socket.io`. The browser uses same-origin `/api/*` URLs; the proxy calls Express. Socket.IO connects directly to the public Express origin.

Only `VITE_*` values belong in browser bundles. Never put `MONGO_URI`, `JWT_SECRET`, Meta tokens or provider keys into any `VITE_*` variable. You do not need a Vercel API token to run the app.

## Admin settings

**Recommended:** no additional deployment. Use `https://YOUR-APP.vercel.app/login/operations` and the same frontend variables as above. The backend, database and identity/session signing secret are shared.

[`admin.env.example`](admin.env.example) is an optional deployment reference for a second hostname. If you deliberately create a second Vercel project, its Root Directory, install/build/output commands and variables are exactly the same as the main frontend. It still serves all routes, not an admin-only build. No `VITE_ADMIN_SECRET`, admin database key, or separate admin API exists in the code.

Do **not** deploy `module2/frontend` as the admin app. It is a legacy standalone shell; the current operations UI is already integrated into `client`.

## Node API settings and storage

Create one persistent Node instance. Socket.IO broadcasting and scheduled jobs are currently in-process; multiple instances need shared coordination before scaling.

Set the values from `server.env.example`, especially:

| Variable | Value / source |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGO_URI` | Existing Atlas driver URI, including `/agrilink` |
| `JWT_SECRET` | A generated random secret, at least 32 characters; backend only |
| `PUBLIC_APP_URL` | Public Vercel frontend origin |
| `PUBLIC_API_URL` | Public Express origin |
| `ML_URL` | ML private origin, e.g. `http://INTERNAL-HOST:10000` |
| `M2_API_URL` | Farm-operations private origin **including `/api/m2`** |
| `M2_DB_NAME` | `agrilink_m2`, on the same Atlas cluster |
| `SEED_ON_START` | `false`; keep existing database data |
| `CHAIN_ENABLED` | `false` until blockchain is deliberately configured |
| `MESSAGING_MODE` | `simulated` until WhatsApp is configured and tested |
| `ASSISTANT_MODE` | `basic` until a hosted assistant provider is configured |

The host supplies `PORT`; Express already reads it and listens on the network interface. There is no frontend-style build output folder for this backend.

Mount an actual persistent disk at `/var/data` on the Node service, then set:

```dotenv
DOC_STORE_DIR=/var/data/agreements
CERT_STORE_DIR=/var/data/certificates
STAGE_PHOTO_DIR=/var/data/stage-photos
ADVISORY_EVIDENCE_DIR=/var/data/advisory-evidence
```

Atlas stores records, not the PDF/photo bytes stored by these filesystem adapters. Ephemeral host storage or Vercel `/tmp` is not a replacement for that disk. See the host's disk availability/pricing before choosing a service tier.

Whitelist the backend's outbound IPs in Atlas Network Access and grant its DB user access to both databases. FCFS claims require transactions; use Atlas or a replica set. On startup, the reservation migration preserves existing claims. Do not run destructive demo seeds as a deployment command.

For a new empty database only, initialize from a trusted machine with `npm run db:init`; optionally run the safe `npm run seed` once. Reuse the database you have already configured rather than creating a database for each frontend/role.

## Python services

Keep both services on the same private network and region as Express. Copy the actual private hostnames from the hosting dashboard into `ML_URL`, `M2_API_URL` and `M2_CV_URL`; the example hostnames are placeholders.

**ML:** sample-trained forecasting does not require a database or AI provider key. `DATA_GOV_IN_API_KEY` is only for live market data. Startup loads/trains models and writes the `models/` directory; allow sufficient startup time and a writable deployment directory. With ephemeral storage it may retrain after a deployment/restart. Build-time training or persistent model storage can be configured later.

**Farm operations:** use the same Atlas cluster and `M2_DB_NAME=agrilink_m2`; set `M2_CV_URL` to the ML origin and `M2_PUBLIC_TRACE_BASE` to the public frontend URL ending in `/m2/trace`. Attach its own persistent disk at `/var/data` and set `M2_UPLOAD_DIR=/var/data/uploads`. Keep `M2_ALLOW_DEMO_CONTROLS=false`.

Module 2 currently trusts identity headers inserted by the Node gateway rather than independently validating JWTs. Keep it private; CORS does not secure a publicly exposed Python API. Browsers should call `/api/m2` through the public Node gateway, not connect directly to that private service.

The posting/claiming milestone can run without ML, but forecasting and farm-operation screens require their respective Python services. A hosted chatbot key does not replace these custom endpoints.

## Deployment order and smoke checks

1. Retain/configure Atlas and network/database permissions.
2. Deploy private ML and farm-operations services; collect internal hostnames.
3. Deploy the Node API with its variables and persistent disk; check `/api/health/db` on its public origin.
4. Deploy Vercel with `API_URL` and `VITE_REALTIME_URL` pointing at that public API.
5. Update Node `PUBLIC_APP_URL` and Module 2 trace/CORS settings to the final frontend URL; redeploy affected services. Repeat for preview/staging environments if used.
6. On the deployed frontend, verify `/api/health/db`, demo buyer login, posting a requirement, a second farmer session receiving the new request, claiming quantity, remaining quantity, and agreement review/signing. Check refresh of a deep link such as `/contracts` and realtime reconnection.

Provider secrets stay on Node. Live WhatsApp later requires the credentials already listed in `server/.env.example`, approved templates and public backend callbacks at `/api/webhooks/whatsapp`. The frontend/admin deployments need none of those keys.

Vercel's HTTP proxy remains subject to function payload/duration limits. The existing large-photo upload flow needs direct uploads/object storage or a suitably secured direct backend path before it can be treated as fully supported through Vercel. The basic posting/claiming flow uses small JSON payloads.

These files prepare deployment; they do not create hosted services, push commits, configure provider accounts or verify a live deployment. Local tests are not a substitute for the smoke checks on the final domains.

## References

- [Vercel: Vite deployments](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: environment variables](https://vercel.com/docs/environment-variables)
- [Vercel: build/root settings](https://vercel.com/docs/builds/configure-a-build)
- [Vercel: function runtime/filesystem](https://vercel.com/docs/functions/runtimes)
- [Render: service/build/start settings](https://render.com/docs/your-first-deploy)
- [Render: FastAPI](https://render.com/docs/deploy-fastapi)
- [Render: persistent disks](https://render.com/docs/disks)
