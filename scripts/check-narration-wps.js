// Audits narration speaking pace in words per second, after crediting the pauses that
// aren't speech (a beat per paragraph break, a beat of lead-in). A companion to
// check-narration.js: that fits duration against character count; this catches the same
// dropout / padding failure modes through pace, which normalises differently and so
// flags a slightly different set of edge units. Run both. Reads only local files; no
// API calls, no cost.
//
//   node scripts/check-narration-wps.js
//   node scripts/check-narration-wps.js --high 1.25 --low 0.75      stricter
//   node scripts/check-narration-wps.js --para-pause 0.5 --lead-in 0.25
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CASES from '../src/koans/text/mumonkan.js';
import { countWords, countParagraphs, findPaceOutliers } from './lib/narration-wps.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'audio', 'narration');
const manifestFile = path.join(outDir, 'manifest.json');

const argv = process.argv.slice(2);
const value = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const num = (name, def) => { const v = value(name); return v == null ? def : Number(v); };

if (!fs.existsSync(manifestFile)) { console.error('No manifest — nothing baked yet.'); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

// Pace needs a real duration; skip any not-yet-rebaked units that carry only bytes.
const rows = [];
for (const [key, f] of Object.entries(manifest.files)) {
  if (typeof f.seconds !== 'number') continue;
  const [id, section] = key.split(':');
  const text = (CASES[id][section] || '').trim();
  if (!text) continue;
  rows.push({ key, section, words: countWords(text), paras: countParagraphs(text), seconds: f.seconds });
}

const opts = {
  paraPause: num('para-pause', 0.5),
  leadIn: num('lead-in', 0.25),
  high: num('high', 1.3),
  low: num('low', 0.7),
};
const { means, flagged } = findPaceOutliers(rows, opts);

console.log(`${rows.length} units — ${manifest.provider || 'openai'} / ${manifest.voice} / ${manifest.preset}`);
console.log(`speaking pace = words / (seconds − ${opts.paraPause}s/paragraph break − ${opts.leadIn}s lead-in)\n`);
for (const [section, m] of Object.entries(means)) {
  console.log(`  ${section.padEnd(8)} ${m.toFixed(2)} wps mean`);
}

if (!flagged.length) {
  console.log('\nNo pace outliers. Nothing reads far off its section.');
} else {
  console.log(`\n${flagged.length} outlier(s) — fast = maybe dropped text, slow = maybe a repeat or dead air:`);
  for (const f of flagged) {
    const note = f.short ? '  (short unit — noisy)' : '';
    console.log(`  ${f.key.padEnd(12)} ${f.kind.padEnd(4)} ${(f.ratio * 100).toFixed(0)}% of ${f.section} pace  `
      + `(${f.words}w / ${f.seconds.toFixed(1)}s, ${f.pace.toFixed(2)} wps)${note}`);
    console.log(`     re-roll: node scripts/build-narration.js --provider ${manifest.provider || 'openai'} --preset ${manifest.preset} --case ${f.key.split(':')[0]} --section ${f.section} --force`);
  }
}
