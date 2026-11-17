# Morning checklist — presentation demo

**Latest connection fix:** farm operations now ships inside the existing ML deployment. Start with [MODULE_CONNECTIONS.md](MODULE_CONNECTIONS.md) for the shared database/secret settings and the one-command local launcher. Voice defaults to a clearly labelled placeholder demo when no provider is configured; set `SPEECH_MODE=live` to use real transcription.

The new workflows are implemented locally in the existing AgriLink app. They are **not automatically deployed**. The existing hosted frontend and MongoDB health endpoint were checked successfully during development; no production database reset, real payment, real bot message or public-chain transaction was performed.

## Do these first

1. Commit/push the workspace changes to the repository connected to Vercel. Check the repository shown in Vercel against `git remote -v`; the original repository link and local Git remote have differed during this project. Deploy both **client** (`agrilink/client`) and **server** (`agrilink/server`). Deploy ML (`agrilink/services/ml`) if its latest inference configuration is not deployed yet.
2. Server Vercel variables must include your existing `MONGO_URI`, `JWT_SECRET`, `ML_URL`, Telegram variables, `PUBLIC_API_URL` and `PUBLIC_APP_URL`. Client uses server-only `API_URL=https://agrilink-server.vercel.app` and `VITE_REALTIME_URL=disabled`. Keep secrets out of `VITE_*` and Git.
3. From `agrilink/server`, with your local `.env` pointing to the same Atlas database, run `npm run db:init`. It creates collections/indexes and preserves existing records. **Do not run destructive demo seed/reset scripts.**
4. Check backend `/api/health/db` and ML `/health`. Sign into the farmer, buyer and officer in separate browser profiles/tabs. Reuse the FPO witness assignment instructions in [FPO_WITNESS.md](FPO_WITNESS.md).
5. For Telegram, run `npm run telegram:status`. If `webhookUrl` is empty or points to another backend, run `npm run telegram:setup` then check status again. No webhook change is required just to support voice messages: the existing `message` subscription includes them.

## What is now implemented

| Feature | Where to demonstrate | What it actually does |
| --- | --- | --- |
| Voice chatbot | Farmer → More tools → Planning & advice → Ask Mitra; linked Telegram bot | Browser dictation where supported; recorded/uploaded web audio and Telegram voice notes through a configured hosted transcription API. User can review web transcripts. Telegram echoes the recognized question and replies in text. No fabricated transcripts. |
| Retrieval-assisted answers | Ask Mitra → Reference sources | Searches the bundled curated guide for relevant passages, supplies them with the farmer's private records to the configured AI, and returns source IDs. No matching passage prompts referral to the farmer doctor. Basic mode remains available without an AI key. The guide is a prototype source, not an independently certified IARI corpus. |
| Simulated escrow | Agreement → Quality, delivery & escrow | Database-backed ledger: simulate deposit → 50% advance → graded shipment → receipt → accept/dispute → proportional settlement/refund. FPO/doctor resolves disputes; remaining funds freeze while disputed. Balances must conserve the simulated deposit. No money moves. |
| Two-way ratings | Same workspace, after settlement | Buyer rates farmer; farmer rates buyer. One rating per person per agreement version. Stored in MongoDB, not hard-coded cards. These are demo-workflow ratings, not real commercial performance evidence. |
| Rating-based allocation | Buyer → Post requirement → Optional allocation & pricing | Optional policy. Farmers apply; buyer views ranked candidates and awards the highest eligible one. Uses recorded delivery ratings, a transparent prior, current capacity and atomic quantity reservation. Every fifth award prioritizes an eligible newcomer. Ordinary requests remain FCFS. |
| Blockchain integration | Agreements → Blockchain status / signed agreement → retry registration | Portable registry address/ABI works on hosted Node; invalid optional configuration no longer takes down the API. Actual local EVM deployment, registration, lookup and linked amendments were tested. Public Amoy anchoring still needs your RPC, funded test wallet and deployed registry. |
| Demo integrity proof | Agreement → Quality, delivery & escrow → Document integrity proof | Explicitly labelled MongoDB hash ledger; records signed-PDF hashes and links preserved amendments. Verify original versus a modified copy. This does **not** set public-blockchain registration status or pretend MongoDB is externally immutable. |
| Live image grading | Same workspace → Analyze a crop photo | Sends a resized real image to the hosted ML `/vision/analyze` service. Returns actual colour/blemish measurements and a provisional grade, then requires human confirmation. If ML is unavailable it returns an error; it does not silently manufacture a result. |
| Demo image grading | Try Grade A scenario / damaged crop | Clearly labelled illustrative values, usable to rehearse quality review and escrow without a live ML service. These samples are excluded from training. |
| Automatic learning | FPO/doctor confirms a usable real-photo assessment | Stores the human label and measured features in MongoDB and rebuilds a lightweight nearest-centroid classifier. At least four unique photo examples across two grades activate learned suggestions. State persists across Vercel cold starts. This is real prototype learning, not deep-model fine-tuning or validated grading accuracy. |

The integrated workspace uses the existing Node/Atlas stack and does not depend on Module 2 being online. Existing Module 2 pages and its separate Python service remain available; its monthly ratings/escrow are separate legacy workflows, not the data source for this new demonstration.

## Fast rehearsal: no new payment or blockchain account required

1. Operations → **Farmers → FPO witness assignments**: assign the officer account to the demo farmer.
2. Buyer posts an ordinary FCFS requirement. Farmer views the red alert and claims a small quantity.
3. Buyer sends the draft for signature. Buyer and farmer sign; the assigned FPO officer countersigns. Use the configured demo OTP (default `1234`); no SMS identity verification is claimed.
4. Open **Quality, delivery & escrow** on the agreement.
5. Farmer selects **Try Grade A scenario · demo**. Officer opens the same workspace, reviews it and confirms Grade A with a note. Say “illustrative assessment, human confirmation.”
6. Buyer selects **Simulate buyer funding**, then **Release simulated 50% advance**.
7. Farmer enters shipped kilograms and records dispatch. Try less than the ordered quantity to demonstrate proportional settlement. The latest assessment must be confirmed and meet the grade; an older pass cannot bypass a newer failed/pending check.
8. Buyer confirms receipt, then accepts delivery. Alternatively open a dispute, switch to the FPO account, and resolve it. Show the held/paid/refunded balances and ledger. Explain that all values are simulated, with no bank movement. Any advance exceeding the shipped value is shown as owed, not falsely recovered.
9. Buyer and farmer each submit a rating. Ratings unlock only after settlement.
10. In **Document integrity proof**, record the demo proof. Verify the original PDF, then test a modified copy. Explain that the demo ledger proves the file matches the app's saved record; only a configured public-chain transaction provides public anchoring.
11. Buyer posts a **rating-based** requirement. A rated farmer and an unrated farmer apply. Buyer opens **View applicants** and awards the recommended candidate. The application becomes a reserved claim/draft agreement; all three signatures are still needed.

## Enable hosted voice

1. Go to https://console.groq.com/keys and create an API key on your account.
2. Add these to the Vercel **server** project and local `server/.env`, then redeploy the server:

   ```dotenv
   SPEECH_API_KEY=your_private_groq_key
   SPEECH_MODE=live
   SPEECH_API_URL=https://api.groq.com/openai/v1/audio/transcriptions
   SPEECH_MODEL=whisper-large-v3-turbo
   ```

3. Web: open Ask Mitra → Voice note, choose Hindi/Punjabi/English or automatic detection, allow microphone permission, record a short question, stop, review the transcript and send it. Uploading an audio file is also supported.
4. Telegram: connect from farmer Profile, press Start, then send a short voice note. Limit: **90 seconds and 2 MB** (web recording stops at one minute). Audio is processed transiently; Telegram update transcripts expire with the existing seven-day TTL record. Replies are text.
5. Without a speech key, supported Chrome/Edge browser dictation beside the message input still works using the selected voice language. It depends on browser/platform recognition and microphone permission. Hosted recording/upload and Telegram transcription explain that setup is missing; text chat keeps working.
6. Punjabi speech recognition and answer quality need an actual spoken-language rehearsal. With no configured AI provider, the basic helper falls back to available built-in languages; do not claim a fully translated Punjabi chatbot on that basis. Browser read-aloud depends on installed voices.

Provider reference: https://console.groq.com/docs/speech-to-text . No new OpenAI SDK/dependency is required.

## Show live grading and automatic learning

1. Set server `ML_URL` to the public deployed ML origin (no `/api` suffix); check that ML `/health` responds. The image-analysis service needs no new paid API key.
2. Farmer opens the signed agreement → **Quality, delivery & escrow → Analyze a crop photo** and uploads a clear mango photo. The browser resizes it; the ML service measures visible blemishes/colour and returns a provisional grade.
3. The assigned FPO officer/doctor opens the same workspace, views the submitted image, selects the confirmed grade and records the inspection note. Real usable photo labels rebuild the persisted prototype classifier immediately.
4. Repeat with **four distinct usable real photos across at least two confirmed grades**. The learning panel displays the sample count and revision, then “learned grader active.” Submit another photo to see its learned suggestion alongside the baseline measurement grade. Choose grades based on inspection, not just to satisfy the threshold.
5. Illustrated Grade A/damaged scenarios are excluded from this real-photo training set. If you only have time for the no-key rehearsal, demonstrate those scenarios and describe the live learning pipeline without claiming that the model has already been trained on your fruit. No model accuracy claim is established by four examples.

## Enable public blockchain anchoring, if time permits

Follow the dedicated test-wallet/Amoy deployment steps in [PRESENTATION_READINESS.md](PRESENTATION_READINESS.md). Set server `CHAIN_ENABLED=true`, `CHAIN_ID=80002`, `CHAIN_RPC`, `CHAIN_PRIVATE_KEY`, `CHAIN_CONTRACT_ADDRESS`, then redeploy. Use a test-only wallet funded with **test POL**, never the published Hardhat key on a public network. Check that network status shows the actual deployed address and block. Sign an agreement and show its real transaction in https://amoy.polygonscan.com/ .

If those accounts/funds are unavailable, keep `CHAIN_ENABLED=false`, show the demo integrity proof, and describe public anchoring as a configured integration rather than claim a live public-chain transaction. The app still signs and stores PDFs. Local engineering check: from `blockchain`, `npm ci` / `npm run compile`, then from `server`, `node scripts/check-chain.mjs`; it starts and stops an isolated local EVM and uses no live wallet or database.

## Presentation wording

- “Working mango prototype; Pusa Sarda melon is our proposed pilot.” The project has not been relabelled into an unvalidated melon grader.
- “Web and Telegram text/voice integration; hosted transcription enabled with a provider key.” WhatsApp/SMS are not the selected demo channels.
- “Simulated escrow workflow with a persistent ledger, disputes and proportional settlement.” No real payments or fees are charged.
- “Optional rating-based allocation with newcomer priority, alongside FCFS.” It is no longer only a roadmap screen.
- “Live image measurements plus human-reviewed prototype learning.” No claimed Brix-from-photo, clinical disease diagnosis, production accuracy or deep-model retraining.
- “Actual EVM registry integration tested locally; public Amoy anchoring requires deployment. A separate labelled demo hash ledger supports the presentation without that setup.”

## Validation and remaining limits

Validation includes the backend regression suite, new isolated quality/escrow/rating/allocation/proof integration test, speech provider/Telegram mocks, retrieval tests, client production build, 43 ML tests, and an actual isolated EVM deployment/registration/amendment check. A real Chrome rehearsal covers buyer/farmer/officer actions, desktop/mobile layout and genuine/modified PDF checks. Mocked speech tests do not prove real microphone recognition or the account's provider quota. Public Amoy and real Telegram voice are not exercised without your credentials/setup.

Existing demo authentication and desk switching are still prototype access policies. The FPO witness adds accountability but does not replace production identity/authentication. The gallery's learner is a small demonstration classifier; do not describe it as validated field AI. Keep the live provider setup as an optional enhancement to the rehearsable demo.
