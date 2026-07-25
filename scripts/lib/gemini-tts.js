// Gemini text-to-speech adapter, shaped like openai-tts.js so the audition and bake
// scripts can treat providers interchangeably.
//
// Two things differ from OpenAI and drive the design here:
//   1. Delivery direction is not a separate parameter — it goes in the prompt, above
//      a literal "#### TRANSCRIPT" divider that separates direction from spoken text.
//   2. The response is raw 16-bit PCM (audio/l16), not a compressed file, so callers
//      get WAV back and encode to mp3 downstream.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export const TRANSCRIPT_DIVIDER = '#### TRANSCRIPT';

export function readKey() {
  const env = process.env.GEMINI_API_KEY;
  if (env && env.trim()) return env.trim();
  const file = path.join(root, 'local', 'gemini-key.txt');
  if (fs.existsSync(file)) {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (k) return k;
  }
  throw new Error('No API key: set GEMINI_API_KEY or put the key in local/gemini-key.txt');
}

// Validates and reads a .wav — both the minimal ones this module writes and the ones
// ffmpeg produces (loudnorm output), which carry extra header chunks (fact, LIST) so
// the audio does not sit at a fixed offset. It walks the RIFF subchunks to find `fmt `
// and `data` rather than assuming positions. It deliberately rejects anything truncated
// (e.g. a file half-written when a bake was killed): a declared data size that overruns
// the actual bytes means the tail is missing.
export function parseWav(buf) {
  if (!buf || buf.length < 12) return { ok: false };
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return { ok: false };
  let channels = 0, rate = 0, bits = 0, dataOffset = 0, dataBytes = 0;
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ' && body + 16 <= buf.length) {
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === 'data') {
      dataOffset = body;
      dataBytes = size;
      break;                              // audio found; no need to walk further
    }
    p = body + size + (size & 1);         // chunks are word-aligned
  }
  if (!channels || !rate || !bits || !dataOffset) return { ok: false };
  if (dataBytes <= 0 || dataOffset + dataBytes > buf.length) return { ok: false };   // truncated
  return { ok: true, rate, channels, bits, dataOffset, dataBytes, seconds: dataBytes / (rate * channels * bits / 8) };
}

// Butt-join several 16-bit mono WAVs into one, with a short silence at each seam.
// Speech seams don't blend like music, so a clean cut plus a natural pause beats a
// crossfade — and the gap doubles as the paragraph breath the split fell on anyway.
export function concatWavs(buffers, { gapMs = 300, rate = 24000 } = {}) {
  const gap = Buffer.alloc(Math.round(rate * gapMs / 1000) * 2);   // 16-bit mono zeros
  const parts = [];
  buffers.forEach((buf, i) => {
    const info = parseWav(buf);
    if (!info.ok) throw new Error('concatWavs: a chunk is not a valid wav');
    parts.push(buf.subarray(info.dataOffset, info.dataOffset + info.dataBytes));
    if (i < buffers.length - 1) parts.push(gap);
  });
  return wav(Buffer.concat(parts), rate, 1);
}

// 16-bit mono PCM -> a playable .wav. Written by hand so the repo stays dependency-free.
export function wav(pcm, rate = 24000, channels = 1, bits = 16) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);                                  // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * bits / 8, 28);
  h.writeUInt16LE(channels * bits / 8, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// The audio lives at steps[].content[].type === 'audio'. Located by walking rather
// than by fixed index, so an extra step or content part doesn't break the bake.
function findAudioPart(json) {
  for (const step of json.steps || []) {
    for (const part of step.content || []) {
      if (part && part.type === 'audio' && part.data) return part;
    }
  }
  return null;
}

// One request -> { wav, seconds, tokens }. Retries 429 and 5xx with exponential
// backoff; other 4xx are real mistakes and throw immediately.
// Raised so callers can tell a "come back tomorrow" cap apart from a transient
// per-minute 429 and abort the whole run instead of retrying every unit into the wall.
export class DailyQuotaError extends Error {
  constructor(message) { super(message); this.name = 'DailyQuotaError'; this.daily = true; }
}

export async function speak({ key, model, prompt, voice, tries = 5 }) {
  // A per-minute 429 needs to be waited out rather than retried promptly — start well
  // above the second-scale backoff a 5xx would want.
  let wait = 5000;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: prompt,
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice }] },
      }),
    });

    if (res.ok) {
      const json = await res.json();
      const part = findAudioPart(json);
      if (part) {
        const pcm = Buffer.from(part.data, 'base64');
        const rate = part.sample_rate || 24000;
        const channels = part.channels || 1;
        return {
          wav: wav(pcm, rate, channels),
          seconds: pcm.length / (rate * channels * 2),
          tokens: (json.usage && json.usage.total_output_tokens) || 0,
        };
      }
      // Google documents that the model occasionally returns text tokens instead of
      // audio on a small random fraction of requests — a 200 with no audio part. They
      // recommend automated retry; treat it exactly like a transient server error.
      if (attempt >= tries) throw new Error(`no audio in response after ${tries} tries: ${JSON.stringify(json).slice(0, 200)}`);
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }

    const body = await res.text().catch(() => '');
    // A daily-quota 429 will not clear for hours — retrying it just burns wall-clock,
    // and every other unit will hit the same wall. Surface it so the run stops at once.
    if (res.status === 429 && /per_?day|per day|requests_per_model_per_day/i.test(body)) {
      throw new DailyQuotaError(`Gemini daily request quota reached: ${body.slice(0, 400)}`);
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= tries) throw new Error(`Gemini TTS ${res.status}: ${body.slice(0, 400)}`);
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
}
