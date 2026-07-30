// Rerunnable: the generated text modules -> THE-GATELESS-GATE.md at the repo root.
// Run: node scripts/build-book.js
//
// Downstream of scripts/build-text.js, never a substitute for it: this reads what
// that script generated. After editing local/gateless-gate.txt or the front and
// back matter, run build-text.js first, then this.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CASES_TEXT from '../src/koans/text/mumonkan.js';
import MATTER from '../src/koans/text/matter.js';
import { CASES } from '../src/koans/index.js';
import { readingEntries } from '../src/spine.js';
import { SECTIONS as ABOUT } from '../src/ui/about_state.js';
import { bookMarkdown } from './lib/book-md.js';

const SCRIPT = 'node scripts/build-book.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(root, 'THE-GATELESS-GATE.md');

const entries = readingEntries(CASES, MATTER);
const md = bookMarkdown({ entries, cases: CASES_TEXT, matter: MATTER, about: ABOUT, script: SCRIPT });

// A page that came out empty means a text module moved under us and the book
// would ship with a hole in it. Cheap to check, and the alternative is noticing
// in a browser three commits later.
const problems = [];
for (const e of entries) {
  const heading = e.id === null ? `## ${MATTER[e.slug].title}` : `## ${e.id}. `;
  if (!md.includes(heading)) problems.push(`${e.slug}: no heading in the output`);
}
if (entries.length !== CASES.length + 2) {
  problems.push(`expected ${CASES.length + 2} pages, got ${entries.length}`);
}
if (md.includes('　')) problems.push('an ideographic indent reached the page');
if (problems.length) {
  console.error('\nBUILD FAILED:\n' + problems.join('\n'));
  process.exit(1);
}

fs.writeFileSync(outFile, md);
const words = md.split(/\s+/).filter(Boolean).length;
console.log(`Wrote ${outFile}`);
console.log(`${entries.length} pages, ${words.toLocaleString('en-US')} words, ${(md.length / 1024).toFixed(1)} KB.`);
