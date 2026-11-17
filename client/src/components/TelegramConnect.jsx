import { useState } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { ErrorBox } from "./ui.jsx";

export default function TelegramConnect() {
  const status = useApi("/telegram/status", { refreshMs: 15000 });
  const [link, setLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const act = async (fn) => {
    setBusy(true); setError(null);
    try { await fn(); await status.reload(); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  };
  const s = status.data;
  return <section className="card" aria-labelledby="telegram-title">
    <h3 id="telegram-title">Telegram notifications &amp; Mitra chat</h3>
    <p className="note">Get new buyer requests on Telegram and ask Mitra questions. {s?.voiceMode === "demo" ? "Voice demo uses labelled placeholder text; audio is not transcribed." : s?.voiceConfigured ? "Short voice notes are transcribed and answered in text." : "Text chat is available when linked; voice notes need speech-provider setup."} Claims are confirmed in the AgriLink portal.</p>
    <ErrorBox error={error || status.error} />
    {!s ? <p className="note">Checking connection…</p> : !s.configured ? <p className="note">Telegram is not available yet. You will still receive notifications in AgriLink.</p> : <>
      {s.mode === "simulated" && <p className="insight">Demo mode: Telegram messages are simulated, not sent.</p>}
      <p><b>{s.linked ? `Connected${s.notificationsEnabled ? "" : " — notifications paused"}` : "Not connected"}</b></p>
      {!s.linked ? <>
        <button type="button" className="btn" disabled={busy} onClick={() => act(async () => setLink((await api("/telegram/link", { method: "POST" })).link))}>{busy ? "Preparing…" : "Connect Telegram"}</button>
        {link && <p><a href={link} target="_blank" rel="noopener noreferrer">Open Telegram and press Start</a><span className="note" style={{ display: "block", marginTop: 6 }}>This private connection link expires in 10 minutes. Do not share it.</span></p>}
      </> : <div className="page-actions">
        <a className="btn alt" href={`https://t.me/${s.username}`} target="_blank" rel="noopener noreferrer">Open Mitra in Telegram</a>
        <button type="button" className="btn alt" disabled={busy} onClick={() => act(() => api("/telegram/preferences", { method: "PATCH", body: { enabled: !s.notificationsEnabled } }))}>{s.notificationsEnabled ? "Pause notifications" : "Resume notifications"}</button>
        <button type="button" className="btn alt" disabled={busy} onClick={() => { if (window.confirm("Disconnect Telegram from your AgriLink account?")) act(async () => { await api("/telegram/link", { method: "DELETE" }); setLink(null); }); }}>Disconnect</button>
      </div>}
    </>}
  </section>;
}
