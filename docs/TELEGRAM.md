# Telegram bot foundation

**Voice update:** short linked-account voice notes now download securely from Telegram, transcribe through a hosted Whisper-compatible API, and receive a text answer with the recognized question. Set server `SPEECH_API_KEY` (Groq), optionally `SPEECH_API_URL` and `SPEECH_MODEL`; see [MORNING_CHECKLIST.md](MORNING_CHECKLIST.md). Limit: 90 seconds and 2 MB. Audio is not stored; transcripts are retained with the existing seven-day webhook update record. Without a key the bot explains that voice setup is pending and text commands keep working. Retry deduplication reuses prepared replies/transcripts. Voice never executes account-management commands.

Telegram replaces WhatsApp as the preferred channel. No WhatsApp Business account, approved templates or phone-number matching is required. Existing WhatsApp/SMS adapters remain available for legacy use, but `MESSAGING_CHANNELS=telegram` selects Telegram for normal farmer notifications.

## What is implemented

- Profile > Connect Telegram creates a random, authenticated, single-use deep link, valid for 10 minutes. Only a hash is stored in MongoDB. Telegram identities are not linked by typing a mobile number.
- The private-chat `/start` token connects the farmer account to a Telegram chat. A Telegram chat cannot belong to two farmer accounts. A farmer can disconnect/relink from Profile.
- `/requests` lists up to five open buyer requests, available quantities and portal links. Claiming/signing stays in the authenticated web portal using the same FCFS allocation rules.
- `/help`, `/status`, `/stop`, `/subscribe` and `/unlink` are supported. Text questions reuse the existing Mitra assistant in basic mode, or its configured hosted AI provider. Replies currently use each single question rather than persistent multi-turn chat history.
- New-request and supported existing farmer notification events use Telegram for linked, subscribed farmers. No notification is sent to an unlinked chat. Pausing notifications does not disable manual chat commands.
- Webhook secret verification, private-chat checks, persistent update deduplication, short processing leases, expiring link records and delivery-attempt logging are included. Group chats are ignored.
- `simulated` means nothing was sent; `sent` means Telegram accepted the message. Telegram Bot API does not provide the same delivered/read receipts as the WhatsApp adapter, so those are not claimed.
- Voice transcription is implemented with a configured speech provider. Telegram replies remain text; voice replies and direct in-chat claiming are not implemented.

## Your setup steps

1. In Telegram, open the official **@BotFather**, run `/newbot`, and choose a name and bot username. Copy its token privately. No business account is needed.
2. Set these variables in `server/.env` locally or the Node backend host's environment:

   ```dotenv
   TELEGRAM_ENABLED=true
   TELEGRAM_MODE=live
   TELEGRAM_BOT_TOKEN=
   TELEGRAM_BOT_USERNAME=
   TELEGRAM_WEBHOOK_SECRET=
   MESSAGING_CHANNELS=telegram
   PUBLIC_API_URL=https://YOUR-API.onrender.com
   PUBLIC_APP_URL=https://YOUR-APP.vercel.app
   ```

   Fill in the token from BotFather, the username without `@`, and a separate random webhook secret. Generate a suitable secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Do not reuse the bot token or JWT secret as the webhook secret.

3. Restart/redeploy Node. Run `npm run db:init` once to explicitly create/update the new Telegram collections/indexes on the configured database. This retains existing data. Transaction support is already required by FCFS/account linking.
4. From `agrilink/server`, with the same environment configured, run:

   ```powershell
   npm run telegram:setup
   npm run telegram:status
   ```

   Setup verifies the token/username, registers the public HTTPS webhook and bot commands. These commands contact Telegram; they are supplied for you to run after configuring your bot. No real bot has been registered or messaged during implementation.

5. Sign into the farmer portal, open **Profile > Telegram notifications & Mitra chat**, select **Connect Telegram**, open the private link and press **Start**. Return to Profile and refresh if necessary; the connection also refreshes every 15 seconds.
6. Type `/requests` or a farming question in Telegram. Post a requirement from a buyer session; the connected farmer should receive a Telegram notification with a portal link. Confirm it against the message log rather than assuming delivery from a successful buyer post.

Local Telegram webhooks need a public HTTPS tunnel to the Node server. Telegram cannot call `localhost`. For hosted use, register the **Node API** URL, never the frontend or ML URL. A tunnel URL change requires registering the webhook again.

`TELEGRAM_MODE=simulated` is useful for development: updates can be processed and logs created without sending messages. A real user will not receive bot replies until live mode and a valid token are configured. All Telegram secrets stay on Node; the client and ML environment files need no bot credentials.

## API endpoints

| Endpoint | Access / purpose |
| --- | --- |
| `POST /api/telegram/webhook` | Telegram secret header required; handles updates |
| `GET /api/telegram/bot` | Public bot link only; no token |
| `GET /api/telegram/status` | Authenticated farmer; connection/configuration state only |
| `POST /api/telegram/link` | Authenticated farmer; new expiring connection link |
| `DELETE /api/telegram/link` | Authenticated farmer; disconnect and revoke pending links |
| `PATCH /api/telegram/preferences` | Authenticated farmer; `{ "enabled": true/false }` |

The webhook checks `X-Telegram-Bot-Api-Secret-Token`, acknowledges only after processing, and lets Telegram retry transient failures. Completed update IDs are ignored on retry. Prepared replies are retained so a send failure does not rerun a completed linking/command action. As with most external messaging APIs, an ambiguous network timeout after provider acceptance can still produce a duplicate reply on retry; this is not a promise of exactly-once delivery. Keep a single bot/backend deployment for this foundation.

The existing application login remains demo authentication. Deep-link security depends on the web account session; shared demo accounts are not private production identities. Do not share connection links or use shared demo identities for real confidential data.

References: [Telegram bots](https://core.telegram.org/bots), [Bot API/webhook secret](https://core.telegram.org/bots/api#setwebhook), [bot deep links](https://core.telegram.org/bots/features#deep-linking).
