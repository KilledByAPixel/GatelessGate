// Narration bake-off. Generates short samples so a voice (and then a delivery
// preset) can be chosen by ear before committing to the full 147-file bake.
//
//   node scripts/narration-audition.js                       candidate voices, `plain`
//   node scripts/narration-audition.js --voices ash,onyx --presets japanese,trace
//   node scripts/narration-audition.js --passages verse      narrow the sample text
//   node scripts/narration-audition.js --dry-run             print the matrix, no API calls
//
// Output lands in local/audition/ (gitignored) with an audition.html index.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import { MODEL, ALL_VOICES, CANDIDATE_VOICES, PRESET_NAMES, instructionsFor } from './lib/narration-voice.js';
import { readKey, speak, pool } from './lib/openai-tts.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'local', 'audition');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

// Three short passages that between them cover what the narrator has to handle:
// back-and-forth dialogue, Mumon needling the story, and a verse.
const PASSAGES = [
  { key: 'dialogue', label: 'Case 7 — the story (dialogue)', section: 'case', text: CASES[7].case },
  { key: 'comment', label: "Case 7 — Mumon's comment (dry)", section: 'comment', text: CASES[7].comment },
  { key: 'verse', label: 'Case 33 — the verse', section: 'verse', text: CASES[33].verse },
];

// Any axis can be varied; unspecified axes collapse to a sensible default so a run
// stays small enough to actually sit and listen to.
const list = (name, fallback) => { const v = value(name); return v ? v.split(',').map((s) => s.trim()) : fallback; };
const voices = list('voices', CANDIDATE_VOICES);
const presets = list('presets', ['plain']);
const passageKeys = list('passages', PASSAGES.map((p) => p.key));
const passages = PASSAGES.filter((p) => passageKeys.includes(p.key));

for (const v of voices) if (!ALL_VOICES.includes(v)) throw new Error(`unknown voice: ${v} (have ${ALL_VOICES.join(', ')})`);
for (const p of presets) if (!PRESET_NAMES.includes(p)) throw new Error(`unknown preset: ${p} (have ${PRESET_NAMES.join(', ')})`);
if (!passages.length) throw new Error(`no passages matched: ${passageKeys.join(', ')}`);

const matrix = [];
for (const voice of voices) {
  for (const preset of presets) {
    for (const p of passages) {
      matrix.push({
        voice, preset, passage: p,
        file: `${voice}-${preset}-${p.key}.mp3`,
      });
    }
  }
}

const chars = matrix.reduce((s, m) => s + m.passage.text.length, 0);
console.log(`${matrix.length} clips — ${voices.length} voice(s) x ${presets.length} preset(s) x ${passages.length} passage(s)`);
console.log(`${chars} characters total (~$${(chars / 1e6 * 15).toFixed(2)} order of magnitude)\n`);

if (flag('dry-run')) {
  for (const m of matrix) console.log(`  ${m.file.padEnd(32)} ${m.passage.text.length} chars`);
  process.exit(0);
}

const key = readKey();
fs.mkdirSync(outDir, { recursive: true });

let done = 0;
await pool(matrix.map((m) => async () => {
  const bytes = await speak({
    key, model: MODEL, voice: m.voice,
    input: m.passage.text,
    instructions: instructionsFor(m.passage.section, m.preset),
  });
  fs.writeFileSync(path.join(outDir, m.file), bytes);
  m.bytes = bytes.length;
  console.log(`  [${++done}/${matrix.length}] ${m.file} — ${(bytes.length / 1024).toFixed(0)} KB`);
}), 4);

// Group by voice+preset so each candidate can be heard as a run of three clips.
const groups = new Map();
for (const m of matrix) {
  const k = `${m.voice} · ${m.preset}`;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(m);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const html = `<!doctype html>
<meta charset="utf-8"><title>Narration audition</title>
<style>
  body { font: 16px/1.6 Georgia, serif; max-width: 44rem; margin: 3rem auto; padding: 0 1.5rem;
         background: #f4f1ea; color: #23201c; }
  h1 { font-weight: normal; letter-spacing: .04em; }
  section { margin: 2.5rem 0; padding-top: 1rem; border-top: 1px solid #ccc5b8; }
  h2 { font-size: 1.1rem; font-weight: normal; color: #7a3b2e; letter-spacing: .08em; margin: 0 0 1rem; }
  .clip { margin: .9rem 0; }
  .clip span { display: block; font-size: .8rem; color: #6b665e; letter-spacing: .04em; }
  audio { width: 100%; margin-top: .3rem; }
  p.note { font-size: .85rem; color: #6b665e; }
</style>
<h1>Narration audition</h1>
<p class="note">${esc(MODEL)} — ${matrix.length} clips. Same three passages for every candidate, so listen down the page and compare like with like.</p>
${[...groups].map(([name, ms]) => `<section>
  <h2>${esc(name)}</h2>
  ${ms.map((m) => `<div class="clip"><span>${esc(m.passage.label)}</span>
    <audio controls preload="none" src="${esc(m.file)}"></audio></div>`).join('\n  ')}
</section>`).join('\n')}
`;
fs.writeFileSync(path.join(outDir, 'audition.html'), html);
console.log(`\nWrote ${matrix.length} clips + audition.html to local/audition/`);
