import { HttpError } from "../../lib/http.js";
export const speechConfigured = () => !!(process.env.SPEECH_API_KEY || process.env.GROQ_API_KEY);
export const speechMode = () => process.env.SPEECH_MODE || (speechConfigured() ? "live" : "demo");
export const demoTranscript = () => ({ text: process.env.SPEECH_DEMO_TEXT || "When should I water my crop?", provider: "demo_placeholder", demo: true, note: "Placeholder text only. Audio was not transcribed." });
const MAX_BYTES = 2 * 1024 * 1024;
export async function transcribe(bytes, { mime = "audio/ogg", language, fetchImpl = fetch } = {}) {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, "Use a voice note smaller than 2 MB", "audio_too_large");
  if (speechMode() === "demo") return demoTranscript();
  if (!speechConfigured()) throw new HttpError(503, "Voice needs SPEECH_API_KEY on the server. You can still type or use browser dictation.", "speech_not_configured");
  const form = new FormData();
  const extension = mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : mime.includes("mpeg") ? "mp3" : mime.includes("mp4") ? "m4a" : "ogg";
  form.set("file", new Blob([bytes], { type: mime }), `voice.${extension}`);
  form.set("model", process.env.SPEECH_MODEL || "whisper-large-v3-turbo"); form.set("response_format", "json");
  if (language && /^[a-z]{2}$/.test(language)) form.set("language", language);
  try {
    const url = new URL(process.env.SPEECH_API_URL || "https://api.groq.com/openai/v1/audio/transcriptions");
    if (url.protocol !== "https:") throw new Error("https_required");
    const res = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${process.env.SPEECH_API_KEY || process.env.GROQ_API_KEY}` }, body: form, signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!res.ok) throw new Error("provider_error");
    const data = await res.json(), text = typeof data.text === "string" ? data.text.trim().slice(0, 1500) : "";
    if (!text) throw new HttpError(422, "No speech was recognized. Record a clearer note or type your question.", "no_speech");
    return { text, provider: "hosted_whisper", language: language || "auto" };
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, "Voice transcription is temporarily unavailable. Type your question or retry.", "speech_unavailable"); }
}
export async function telegramVoice(audio, language, inject = {}) {
  if (!audio?.file_id || audio.duration > 90 || audio.file_size > MAX_BYTES) throw new HttpError(413, "Send a voice note under 90 seconds and 2 MB", "audio_too_large");
  if (!inject.transcribe && speechMode() === "demo") return demoTranscript();
  if (!speechConfigured() && !inject.transcribe) throw new HttpError(503, "Voice notes need server speech setup. Please type your question for now.", "speech_not_configured");
  const fetchImpl = inject.fetchImpl || fetch, token = process.env.TELEGRAM_BOT_TOKEN;
  try {
    const metadata = await fetchImpl(`https://api.telegram.org/bot${token}/getFile`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_id: audio.file_id }), signal: AbortSignal.timeout(10000), redirect: "error" });
    const result = await metadata.json(), path = result.result?.file_path;
    if (!metadata.ok || !result.ok || !path || !/^[A-Za-z0-9_./-]+$/.test(path) || path.includes("..") || result.result.file_size > MAX_BYTES) throw new Error("invalid_file");
    const response = await fetchImpl(`https://api.telegram.org/file/bot${token}/${path}`, { signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok || !response.body || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("download_failed");
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw new Error("too_large"); } chunks.push(value); }
    return await (inject.transcribe || transcribe)(Buffer.concat(chunks), { mime: audio.mime_type || "audio/ogg", language, fetchImpl });
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(503, "Could not read this voice note. Please retry or type your question.", "voice_download_failed"); }
}
