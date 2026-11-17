# Hosting: client, server and ML

These are the three services requested. Operations/admin is already included in the client; it is not a fourth app.

| Setting | Client | Server / Node API | ML |
| --- | --- | --- | --- |
| Hosting | Vercel | Persistent Node host, e.g. Render Web Service | Vercel |
| Root Directory | `agrilink/client` | `agrilink/server` | `agrilink/services/ml` |
| Framework / runtime | Vite / Node 24.x | Express / Node 24.x | FastAPI / Python 3.12 |
| Install | `npm ci` | `npm ci --omit=dev` | Automatic Python install from `requirements.txt` |
| Build | `npm run build` | No compilation. On Render put `npm ci --omit=dev` in Build Command | `python scripts/prepare_models.py` |
| Output Directory | `dist` | None / leave blank | None / leave blank |
| Production start | Managed by Vercel | `npm start` | Managed by Vercel; entrypoint `app/main.py:app` |
| Entry / health URL | `/` and `/api/health/db` | `/api/health/db` | `/health` and `/docs` |
| Env template | [client.env.example](client.env.example) | [server.env.example](server.env.example) | [ml.env.example](ml.env.example) |

The full Node server is best hosted on a persistent host because it uses filesystem document/photo storage, in-process Socket.IO broadcasts and recurring jobs. A Vercel HTTP entry point is now provided by the default export in `server/src/app.js`, with cached MongoDB initialization in `serverless.js`. For Vercel use root `agrilink/server`, Express preset, Node 24.x, install `npm ci`, and leave build/output/start overrides unset. Configure production `MONGO_URI`, `JWT_SECRET`, `ML_URL` and public URLs, then redeploy. Check `/api/health/db`. The Vercel entry does not start interval jobs, attach Socket.IO, or seed data. Persistent document/photo storage and reliable background notification delivery still need adaptation before claiming full feature parity; local filesystem storage is not durable on Vercel.

## Connections

Agreement PDF storage update: on Vercel, agreement drafts and signed PDFs now use a MongoDB write-once collection automatically (maximum 12 MB per document). No extra storage credentials are needed. `DOC_STORE_BACKEND=mongodb` enables this on other hosts too. Existing local PDFs are not migrated automatically. Certificate/photo storage still needs separate adaptation. For a serverless backend leave client `VITE_REALTIME_URL` blank or set it to `disabled`; notification polling remains enabled. Only configure a realtime origin for a persistent Socket.IO backend.

The client calls Node; Node calls ML and MongoDB Atlas. Telegram also calls Node. The combined Python/ML deployment now hosts farm operations and needs `M2_MONGO_URI` and `M2_GATEWAY_SECRET`. Node JWT/Telegram secrets stay on Node; no secrets belong in the frontend.

Vercel **client** environment:

```dotenv
API_URL=https://YOUR-API.onrender.com
VITE_REALTIME_URL=https://YOUR-API.onrender.com
```

These values are origins, without `/api`. Keep `client/vercel.json` and `client/api/proxy.js`. Enable **Include source files outside the Root Directory** because the integrated farm-operations UI is imported from `../module2/frontend/src/module2`. Redeploy after changing environment variables; `VITE_*` values are embedded during build. Use the same deployment for farmer, buyer and `/login/operations`.

The **Node backend** needs the values in `server.env.example`: Atlas `MONGO_URI`, a generated `JWT_SECRET` of at least 32 characters, `NODE_ENV=production`, `PUBLIC_APP_URL` set to the Vercel frontend, `PUBLIC_API_URL` set to the public Node origin, and:

```dotenv
ML_URL=https://YOUR-ML.vercel.app
ML_TIMEOUT_MS=20000
```

Use the public production ML URL; protected preview URLs may return an authentication page to the backend. This client does not currently add a Vercel deployment-protection bypass header. Telegram settings are documented in [TELEGRAM.md](../docs/TELEGRAM.md).

The host supplies Node's `PORT`. Keep one API instance until broadcasts and jobs have shared coordination. Attach a persistent disk at `/var/data` and use the four directory values in `server.env.example` for signed PDFs, certificates, crop photos and advisory evidence. Atlas stores records, not the filesystem bytes. Do not use Vercel `/tmp` for durable documents.

Keep `SEED_ON_START=false`; reuse the existing Atlas database. FCFS claims require transaction support (Atlas/replica set). API startup retains/backfills existing reservations. Do not run destructive demo seed scripts during deployment.

## ML on Vercel

`services/ml/vercel.json` selects FastAPI, runs `python scripts/prepare_models.py` after dependency installation, includes `models/` and `data/` in the function, and configures a 60-second function duration. `.python-version` selects Python 3.12.

The build trains the three forecasting models from the supplied CSVs. Vercel runtime instances load those artifacts and fail clearly if they were not bundled; they do not train missing artifacts on a read-only filesystem. The optional vision gallery **write/training** endpoint returns 503 on Vercel because it requires persistent storage. Forecasting, image inference and photo-quality endpoints remain available, subject to function payload/time limits.

Set `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` if large functions are supported by your project/account. Scientific Python libraries can exceed the standard bundle limit; the actual deployment build determines the bundle size. If the account cannot support the resulting bundle, use a smaller inference dependency set or a persistent Python host instead. This is a prepared configuration with local validation, not proof of a successful hosted build.

Forecast-only endpoints need no database. The bundled farm-operations routes need `M2_MONGO_URI` (same Atlas connection as Node), `M2_DB_NAME=agrilink_m2` and the same `M2_GATEWAY_SECRET` on Node and Python. No Node JWT secret or Telegram token is needed on Python. Optional `DATA_GOV_IN_API_KEY` enables live market data. Leave `VISION_GALLERY_DIR` unset.

Local ML command only (not a Vercel Start Command):

```powershell
python -m uvicorn app.main:app --env-file .env --port 8000
```

## Optional farm-operations service

Farm operations is now bundled into the **existing ML deployment**, at `/farm-operations/api/m2`. Enable **Include source files outside Root Directory** in the ML Vercel project: the existing build command copies `module2/backend/app` into the Python function. Set the database/shared-secret variables above and redeploy ML and Node. No fourth deployment or paid provider API is required. Node `M2_API_URL` can be blank on Vercel (derived from `ML_URL`) or explicitly set to `https://YOUR-ML.vercel.app/farm-operations/api/m2`. Uploaded photos use MongoDB on Vercel. Signed agreements hand over after all signatures, independently of blockchain; use **Sync farm operations** on existing signed agreements to retry earlier failed handoffs.

A separate private service remains an alternative:

- Root: `agrilink/module2/backend`; Python 3.11 or 3.12.
- Build: `python -m pip install -r requirements.txt`.
- Private-service start: `python -m uvicorn app.main:app --host 0.0.0.0 --port 10000`.
- Health: `/api/m2/health`.
- Set Node `M2_API_URL=http://PRIVATE-HOST:10000/api/m2` and `M2_DB_NAME=agrilink_m2` on the same Atlas cluster.
- Set `M2_CV_URL=https://YOUR-ML.vercel.app`, the public frontend trace URL, and its own persistent upload disk. See [farm-operations.env.example](farm-operations.env.example).

The core posting/claiming flow works independently of Module 2, but its farm-operation panels need this service.

## Deployment order

1. Ensure changes are committed/pushed to the repository selected by your hosting projects. The supplied repository is `SuMyatMyatHtay/SUS4-SIH`; the local `origin` currently names a different repository, so check before pushing.
2. Deploy ML to Vercel and check `/health` and `/price/outlook` on the deployed domain.
3. Deploy Node with Atlas, the hosted ML URL and persistent storage; check `/api/health/db`.
4. Deploy the client with Node's public origin in both frontend variables.
5. Update Node's `PUBLIC_APP_URL` to the final frontend domain and redeploy it. Confirm buyer posting, farmer notifications, FCFS claims and agreement signing using separate sessions.
6. Configure Telegram on the Node host and register its webhook after the public API is available. No business account is required.

Current application authentication is still a controlled demo: shared OTPs and selectable demo operations accounts are not production identity verification. A separate admin hostname does not secure this. Large photo submissions also remain subject to Vercel proxy/function payload limits.

No hosted deployment or BotFather account is created by these configuration files.

References: [Vercel Vite](https://vercel.com/docs/frameworks/frontend/vite), [Vercel FastAPI/build entrypoints](https://vercel.com/docs/frameworks/backend/fastapi), [Python runtime](https://vercel.com/docs/functions/runtimes/python), [large function bundles](https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size), [Render settings](https://render.com/docs/your-first-deploy), [persistent disks](https://render.com/docs/disks).
