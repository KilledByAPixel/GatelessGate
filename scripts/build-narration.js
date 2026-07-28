// Bakes narration audio for every koan section from the same generated text the app
// renders, so the reading can never drift from what is on screen.
//
//   node scripts/build-narration.js --dry-run     totals and cost, no API calls
//   node scripts/build-narration.js               bake + encode everything stale
//   node scripts/build-narration.js --case 1
//   node scripts/build-narration.js --encode-only re-encode from raw
//   node scripts/build-narration.js --force       everything, changed or not
//   node scripts/build-narration.js --provider openai   the older backend
//
// The defaults are whatever the book currently ships (see PROVIDER in
// lib/narration-voice.js), so a bare run with no flags bakes nothing.
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
import MATTER from '../src/koans/text/matter.js';
import {
  PROVIDER, MODEL, VOICE, PRESET, INSTRUCTIONS_VERSION, SECTIONS, instructionsFor,
  GEMINI_MODEL, GEMINI_VOICE, GEMINI_PRESET, geminiPrompt,
} from './lib/narration-voice.js';
import { readKey as openaiKey, speak as openaiSpeak, MAX_INPUT } from './lib/openai-tts.js';
import { readKey as geminiKey, speak as geminiSpeak, parseWav, concatWavs, DailyQuotaError } from './lib/gemini-tts.js';
import { pool } from './lib/pool.js';
import { haveFfmpeg, toMp3, loudnormWav, FFMPEG_HINT } from './lib/encode.js';
import { chunkText } from './lib/chunk.js';

// A section longer than this is generated in paragraph-aligned pieces and stitched,
// because Gemini's audio quality drifts (volume/whisper decay) past ~1 minute of
// output. ~650 chars stays comfortably under that at the British reading pace.
const CHUNK_MAX_CHARS = 650;
const GAP_MS = 300;   // silence at each seam — also the paragraph breath

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'audio', 'narration');
const rawDir = path.join(root, 'local', 'narration-raw');
const manifestFile = path.join(outDir, 'manifest.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

// Defaulting to the provider the book is actually baked in matters more than it
// looks: these four values are folded into every unit's hash, so a default that
// disagrees with the manifest makes a bare `node scripts/build-narration.js`
// consider all 147 files stale and re-bake the entire reading. With them right,
// the bare command is a no-op — which is the only safe thing for it to be.
const provider = value('provider') || PROVIDER;
if (!['openai', 'gemini'].includes(provider)) throw new Error(`unknown provider: ${provider}`);
const gemini = provider === 'gemini';

const model = gemini ? GEMINI_MODEL : MODEL;
const voice = value('voice') || (gemini ? GEMINI_VOICE : VOICE);
// The two backends have separate preset vocabularies, so the fallback follows
// the provider — PRESET is an OpenAI name and would throw on the Gemini path.
const preset = value('preset') || (gemini ? GEMINI_PRESET : PRESET);
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
    // Each chunk is its own generation, keyed by its own text — so a short section is
    // one chunk whose hash matches the pre-chunking scheme (its cached raw still
    // reuses), while a long section becomes several. Keyed by text/voice/preset but NOT
    // bitrate, so changing bitrate re-encodes from cached raws for free.
    const chunks = chunkText(text, CHUNK_MAX_CHARS).map((ct) => {
      const h = sha([ct, provider, model, voice, preset, INSTRUCTIONS_VERSION, section]);
      return { text: ct, hash: h, raw: `k${pad(id)}-${section}.${h}.wav` };
    });
    // The assembled audio's identity is the ordered list of chunk hashes plus how they
    // are joined; the mp3's identity adds bitrate.
    const rawHash = sha([...chunks.map((c) => c.hash), `gap${GAP_MS}`]);
    const hash = sha([rawHash, bitrate]);
    units.push({
      id, section, text, hash, chunks,
      file: `k${pad(id)}-${section}.mp3`,
    });
  }
}

// The front and back matter. Keyed by slug rather than by id — narration_state's
// unitKey is a plain string join, so `preface:verse` is as valid a key as `29:verse`
// and the runtime lookup needed no change at all. Skipped entirely when --case is
// given, since these pages have no number to match.
if (!onlyCase) {
  for (const page of Object.values(MATTER)) {
    for (const section of page.sections) {
      if (onlySection && section !== onlySection) continue;
      const text = (page.text[section] || '').trim();
      if (!text) continue;
      const sha = (parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
      const chunks = chunkText(text, CHUNK_MAX_CHARS).map((ct) => {
        const h = sha([ct, provider, model, voice, preset, INSTRUCTIONS_VERSION, section]);
        return { text: ct, hash: h, raw: `${page.slug}-${section}.${h}.wav` };
      });
      const rawHash = sha([...chunks.map((c) => c.hash), `gap${GAP_MS}`]);
      const hash = sha([rawHash, bitrate]);
      units.push({
        id: page.slug, section, text, hash, chunks,
        file: `${page.slug}-${section}.mp3`,
      });
    }
  }
}

const tooLong = units.filter((u) => u.text.length > MAX_INPUT);
if (tooLong.length) {
  console.error(`BUILD FAILED: ${tooLong.length} unit(s) exceed ${MAX_INPUT} characters:`);
  for (const u of tooLong) console.error(`  ${typeof u.id === 'number' ? `case ${u.id}` : u.id} ${u.section}: ${u.text.length}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const tmpDir = path.join(rawDir, '.tmp');
if (gemini) { fs.mkdirSync(rawDir, { recursive: true }); fs.mkdirSync(tmpDir, { recursive: true }); }

// Loudness-normalize each cached chunk, join them with a silence gap, and encode the
// result. Per-chunk normalization is what evens the level across independently
// generated pieces so the seams don't jump. No API calls — pure local assembly, so
// both the bake and --encode-only share it.
function assembleMp3(u, mp3Dest) {
  // u.id is a case number or a page slug; pad() is only meaningful for the former.
  const prefix = path.join(tmpDir, `${typeof u.id === 'number' ? pad(u.id) : u.id}-${u.section}`);
  const norms = u.chunks.map((ch, i) => {
    const dest = `${prefix}.norm${i}.wav`;
    loudnormWav(path.join(rawDir, ch.raw), dest);
    return dest;
  });
  let joined = norms[0];
  if (norms.length > 1) {
    joined = `${prefix}.joined.wav`;
    fs.writeFileSync(joined, concatWavs(norms.map((n) => fs.readFileSync(n)), { gapMs: GAP_MS }));
  }
  toMp3(joined, mp3Dest, bitrate);
  for (const n of norms) { try { fs.unlinkSync(n); } catch {} }
  if (norms.length > 1) { try { fs.unlinkSync(joined); } catch {} }
  return fs.statSync(mp3Dest).size;
}

// Duration of the assembled unit: its chunks' audio plus the seam gaps between them.
function unitSeconds(u) {
  let s = 0;
  for (const ch of u.chunks) {
    const info = parseWav(fs.readFileSync(path.join(rawDir, ch.raw)));
    s += info.ok ? info.seconds : 0;
  }
  return s + Math.max(0, u.chunks.length - 1) * GAP_MS / 1000;
}

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
    if (!u.chunks.every((ch) => fs.existsSync(path.join(rawDir, ch.raw)))) continue;
    const bytes = assembleMp3(u, path.join(outDir, u.file));
    const prev = manifest.files[unitKey(u.id, u.section)] || {};
    manifest.files[unitKey(u.id, u.section)] = {
      ...prev, file: u.file, hash: u.hash, bytes,
      seconds: Number(unitSeconds(u).toFixed(2)), chunks: u.chunks.length,
    };
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
      // Generate each chunk that isn't already cached. A valid cached raw is money
      // already spent — its hash in the filename guarantees it matches the current
      // text/voice/preset, and parseWav rejects anything an interrupted run truncated.
      let newChunks = 0;
      for (const ch of u.chunks) {
        const rawPath = path.join(rawDir, ch.raw);
        if (!force && fs.existsSync(rawPath) && parseWav(fs.readFileSync(rawPath)).ok) continue;
        const r = await geminiSpeak({
          key, model, voice,
          prompt: geminiPrompt(u.section, preset, ch.text),
        });
        fs.writeFileSync(rawPath, r.wav);
        tokens += r.tokens;
        newChunks++;
      }
      reused = newChunks === 0;
      seconds = unitSeconds(u);
      if (canEncode) {
        bytes = assembleMp3(u, path.join(outDir, u.file));
      } else {
        bytes = u.chunks.reduce((s, ch) => s + fs.statSync(path.join(rawDir, ch.raw)).size, 0);
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
    if (gemini && u.chunks.length > 1) entry.chunks = u.chunks.length;
    manifest.files[unitKey(u.id, u.section)] = entry;
    saveManifest();
    console.log(`  [${++done}/${stale.length}] ${u.file} — ${(bytes / 1024).toFixed(0)} KB`
      + (seconds !== null ? ` — ${seconds.toFixed(1)}s` : '')
      + (gemini && u.chunks.length > 1 ? ` — ${u.chunks.length} chunks` : '')
      + (reused ? ' (cached raw)' : ''));
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
