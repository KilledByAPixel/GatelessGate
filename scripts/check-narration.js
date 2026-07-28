// Audits a narration bake for takes that are anomalously long or short for their text
// — the signature of a truncated read, or of the model speaking part of the prompt
// aloud before the transcript. Reads only local files; no API calls, no cost.
//
//   node scripts/check-narration.js
//   node scripts/check-narration.js --high 1.4     stricter tolerance
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import MATTER from '../src/koans/text/matter.js';
import { findOutliers } from './lib/narration-check.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'audio', 'narration');
const manifestFile = path.join(outDir, 'manifest.json');

const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };

if (!fs.existsSync(manifestFile)) { console.error('No manifest — nothing baked yet.'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// Duration is the honest metric and beats file size, which also varies with bitrate.
// Only takes recording `seconds` are audited when any exist — during a two-day bake the
// manifest is mixed (new Charon takes have seconds, not-yet-rebaked onyx ones don't),
// and folding two providers' byte rates into one baseline would mask real outliers.
// A pure older bake with no seconds anywhere falls back to bytes across the board.
const entries = Object.entries(manifest.files);
const anySeconds = entries.some(([, f]) => typeof f.seconds === 'number');

const rows = [];
const missing = [];
let skipped = 0;
for (const [key, f] of entries) {
  const [id, section] = key.split(':');
  if (!fs.existsSync(path.join(outDir, f.file))) missing.push(f.file);
  if (anySeconds && typeof f.seconds !== 'number') { skipped++; continue; }
  // id is a case number for the 49 cases, a page slug (preface/afterword) for the
  // matter pages — CASES has no entry for the latter, so fall back to MATTER. Grouping
  // below is by section name, not by source: a matter page's 'verse' joins the same
  // peer group as every case's 'verse' (same delivery note, same expected pace), while
  // 'prose'/'warnings'/'amban' are unique to the matter pages and form their own tiny
  // groups — too few samples to set a baseline, so they're reported but never flagged,
  // same as any other undersized group here.
  const source = CASES[id] ? CASES[id] : (MATTER[id] && MATTER[id].text);
  rows.push({
    key, section,
    chars: ((source && source[section]) || '').trim().length,
    metric: anySeconds ? f.seconds : f.bytes,
  });
}
const haveSeconds = anySeconds;

const total = Object.values(manifest.files).reduce((s, f) => s + f.bytes, 0);
console.log(`${rows.length} units, ${(total / 1e6).toFixed(1)} MB — ${manifest.provider || 'openai'} / ${manifest.voice} / ${manifest.preset}`);
console.log(`metric: ${haveSeconds ? 'seconds' : 'bytes'} per character\n`);

if (missing.length) console.log(`MISSING FROM DISK (${missing.length}): ${missing.join(', ')}\n`);

const { fits, flagged } = findOutliers(rows, {
  high: Number(value('high') || 1.35),
  low: Number(value('low') || 0.6),
});

const unit = haveSeconds ? 's' : 'bytes';
for (const [section, fit] of Object.entries(fits)) {
  console.log(`  ${section.padEnd(8)} ${fit.a.toFixed(1)}${unit} overhead + ${fit.b.toFixed(3)}${unit}/char`);
}

if (!flagged.length) {
  console.log('\nNo outliers. Nothing looks truncated or padded with prompt text.');
} else {
  console.log(`\n${flagged.length} outlier(s) — listen to these, and re-roll if wrong:`);
  for (const f of flagged) {
    console.log(`  ${f.key.padEnd(12)} ${f.kind.padEnd(5)} ${f.ratio.toFixed(2)}x expected  `
      + `(${f.chars} chars, ${f.metric.toFixed(1)}${unit} vs ${f.predicted.toFixed(1)} predicted)`);
    console.log(`     re-roll: node scripts/build-narration.js --provider ${manifest.provider || 'openai'} --case ${f.key.split(':')[0]} --section ${f.section} --force`);
  }
}
