// One-shot migration: the committed text modules -> book/gateless-gate.md.
// Run: node scripts/dev/write-book-source.js
//
// This produced the merged source once, on 2026-08-11. It reads only committed
// files, so it needs no local/. It is deleted at the end of that migration and
// survives in the commit history, which is the honest place for a script that
// can only ever run once.
//
// The arrow points backwards here, and only here. The book's text used to live
// in two files in gitignored local/, so book/gateless-gate.md had to be
// manufactured before anything could build from it. Printing it out of the
// modules beats reformatting 110 KB of prose by hand, because the modules are
// what the app actually reads and what all 155 narration mp3s were baked
// against — and because this route can check itself, which hand-assembly
// cannot.
//
// It refuses to write a file that does not parse back to exactly what it came
// from. That round-trip is the whole safety of the migration: the wrapping done
// here for editability must be the exact inverse of the rejoining parse-book.js
// does, and a deep-compare is the only honest way to know it is.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import CASES, { about } from '../../src/koans/text/mumonkan.js';
import MATTER from '../../src/koans/text/matter.js';
import { parseBook, CASE_PARTS, MATTER_PAGES, CASE_COUNT } from '../lib/parse-book.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outFile = path.join(root, 'book', 'gateless-gate.md');
const WIDTH = 90;

// Greedy wrap on single spaces. Exactly reversible by splitting on newlines and
// rejoining with one space, which is what a prose section's parse does — but
// only while no paragraph carries a double space or a tab. Asserted below
// rather than assumed.
function wrap(paragraph) {
  const out = [];
  let line = '';
  for (const word of paragraph.split(' ')) {
    if (!line) line = word;
    else if (line.length + 1 + word.length <= WIDTH) line += ` ${word}`;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.join('\n');
}

// Prose is wrapped for editing; verse is left exactly as it is, because its
// line breaks are the verse. The forty-nine case verses are each a single long
// line today — flattened somewhere upstream of the 1934 text we inherited — and
// they stay that way here. Restoring them is its own pass; seeing them sit as
// one 200-character line in this file is the point.
const render = (text, kind) => String(text)
  .split('\n\n')
  .map((para) => (kind === 'verse' ? para : wrap(para)))
  .join('\n\n');

// The provenance header is the one block nothing parses — it was `about` in
// mumonkan.js, which no runtime code ever read — so it is the one block free to
// be reformatted. It needs its own renderer for two reasons: its short lines
// (the credit, the source URL) are deliberate and must not be reflowed into a
// paragraph, and the plain-text rule of equals signs it carried is now literal
// garbage in a Markdown file.
const renderHeader = (text) => String(text)
  .replace(/^=+$/m, '---')
  .split('\n\n')
  .map((para) => para.split('\n').map(wrap).join('\n'))
  .join('\n\n');

function guard(where, text) {
  assert.ok(!/ {2}/.test(text), `${where}: a double space would not survive the wrap/rejoin round-trip`);
  assert.ok(!/\t/.test(text), `${where}: a tab would not survive the wrap/rejoin round-trip`);
  assert.ok(!/^#/m.test(text), `${where}: a line starting with # would be read back as a heading`);
}

const out = [];
out.push('# The Gateless Gate');
out.push(
  '<!--\n'
  + 'SOURCE OF TRUTH for the book\'s text. Edit this file, then run:\n'
  + '\n'
  + '    node scripts/build-text.js\n'
  + '\n'
  + 'which writes src/koans/text/mumonkan.js and matter.js. Those two are\n'
  + 'GENERATED and say so at the top; this is the file to change.\n'
  + '\n'
  + '`##` opens a page, `###` opens a section, and the section headings are\n'
  + 'matched exactly — they choose the key that names the baked narration file,\n'
  + 'so a retitled heading fails the build rather than orphaning an mp3.\n'
  + '\n'
  + 'Inside a section a blank line is a paragraph or stanza break. Within a\n'
  + 'paragraph, prose line breaks are wrapping and mean nothing; verse line\n'
  + 'breaks are the verse and are kept. scripts/lib/parse-book.js says which\n'
  + 'sections are which.\n'
  + '\n'
  + 'RIGHTS: this file is mixed. The forty-nine cases are the 1934\n'
  + 'Senzaki/Reps rendering and are in the United States public domain. The\n'
  + 'Preface and Afterword pages are a new translation made for this edition,\n'
  + '(c) 2026 Frank Force, CC BY-NC-ND 4.0. See NOTICE.md.\n'
  + '-->',
);
out.push(renderHeader(about));

const page = (heading, parts) => {
  out.push(`## ${heading}`);
  for (const { label, text, kind } of parts) {
    out.push(`### ${label}`);
    out.push(render(text, kind));
  }
};

const matterPage = (spec) => {
  const m = MATTER[spec.slug];
  page(m.title, spec.parts.map((p) => {
    guard(`${spec.slug}.${p.key}`, m.text[p.key]);
    return { label: p.labels[0], text: m.text[p.key], kind: p.kind };
  }));
};

matterPage(MATTER_PAGES.find((p) => p.slug === 'preface'));
for (let id = 1; id <= CASE_COUNT; id++) {
  const c = CASES[id];
  page(`${id}. ${c.title}`, CASE_PARTS.map((p) => {
    guard(`case ${id}.${p.key}`, c[p.key]);
    // Case 49's comment is Amban's, and the file gets to say so.
    const label = p.key === 'comment' && id === CASE_COUNT ? p.labels[1] : p.labels[0];
    return { label, text: c[p.key], kind: p.kind };
  }));
}
matterPage(MATTER_PAGES.find((p) => p.slug === 'afterword'));

const md = `${out.join('\n\n')}\n`;

// The round-trip. Nothing is written unless the file reads back as exactly the
// data it was made from.
const back = parseBook(md);
assert.deepStrictEqual(back.cases, CASES, 'the generated book does not parse back to mumonkan.js');
assert.deepStrictEqual(back.matter, MATTER, 'the generated book does not parse back to matter.js');
// deepStrictEqual does not police key order, and the generated modules are
// JSON.stringify of these objects, so order is checked on its own.
for (const id of Object.keys(CASES)) {
  assert.deepEqual(Object.keys(back.cases[id]), Object.keys(CASES[id]), `case ${id}: key order`);
}
for (const slug of Object.keys(MATTER)) {
  assert.deepEqual(Object.keys(back.matter[slug]), Object.keys(MATTER[slug]), `${slug}: key order`);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, md);
console.log(`Wrote ${outFile}`);
console.log(`${CASE_COUNT} cases + 2 matter pages, ${(md.length / 1024).toFixed(1)} KB, `
  + `${md.split('\n').length} lines. Round-trip verified.`);
