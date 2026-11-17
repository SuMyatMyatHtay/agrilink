import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribe, telegramVoice } from "../src/modules/assistant/speech.js";

test("speech: provider configuration, multipart language, bounded audio and safe errors", async () => {
  const saved = { SPEECH_API_KEY: process.env.SPEECH_API_KEY, GROQ_API_KEY: process.env.GROQ_API_KEY, SPEECH_MODE: process.env.SPEECH_MODE };
  delete process.env.SPEECH_API_KEY; delete process.env.GROQ_API_KEY;
  try {
    process.env.SPEECH_MODE = "demo";
    assert.equal((await transcribe(Buffer.from("recorded demo audio"))).demo, true);
    process.env.SPEECH_MODE = "live";
    await assert.rejects(transcribe(Buffer.from("audio")), { code: "speech_not_configured" });
    process.env.SPEECH_API_KEY = "test-private-speech-token";
    const output = await transcribe(Buffer.from("audio"), { language: "pa", mime: "audio/webm", fetchImpl: async (url, options) => {
      assert.equal(url.protocol, "https:"); assert.equal(options.body.get("language"), "pa"); assert.equal(options.body.get("model"), "whisper-large-v3-turbo");
      assert.equal(options.body.get("file").name, "voice.webm");
      return Response.json({ text: "When should I irrigate?" });
    } });
    assert.equal(output.text, "When should I irrigate?");
    await assert.rejects(transcribe(Buffer.alloc(2 * 1024 * 1024 + 1)), { code: "audio_too_large" });
    await assert.rejects(transcribe(Buffer.from("audio"), { fetchImpl: async () => { throw new Error(process.env.SPEECH_API_KEY); } }), error => error.code === "speech_unavailable" && !error.message.includes(process.env.SPEECH_API_KEY));
    await assert.rejects(transcribe(Buffer.from("audio"), { fetchImpl: async () => Response.json({ text: " " }) }), { code: "no_speech" });
    let requests = 0;
    const voice = await telegramVoice({ file_id: "voice-file", duration: 5, file_size: 5 }, "hi", {
      fetchImpl: async () => ++requests === 1 ? Response.json({ ok: true, result: { file_path: "voice/file.oga", file_size: 5 } }) : new Response(Buffer.from("audio")),
      transcribe: async (bytes, options) => { assert.equal(bytes.toString(), "audio"); assert.equal(options.language, "hi"); return { text: "A voice farming question" }; },
    });
    assert.equal(voice.text, "A voice farming question");
    await assert.rejects(telegramVoice({ file_id: "voice", duration: 91 }), { code: "audio_too_large" });
    await assert.rejects(telegramVoice({ file_id: "voice", duration: 2 }, "en", { fetchImpl: async () => Response.json({ ok: true, result: { file_path: "../secret" } }) }), { code: "voice_download_failed" });
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
