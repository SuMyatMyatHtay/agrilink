import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { useApi } from "../hooks/useApi.js";

export default function VoiceNote({ onTranscript, onLanguage, disabled }) {
  const status = useApi("/speech/status");
  const [language, setLanguage] = useState("");
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const available = status.data?.configured || status.data?.mode === "demo";
  const recorder = useRef(null), stream = useRef(null), timer = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; clearTimeout(timer.current); if (recorder.current?.state === "recording") recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  const upload = async file => {
    if (!file || !alive.current) return;
    if (file.size > 2 * 1024 * 1024) return setError("Use an audio file smaller than 2 MB.");
    setBusy(true); setError("");
    try {
      const audio = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      const result = await api("/speech/transcribe", { method: "POST", body: { audio, ...(language && { language }) } });
      if (alive.current) { onTranscript(result.text); setNotice(result.demo ? "Demo placeholder loaded. Your audio was not transcribed. Edit the question before sending." : "Transcript loaded. Review the question before sending."); }
    } catch (e) { if (alive.current) setError(e.message || "Voice transcription failed. You can still type."); }
    finally { if (alive.current) setBusy(false); }
  };
  const record = async () => {
    if (recording) { if (recorder.current?.state === "recording") recorder.current.stop(); return; }
    try {
      setError("");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(m => MediaRecorder.isTypeSupported(m));
      const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined), chunks = [];
      recorder.current = instance;
      instance.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      instance.onstop = () => { clearTimeout(timer.current); media.getTracks().forEach(t => t.stop()); if (alive.current) { setRecording(false); upload(new Blob(chunks, { type: instance.mimeType || "audio/webm" })); } };
      instance.start(); setRecording(true); timer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, 60000);
    } catch { stream.current?.getTracks().forEach(t => t.stop()); setError("Microphone unavailable. Allow microphone access or upload an audio file."); }
  };
  return <details style={{ padding: "10px 16px", borderTop: "1px solid var(--line)", background: "var(--card)" }}>
    <summary style={{ cursor: "pointer", color: "var(--brand)", fontWeight: 600 }}>Voice note · Hindi, Punjabi &amp; other languages</summary>
    <p className="note">{status.data?.mode === "demo" ? "Demo mode: recording loads editable placeholder text. Audio is not transcribed. Real transcription can be enabled later." : status.data?.configured ? "Record or upload a short voice note. Review the transcript before sending." : "Voice provider is not configured. You can still type or use supported browser dictation."}</p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <select aria-label="Voice language" style={{ width: "auto" }} value={language} onChange={e => { setLanguage(e.target.value); onLanguage?.(e.target.value); }}><option value="">Detect language</option><option value="hi">Hindi</option><option value="pa">Punjabi</option><option value="en">English</option><option value="mr">Marathi</option></select>
      {typeof MediaRecorder !== "undefined" && <button type="button" className="btn alt small" disabled={busy || disabled || !available} onClick={record}>{recording ? status.data?.mode === "demo" ? "Stop & load demo text" : "Stop & transcribe" : busy ? "Processing..." : "Record voice"}</button>}
      <label className="btn alt small" style={{ margin: 0 }}>Upload audio<input aria-label="Upload voice note" type="file" accept="audio/ogg,audio/mpeg,audio/wav,audio/webm,audio/mp4,audio/x-m4a" hidden disabled={busy || disabled || !available} onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
    </div>
    {recording && <p role="status" className="note">Recording. Stops automatically after one minute.</p>}
    {error && <p role="alert" className="down">{error}</p>}
    {notice && <p role="status" className="note">{notice}</p>}
  </details>;
}
