import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import OpenAI from "openai";

const SILENCE_RMS_THRESHOLD = 0.01;
const MAX_PREV_TEXT_LENGTH = 500;
const WAV_HEADER_BYTES = 44;

function computeRms(buffer: ArrayBuffer): number {
  if (buffer.byteLength <= WAV_HEADER_BYTES) return 0;
  const view = new DataView(buffer);
  const sampleCount = (buffer.byteLength - WAV_HEADER_BYTES) / 2;
  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = view.getInt16(WAV_HEADER_BYTES + i * 2, true) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

const groq = new OpenAI({
  apiKey: env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const route = new Hono();

route.post("/", async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ error: "Invalid form data" }, 400);
  }

  const audioEntry = formData.get("audio");
  const rawIndex = formData.get("chunkIndex");
  const previousText = (formData.get("previousText") as string | null) ?? "";

  if (!(audioEntry instanceof File)) {
    return c.json({ error: "audio field is required" }, 400);
  }
  if (rawIndex === null || Number.isNaN(Number(rawIndex))) {
    return c.json({ error: "chunkIndex is required" }, 400);
  }

  const chunkIndex = Number(rawIndex);
  const arrayBuffer = await audioEntry.arrayBuffer();
  const rms = computeRms(arrayBuffer);

  if (rms < SILENCE_RMS_THRESHOLD) {
    return c.json({ chunkIndex, text: "", isSilent: true, rms });
  }

  const contextPrompt = previousText.slice(-MAX_PREV_TEXT_LENGTH).trim();

  try {
    const audioFile = new File([new Uint8Array(arrayBuffer)], "audio.wav", {
      type: "audio/wav",
    });

    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      temperature: 0,
      ...(contextPrompt ? { prompt: contextPrompt } : {}),
    });

    return c.json({
      chunkIndex,
      text: transcription.text.trim(),
      isSilent: false,
      rms,
      duration: transcription.duration ?? 0,
      words: transcription.words ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    return c.json({ error: message }, 500);
  }
});

export default route;
