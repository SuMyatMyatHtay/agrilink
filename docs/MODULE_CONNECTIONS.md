# Run Module 1 and farm operations together

## What was fixed

- Node's farm-operations gateway now supports HTTPS targets, forwards serverless-parsed JSON/binary bodies, strips forged role/actor/gateway headers, supplies its own shared secret, times out failed upstream calls, and reports configuration failures without breaking Module 1.
- The original Module 2 Python app is bundled into the existing ML/FastAPI project. It remains the actual quality/supply/risk/escrow/ratings implementation; it is not replaced with static frontend data. No additional paid API or fourth hosted project is required.
- Metadata requests synchronize onboarded farmers/FPOs/doctor reference records from Module 1 into the shared Atlas `agrilink_m2` database, so the desk picker has actual FPOs before any blockchain registration.
- Handoff occurs after buyer, farmer and assigned FPO witness signatures. Blockchain is optional. Existing signed agreements have a **Sync farm operations** retry action.
- Hosted Module 2 protects trusted identity headers with `M2_GATEWAY_SECRET`. Without a secret it rejects protected hosted calls; missing `M2_MONGO_URI` returns an explicit setup error. Health is available without identity headers.
- Photos persist in MongoDB on Vercel. Browser uploads are resized to stay within request limits. CV can run in-process using the existing ML implementation, without another provider key. Separate gallery retraining limitations remain as described in the morning checklist.

## Local: one terminal command

Install existing dependencies once if needed (`npm ci` in client/server, `python -m pip install -r requirements.txt` in services/ml using your project virtual environment).

Stop old client/API/ML development servers with Ctrl+C so ports 5173, 4000 and 8000 are free. Then, from `agrilink`:

```powershell
node scripts/dev-all.mjs
```

The launcher loads `server/.env`, reuses `MONGO_URI` for farm operations, sets internal URLs/shared secret for the child processes and starts:

| Service | URL |
| --- | --- |
| Client | http://127.0.0.1:5173 |
| Module 1 Node API | http://127.0.0.1:4000/api/health/db |
| ML | http://127.0.0.1:8000/health |
| Farm operations | http://127.0.0.1:8000/farm-operations/api/m2/health |
| Farm operations via Node | http://127.0.0.1:4000/api/m2/health |

No separate port-8100 process is needed with this launcher. Ctrl+C stops the launched stack. It checks ports and does not terminate unrelated existing processes. A separate Module 2 process remains supported by setting Node `M2_API_URL` explicitly.

## Vercel: keep the existing three projects

1. Push all changed/new source files. On the **ML project**, enable **Include source files outside Root Directory** (root is still `agrilink/services/ml`). Existing build command stays `python scripts/prepare_models.py`; it now packages Module 2 and prepares the models. No production start command.
2. Add to the **ML project**:

   ```dotenv
   M2_MONGO_URI=PASTE_THE_SAME_ATLAS_CONNECTION_STRING_USED_BY_NODE
   M2_DB_NAME=agrilink_m2
   M2_GATEWAY_SECRET=PASTE_A_RANDOM_SHARED_SECRET
   M2_PHOTO_STORE=mongodb
   M2_ALLOW_DEMO_CONTROLS=false
   M2_CV_URL=
   M2_PUBLIC_TRACE_BASE=https://YOUR-FRONTEND.vercel.app/trace
   ```

3. Generate that shared secret yourself with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. This is an internal service credential, not an API key from a company. Paste the same value on the **Node server project**:

   ```dotenv
   ML_URL=https://YOUR-ML.vercel.app
   M2_API_URL=https://YOUR-ML.vercel.app/farm-operations/api/m2
   M2_DB_NAME=agrilink_m2
   M2_GATEWAY_SECRET=THE_SAME_RANDOM_SHARED_SECRET
   SPEECH_MODE=demo
   SPEECH_DEMO_TEXT=When should I water my crop?
   ```

   Replace old localhost/private-host `M2_API_URL` values. Leaving it blank also derives the bundled URL from `ML_URL`. `M2_DB_NAME` must match on Node and Python, and both must use the same Atlas cluster. The Atlas user must have read/write access to both databases. Set the public trace base to your actual frontend domain if demonstrating QR codes.
4. Redeploy **ML first**, then **Node**, then the **client**. The client still points only at Node through `API_URL`. Never put the shared secret, MongoDB URI or provider credentials into `VITE_*` variables.
5. Check ML `/health`, ML `/farm-operations/api/m2/health`, and Node `/api/m2/health`. Then log into operations and open Supply assurance. A direct unauthenticated request to the Python `/meta` endpoint should return 401; the same route through Node should work.
6. On an older signed agreement, select **Sync farm operations**. New three-party signings do this automatically. No database reset or destructive seed is required. Previously seeded Module 2 sample data is not wiped; synchronized AgriLink entities use their own `AGL-*` IDs.

If the ML deployment hits its package-size limit, keep the same source and deploy `module2/backend` as a small separate Python service; set `M2_API_URL` to it and use the same shared secret/database. The actual Vercel build determines that limit; local tests cannot prove account-specific build capacity.

## Voice placeholders now; real provider later

`SPEECH_MODE=demo` enables the recording/upload flow without a speech API key. It returns editable `SPEECH_DEMO_TEXT`, visibly labelled as a placeholder, not recognized speech. Telegram voice replies explicitly say the audio was not transcribed. No audio download/transcription provider is called in Telegram demo mode. Browser microphone access still requires the user's permission; audio upload is an alternative.

To replace it later, add `SPEECH_API_KEY`, set `SPEECH_MODE=live`, keep the speech URL/model from `.env.example`, and redeploy Node. The placeholder is never labelled as a real transcript. Production payment and messaging providers remain simulated/unconfigured where their credentials are absent.

## Validation

`node server/scripts/check-farmops.mjs` (or run from server as `node scripts/check-farmops.mjs`) starts a temporary MongoDB replica set and the actual combined Python server, then exercises Node → Python: reference sync, shared-secret protection, all three signatures, chain-independent handoff, supply board, farmer photo prompts, real in-process CV and Mongo photo retrieval. It then runs all **57 Module 2 tests** against the isolated database. It loads no user `.env`, does not write to live Atlas, and stops its temporary services afterward.
