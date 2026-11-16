import { ProviderError } from "../messaging/providers.js";
export const telegramEnabled = () => process.env.TELEGRAM_ENABLED === "true";
export const telegramMode = () => process.env.TELEGRAM_MODE === "live" ? "live" : "simulated";
export const botUsername = () => (process.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, "").trim();
export function telegramProvider(fetchImpl = fetch) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  return { name: "telegram", configured: telegramEnabled() && !!token,
    async sendText({ to, text }) {
      let response, data;
      try {
        response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: to, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(12000) });
        data = await response.json();
      } catch { throw new ProviderError("Telegram request failed", { retryable: true }); }
      if (!response.ok || !data.ok) throw new ProviderError(`Telegram rejected the message (${data.error_code || response.status})`, { retryable: response.status === 429 || response.status >= 500, code: data.error_code || response.status });
      return { providerId: String(data.result.message_id) };
    },
  };
}
