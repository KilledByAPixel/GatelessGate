// Narration bake-off. Generates short samples so a voice (and then a delivery
// preset) can be chosen by ear before committing to the full 152-unit bake.
//
//   node scripts/narration-audition.js --provider gemini
//   node scripts/narration-audition.js --provider gemini --voices Charon --presets plain,japanese
//   node scripts/narration-audition.js --voices ash,onyx --presets japanese,trace
//   node scripts/narration-audition.js --dry-run             print the matrix, no API calls
//
// Output lands in local/audition/ (gitignored) with an audition.html index that also
// links the currently shipping files, so every run is a direct A/B against them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import {
  MODEL, ALL_VOICES, CANDIDATE_VOICES, PRESET_NAMES, instructionsFor,
  GEMINI_MODEL, GEMINI_CANDIDATE_VOICES, GEMINI_PRESET_NAMES, geminiPrompt,
} from './lib/narration-voice.js';
import { readKey as openaiKey, speak as openaiSpeak } from './lib/openai-tts.js';
import { readKey as geminiKey, speak as geminiSpeak } from './lib/gemini-tts.js';
import { pool } from './lib/pool.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'local', 'audition');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

// Three short passages that between them cover what the narrator has to handle:
// back-and-forth dialogue, Mumon needling the story, and a verse. `shipping` is the
// baked file for that same passage, for side-by-side comparison.
const PASSAGES = [
  { key: 'dialogue', label: 'Case 7 — the story (dialogue)', section: 'case', text: CASES[7].case, shipping: 'k07-case.mp3' },
  { key: 'comment', label: "Case 7 — Mumon's comment (dry)", section: 'comment', text: CASES[7].comment, shipping: 'k07-comment.mp3' },
  { key: 'verse', label: 'Case 33 — the verse', section: 'verse', text: CASES[33].verse, shipping: 'k33-verse.mp3' },
  // The book's longest single passage (2329 chars) — the one that whisper-decayed.
  // Use it to check whether a voice/pace holds full volume to the end.
  { key: 'long', label: 'Case 2 — the full story (2329 chars, decay test)', section: 'case', text: CASES[2].case, shipping: 'k02-case.mp3' },
];

const provider = value('provider') || 'openai';
if (!['openai', 'gemini'].includes(provider)) throw new Error(`unknown provider: ${provider}`);
const gemini = provider === 'gemini';

const model = gemini ? GEMINI_MODEL : MODEL;
const ext = gemini ? 'wav' : 'mp3';   // Gemini returns raw PCM; encoding happens at bake time
const knownVoices = gemini ? null : ALL_VOICES;   // Gemini's list isn't enumerated here
const knownPresets = gemini ? GEMINI_PRESET_NAMES : PRESET_NAMES;

const list = (name, fallback) => { const v = value(name); return v ? v.split(',').map((s) => s.trim()) : fallback; };
const voices = list('voices', gemini ? GEMINI_CANDIDATE_VOICES : CANDIDATE_VOICES);
const presets = list('presets', gemini ? ['japanese'] : ['plain']);
const passageKeys = list('passages', PASSAGES.map((p) => p.key));
const passages = PASSAGES.filter((p) => passageKeys.includes(p.key));

if (knownVoices) for (const v of voices) if (!knownVoices.includes(v)) throw new Error(`unknown voice: ${v} (have ${knownVoices.join(', ')})`);
for (const p of presets) if (!knownPresets.includes(p)) throw new Error(`unknown preset: ${p} (have ${knownPresets.join(', ')})`);
if (!passages.length) throw new Error(`no passages matched: ${passageKeys.join(', ')}`);

const matrix = [];
for (const voice of voices) {
  for (const preset of presets) {
    for (const p of passages) {
      matrix.push({ voice, preset, passage: p, file: `${provider}-${voice}-${preset}-${p.key}.${ext}` });
    }
  }
}

const chars = matrix.reduce((s, m) => s + m.passage.text.length, 0);
console.log(`${matrix.length} clips — ${voices.length} voice(s) x ${presets.length} preset(s) x ${passages.length} passage(s)`);
console.log(`${provider} / ${model} / ${chars} characters of transcript\n`);

if (flag('dry-run')) {
  for (const m of matrix) console.log(`  ${m.file.padEnd(42)} ${m.passage.text.length} chars`);
  if (gemini) console.log(`\n--- example prompt (${matrix[0].voice} / ${matrix[0].preset}) ---\n${geminiPrompt(matrix[0].passage.section, matrix[0].preset, '<transcript>')}`);
  process.exit(0);
}

const key = gemini ? geminiKey() : openaiKey();
fs.mkdirSync(outDir, { recursive: true });

let done = 0, seconds = 0, tokens = 0;
const failed = [];
await pool(matrix.map((m) => async () => {
  const dest = path.join(outDir, m.file);
  // Auditions are iterative and the API is occasionally flaky, so an existing clip is
  // left alone — a retry after a partial run costs nothing. --force re-rolls the take.
  if (!flag('force') && fs.existsSync(dest)) {
    m.bytes = fs.statSync(dest).size;
    console.log(`  [${++done}/${matrix.length}] ${m.file} — kept`);
    return;
  }
  try {
    let bytes;
    if (gemini) {
      const r = await geminiSpeak({
        key, model, voice: m.voice,
        prompt: geminiPrompt(m.passage.section, m.preset, m.passage.text),
      });
      bytes = r.wav; seconds += r.seconds; tokens += r.tokens;
      m.seconds = r.seconds;
    } else {
      bytes = await openaiSpeak({
        key, model, voice: m.voice,
        input: m.passage.text,
        instructions: instructionsFor(m.passage.section, m.preset),
      });
    }
    fs.writeFileSync(dest, bytes);
    m.bytes = bytes.length;
    const dur = m.seconds ? ` — ${m.seconds.toFixed(1)}s` : '';
    console.log(`  [${++done}/${matrix.length}] ${m.file} — ${(bytes.length / 1024).toFixed(0)} KB${dur}`);
  } catch (e) {
    // One bad take must not cost the whole run — the rest are already paid for.
    failed.push({ file: m.file, error: String(e.message).slice(0, 160) });
    console.log(`  [${++done}/${matrix.length}] ${m.file} — FAILED`);
  }
}), Number(value('jobs') || 4));

// Only clips that exist can be listed, or the page fills with broken players.
const produced = matrix.filter((m) => fs.existsSync(path.join(outDir, m.file)));

// Group by voice+preset so each candidate can be heard as a run of three clips.
const groups = new Map();
for (const m of produced) {
  const k = `${m.voice} · ${m.preset}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(m);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (label, src) => `<div class="clip"><span>${esc(label)}</span>
    <audio controls preload="none" src="${esc(src)}"></audio></div>`;

// Whatever bake currently sits in audio/narration, read from its manifest, so the
// reference row is honestly labelled rather than hardcoded to a past provider.
let refLabel = 'current bake';
try {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'audio', 'narration', 'manifest.json'), 'utf8'));
  refLabel = [m.provider, m.voice, m.preset].filter(Boolean).join(' / ') || refLabel;
} catch { /* no manifest yet */ }

const html = `<!doctype html>
<meta charset="utf-8"><title>Narration audition — ${esc(provider)}</title>
<style>
  body { font: 16px/1.6 Georgia, serif; max-width: 44rem; margin: 3rem auto; padding: 0 1.5rem;
         background: #f4f1ea; color: #23201c; }
  h1 { font-weight: normal; letter-spacing: .04em; }
  section { margin: 2.5rem 0; padding-top: 1rem; border-top: 1px solid #ccc5b8; }
  section.ref { background: #ece7dc; padding: 1rem 1.25rem; border: 1px solid #ccc5b8; }
  h2 { font-size: 1.1rem; font-weight: normal; color: #7a3b2e; letter-spacing: .08em; margin: 0 0 1rem; }
  .clip { margin: .9rem 0; }
  .clip span { display: block; font-size: .8rem; color: #6b665e; letter-spacing: .04em; }
  audio { width: 100%; margin-top: .3rem; }
  p.note { font-size: .85rem; color: #6b665e; }
</style>
<h1>Narration audition — ${esc(provider)}</h1>
<p class="note">${esc(model)} — ${produced.length} clips. Same three passages for every candidate, so listen down the page and compare like with like.</p>

<section class="ref">
  <h2>current bake in audio/narration — ${esc(refLabel)}</h2>
  ${passages.map((p) => clip(p.label, `../../audio/narration/${p.shipping}`)).join('\n  ')}
</section>

${[...groups].map(([name, ms]) => `<section>
  <h2>${esc(name)}</h2>
  ${ms.map((m) => clip(m.passage.label, m.file)).join('\n  ')}
</section>`).join('\n')}
`;
fs.writeFileSync(path.join(outDir, 'audition.html'), html);

console.log(`\nWrote ${produced.length} clips + audition.html to local/audition/`);
if (gemini) {
  console.log(`${seconds.toFixed(0)}s of new audio, ${tokens} output tokens (~$${(tokens / 1e6 * 20).toFixed(3)})`);
}
if (failed.length) {
  console.log(`\n${failed.length} failed — re-run to retry just these:`);
  for (const f of failed) console.log(`  ${f.file}: ${f.error}`);
}
