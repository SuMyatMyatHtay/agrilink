// Run manually after configuring secrets. No credentials are placed in CLI arguments or logs.
const token = process.env.TELEGRAM_BOT_TOKEN;
async function call(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error("Telegram API rejected the setup request");
  return data.result;
}
try {
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in server/.env or the backend host");
  if (process.argv[2] === "status") {
    const result = await call("getWebhookInfo");
    console.log(JSON.stringify({ webhookUrl: result.url, pendingUpdates: result.pending_update_count, lastError: result.last_error_message || null }));
  } else {
    const base = new URL(process.env.PUBLIC_API_URL);
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.pathname !== "/") throw new Error("PUBLIC_API_URL must be a public HTTPS origin, without /api");
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) throw new Error("Set TELEGRAM_WEBHOOK_SECRET to 1-256 letters, digits, underscores or hyphens");
    if (process.env.TELEGRAM_ENABLED !== "true") throw new Error("Set TELEGRAM_ENABLED=true before registering the webhook");
    const bot = await call("getMe");
    if (bot.username !== (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "")) throw new Error("TELEGRAM_BOT_USERNAME does not match this token's bot");
    await call("setWebhook", { url: `${base.origin}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message"], max_connections: 10 });
    await call("setMyCommands", { commands: [
      ["start", "Connect to AgriLink"], ["requests", "View open buyer requests"], ["status", "Account status"],
      ["stop", "Pause notifications"], ["subscribe", "Resume notifications"], ["unlink", "Disconnect account"], ["help", "Show commands"],
    ].map(([command, description]) => ({ command, description })) });
    console.log("Telegram webhook and commands registered. Link the farmer account from Profile and press Start in Telegram.");
  }
} catch (error) {
  // Network errors may contain the URL (and token); never print the original fetch error.
  console.error(error.cause ? "Telegram setup could not reach the API" : error.message?.includes(token) ? "Telegram setup failed" : error.message);
  process.exitCode = 1;
}
