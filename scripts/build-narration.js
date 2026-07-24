// Bakes narration audio for every koan section from the same generated text the app
// renders, so the reading can never drift from what is on screen.
//
//   node scripts/build-narration.js --dry-run              totals and cost, no API calls
//   node scripts/build-narration.js --provider gemini      bake + encode everything stale
//   node scripts/build-narration.js --provider gemini --case 1
//   node scripts/build-narration.js --provider gemini --encode-only   re-encode from raw
//   node scripts/build-narration.js --force                everything, changed or not
//
// A manifest hashes text + provider + model + voice + preset + instruction version per
// unit, so a re-run only regenerates what actually changed. Editing one koan rebakes
// one file; switching provider or voice invalidates the whole book on purpose.
//
// Gemini returns raw PCM, so its pipeline has two stages: the API writes WAV into
// local/narration-raw/ (gitignored), and ffmpeg encodes that into audio/narration/.
// The stages are independent — re-encoding at a different bitrate costs nothing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import {
  MODEL, VOICE, PRESET, INSTRUCTIONS_VERSION, SECTIONS, instructionsFor,
  GEMINI_MODEL, GEMINI_VOICE, geminiPrompt,
} from './lib/narration-voice.js';
import { readKey as openaiKey, speak as openaiSpeak, MAX_INPUT } from './lib/openai-tts.js';
import { readKey as geminiKey, speak as geminiSpeak, parseWav, DailyQuotaError } from './lib/gemini-tts.js';
import { pool } from './lib/pool.js';
import { haveFfmpeg, toMp3, FFMPEG_HINT } from './lib/encode.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'audio', 'narration');
const rawDir = path.join(root, 'local', 'narration-raw');
const manifestFile = path.join(outDir, 'manifest.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

const provider = value('provider') || 'openai';
if (!['openai', 'gemini'].includes(provider)) throw new Error(`unknown provider: ${provider}`);
const gemini = provider === 'gemini';

const model = gemini ? GEMINI_MODEL : MODEL;
const voice = value('voice') || (gemini ? GEMINI_VOICE : VOICE);
const preset = value('preset') || PRESET;
const bitrate = value('bitrate') || '64k';
// Gemini's quota is per-minute and trips easily; OpenAI happily took four at once.
const jobs = Number(value('jobs') || (gemini ? 2 : 4));

const onlyCase = value('case') ? Number(value('case')) : null;
const onlySection = value('section');
const force = flag('force');
const encodeOnly = flag('encode-only');

const pad = (id) => String(id).padStart(2, '0');
const unitKey = (id, section) => `${id}:${section}`;

// One unit per non-empty section. Empty sections are skipped rather than baked to
// silence, so the runtime's queue and the manifest agree on what exists.
const units = [];
for (const id of Object.keys(CASES).map(Number).sort((a, b) => a - b)) {
  if (onlyCase && id !== onlyCase) continue;
  for (const section of SECTIONS) {
    if (onlySection && section !== onlySection) continue;
    const text = (CASES[id][section] || '').trim();
    if (!text) continue;
    const sha = (parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
    // The raw take depends on text/voice/preset but NOT bitrate — bitrate only affects
    // the mp3 encode. Keying the raw by its own hash means changing bitrate reuses the
    // cached WAV (free re-encode), while changing voice correctly forces regeneration.
    const rawHash = sha([text, provider, model, voice, preset, INSTRUCTIONS_VERSION, section]);
    const hash = sha([rawHash, bitrate]);
    units.push({
      id, section, text, hash, rawHash,
      file: `k${pad(id)}-${section}.mp3`,
      raw: `k${pad(id)}-${section}.${rawHash}.wav`,
    });
  }
}

const tooLong = units.filter((u) => u.text.length > MAX_INPUT);
if (tooLong.length) {
  console.error(`BUILD FAILED: ${tooLong.length} unit(s) exceed ${MAX_INPUT} characters:`);
  for (const u of tooLong) console.error(`  case ${u.id} ${u.section}: ${u.text.length}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
if (gemini) fs.mkdirSync(rawDir, { recursive: true });

const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : { files: {} };

const stale = units.filter((u) => {
  if (force) return true;
  const prev = manifest.files[unitKey(u.id, u.section)];
  return !prev || prev.hash !== u.hash || !fs.existsSync(path.join(outDir, prev.file));
});

const chars = stale.reduce((s, u) => s + u.text.length, 0);
console.log(`${units.length} unit(s) in scope, ${stale.length} to bake — ${chars} characters`);
console.log(`${provider} / ${model} / ${voice} / ${preset} / instructions v${INSTRUCTIONS_VERSION}`
  + (gemini ? ` / mp3 ${bitrate} from raw` : ' / mp3') + `\n`);

if (flag('dry-run')) {
  for (const u of stale) console.log(`  ${u.file.padEnd(20)} ${String(u.text.length).padStart(5)} chars`);
  process.exit(0);
}

// --- encode-only: rebuild mp3s from cached raw audio, no API calls ------------
if (encodeOnly) {
  if (!gemini) throw new Error('--encode-only only applies to providers that return raw audio');
  if (!haveFfmpeg()) { console.error(FFMPEG_HINT); process.exit(1); }
  let n = 0;
  for (const u of units) {
    const src = path.join(rawDir, u.raw);
    if (!fs.existsSync(src)) continue;
    toMp3(src, path.join(outDir, u.file), bitrate);
    const bytes = fs.statSync(path.join(outDir, u.file)).size;
    const prev = manifest.files[unitKey(u.id, u.section)] || {};
    manifest.files[unitKey(u.id, u.section)] = { ...prev, file: u.file, hash: u.hash, bytes };
    n++;
  }
  saveManifest();
  const total = Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0);
  console.log(`Re-encoded ${n} file(s) at ${bitrate} — ${(total / 1e6).toFixed(1)} MB total.`);
  process.exit(0);
}

if (!stale.length) { console.log('Nothing to do.'); process.exit(0); }

// ffmpeg is checked up front: discovering it is missing after a paid bake would be a
// bad surprise, and the raw audio would still be on disk waiting for --encode-only.
const canEncode = !gemini || haveFfmpeg();
if (gemini && !canEncode) console.log(`WARNING: ${FFMPEG_HINT}\nBaking raw audio anyway.\n`);

const key = gemini ? geminiKey() : openaiKey();
Object.assign(manifest, { provider, model, voice, preset, instructionsVersion: INSTRUCTIONS_VERSION });

// Written after every file, not once at the end: a long bake that dies partway
// otherwise leaves paid-for audio on disk that the manifest doesn't know about, and
// the next run cheerfully pays for it again.
function saveManifest() {
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

let done = 0, tokens = 0;
let quotaHit = false;
const failed = [];
await pool(stale.map((u) => async () => {
  if (quotaHit) return;                          // daily cap reached — don't start more
  try {
    let bytes, seconds = null, reused = false;
    if (gemini) {
      const rawPath = path.join(rawDir, u.raw);
      // A valid cached raw for this exact take is money already spent — reuse it and
      // skip the API. The rawHash in the filename guarantees it matches the current
      // text/voice/preset; parseWav rejects anything truncated by an interrupted run.
      let cached = null;
      if (!force && fs.existsSync(rawPath)) {
        const buf = fs.readFileSync(rawPath);
        const info = parseWav(buf);
        if (info.ok) cached = info;
      }
      if (cached) {
        seconds = cached.seconds; reused = true;
      } else {
        const r = await geminiSpeak({
          key, model, voice,
          prompt: geminiPrompt(u.section, preset, u.text),
        });
        fs.writeFileSync(rawPath, r.wav);
        seconds = r.seconds; tokens += r.tokens;
      }
      if (canEncode) {
        toMp3(rawPath, path.join(outDir, u.file), bitrate);
        bytes = fs.statSync(path.join(outDir, u.file)).size;
      } else {
        bytes = fs.statSync(rawPath).size;
      }
    } else {
      const mp3 = await openaiSpeak({
        key, model, voice, format: 'mp3',
        input: u.text,
        instructions: instructionsFor(u.section, preset),
      });
      fs.writeFileSync(path.join(outDir, u.file), mp3);
      bytes = mp3.length;
    }
    const entry = { file: u.file, hash: u.hash, bytes };
    if (seconds !== null) entry.seconds = Number(seconds.toFixed(2));
    manifest.files[unitKey(u.id, u.section)] = entry;
    saveManifest();
    console.log(`  [${++done}/${stale.length}] ${u.file} — ${(bytes / 1024).toFixed(0)} KB`
      + (seconds !== null ? ` — ${seconds.toFixed(1)}s` : '') + (reused ? ' (cached raw)' : ''));
  } catch (e) {
    if (e instanceof DailyQuotaError) {
      // The daily cap is a wall, not a hiccup: every remaining unit would hit it too.
      // Stop starting new work and let the in-flight ones drain.
      quotaHit = true;
      console.log(`  [${++done}/${stale.length}] ${u.file} — DAILY QUOTA REACHED, stopping`);
      return;
    }
    // One bad unit must not abandon the rest of a long, paid run.
    failed.push({ unit: `${u.id}:${u.section}`, error: String(e.message).slice(0, 200) });
    console.log(`  [${++done}/${stale.length}] ${u.file} — FAILED`);
  }
}), jobs);

saveManifest();

const baked = Object.keys(manifest.files).length;
const total = Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0);
console.log(`\nManifest holds ${baked} of 147 units, ${(total / 1e6).toFixed(1)} MB.`);
if (gemini) console.log(`${tokens} output tokens this run (~$${(tokens / 1e6 * 20).toFixed(2)})`);
if (quotaHit) {
  const left = stale.length - done;
  console.log(`\nStopped at the daily request cap (100/day for this preview model, even on paid Tier 1).`);
  console.log(`~${left} unit(s) still to bake. Re-run this same command after the quota resets — finished units are skipped.`);
}
if (failed.length) {
  console.log(`\n${failed.length} failed — re-run to retry just these:`);
  for (const f of failed) console.log(`  ${f.unit}: ${f.error}`);
}
