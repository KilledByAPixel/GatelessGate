// Minimal OpenAI text-to-speech client. Plain fetch — the repo has no dependencies
// and this work keeps it that way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENDPOINT = 'https://api.openai.com/v1/audio/speech';

// The documented input ceiling is 4096 characters. We assert well under it so a
// too-long unit fails loudly here rather than being silently truncated upstream.
export const MAX_INPUT = 4000;

export function readKey() {
  const env = process.env.OPENAI_API_KEY;
  if (env && env.trim()) return env.trim();
  const file = path.join(root, 'local', 'openai-key.txt');
  if (fs.existsSync(file)) {
    const k = fs.readFileSync(file, 'utf8').trim();
    if (k) return k;
  }
  throw new Error('No API key: set OPENAI_API_KEY or put the key in local/openai-key.txt');
}

// One request -> mp3 bytes. Retries 429 and 5xx with exponential backoff; 4xx that
// isn't rate limiting is a real mistake and throws immediately.
export async function speak({ key, model, voice, input, instructions, format = 'mp3', tries = 4 }) {
  if (input.length > MAX_INPUT) throw new Error(`input too long: ${input.length} > ${MAX_INPUT}`);
  let wait = 1000;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input, instructions, response_format: format }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());

    const body = await res.text().catch(() => '');
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= tries) {
      throw new Error(`TTS ${res.status}: ${body.slice(0, 400)}`);
    }
    await new Promise((r) => setTimeout(r, wait));
    wait *= 2;
  }
}
