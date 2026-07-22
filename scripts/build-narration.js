// Bakes narration audio for every koan section from the same generated text the app
// renders, so the reading can never drift from what is on screen.
//
//   node scripts/build-narration.js --dry-run    totals and cost, no API calls
//   node scripts/build-narration.js --case 1     one case (3 files)
//   node scripts/build-narration.js              everything that has changed
//   node scripts/build-narration.js --force      everything, changed or not
//
// A manifest hashes text + voice + model + preset + instruction version per unit, so a
// re-run only regenerates what actually changed. Editing one koan rebakes one file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import { MODEL, VOICE, PRESET, INSTRUCTIONS_VERSION, SECTIONS, instructionsFor } from './lib/narration-voice.js';
import { readKey, speak, pool, MAX_INPUT } from './lib/openai-tts.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'audio', 'narration');
const manifestFile = path.join(outDir, 'manifest.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

const format = value('format') || 'mp3';
const onlyCase = value('case') ? Number(value('case')) : null;
const onlySection = value('section');
const force = flag('force');

const pad = (id) => String(id).padStart(2, '0');
export const unitKey = (id, section) => `${id}:${section}`;

// One unit per non-empty section. Empty sections are skipped rather than baked to
// silence, so the runtime's queue and the manifest agree on what exists.
const units = [];
for (const id of Object.keys(CASES).map(Number).sort((a, b) => a - b)) {
  if (onlyCase && id !== onlyCase) continue;
  for (const section of SECTIONS) {
    if (onlySection && section !== onlySection) continue;
    const text = (CASES[id][section] || '').trim();
    if (!text) continue;
    const hash = crypto.createHash('sha1')
      .update([text, MODEL, VOICE, PRESET, INSTRUCTIONS_VERSION, section, format].join('|'))
      .digest('hex').slice(0, 12);
    units.push({ id, section, text, hash, file: `k${pad(id)}-${section}.${format}` });
  }
}

const tooLong = units.filter((u) => u.text.length > MAX_INPUT);
if (tooLong.length) {
  console.error(`BUILD FAILED: ${tooLong.length} unit(s) exceed ${MAX_INPUT} characters:`);
  for (const u of tooLong) console.error(`  case ${u.id} ${u.section}: ${u.text.length}`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : { model: MODEL, voice: VOICE, preset: PRESET, instructionsVersion: INSTRUCTIONS_VERSION, files: {} };

const stale = units.filter((u) => {
  if (force) return true;
  const prev = manifest.files[unitKey(u.id, u.section)];
  return !prev || prev.hash !== u.hash || !fs.existsSync(path.join(outDir, prev.file));
});

const chars = stale.reduce((s, u) => s + u.text.length, 0);
console.log(`${units.length} unit(s) in scope, ${stale.length} to bake — ${chars} characters`);
console.log(`${MODEL} / ${VOICE} / ${PRESET} / instructions v${INSTRUCTIONS_VERSION} / ${format}\n`);

if (flag('dry-run')) {
  for (const u of stale) console.log(`  ${u.file.padEnd(20)} ${String(u.text.length).padStart(5)} chars`);
  process.exit(0);
}
if (!stale.length) { console.log('Nothing to do.'); process.exit(0); }

const key = readKey();
Object.assign(manifest, { model: MODEL, voice: VOICE, preset: PRESET, instructionsVersion: INSTRUCTIONS_VERSION });

// Written after every file, not once at the end: a long bake that dies partway
// otherwise leaves paid-for audio on disk that the manifest doesn't know about, and
// the next run cheerfully pays for it again.
function saveManifest() {
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
}

let done = 0;
await pool(stale.map((u) => async () => {
  const bytes = await speak({
    key, model: MODEL, voice: VOICE, format,
    input: u.text,
    instructions: instructionsFor(u.section, PRESET),
  });
  fs.writeFileSync(path.join(outDir, u.file), bytes);
  manifest.files[unitKey(u.id, u.section)] = { file: u.file, hash: u.hash, bytes: bytes.length };
  saveManifest();
  console.log(`  [${++done}/${stale.length}] ${u.file} — ${(bytes.length / 1024).toFixed(0)} KB`);
}), 4);

saveManifest();

const total = Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0);
console.log(`\nBaked ${done} file(s). Manifest holds ${Object.keys(manifest.files).length} of 147 units, ${(total / 1e6).toFixed(1)} MB.`);
