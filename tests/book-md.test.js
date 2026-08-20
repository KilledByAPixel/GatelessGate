import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bookMarkdown, preserveLines, partsToMarkdown } from '../scripts/lib/book-md.js';
import { LABELS } from '../src/ui/scroll_state.js';
import CASES_TEXT from '../src/koans/text/mumonkan.js';
import MATTER from '../src/koans/text/matter.js';
import { CASES } from '../src/koans/index.js';
import { readingEntries } from '../src/spine.js';
import { SECTIONS as ABOUT } from '../src/ui/about_state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'node scripts/build-book.js';
const ENTRIES = readingEntries(CASES, MATTER);
const MD = bookMarkdown({ entries: ENTRIES, cases: CASES_TEXT, matter: MATTER, about: ABOUT, script: SCRIPT });

test('a verse keeps its line breaks, and its stanza breaks stay stanza breaks', () => {
  // Markdown eats a single newline. Two trailing spaces is the hard break, and
  // without it the Zen Warnings arrive as one paragraph of run-on couplets.
  assert.equal(preserveLines('one\ntwo'), 'one  \ntwo');
  assert.equal(preserveLines('one\ntwo\n\nthree\nfour'), 'one  \ntwo\n\nthree  \nfour');
});

test('prose is left exactly as it was', () => {
  // Paragraphs are already separated by a blank line and each is a single line,
  // so the hard-break pass must be a no-op on them.
  const prose = 'A paragraph.\n\nAnother one.';
  assert.equal(preserveLines(prose), prose);
});

test('an About part list renders its links', () => {
  assert.equal(partsToMarkdown(['read ', ['here', 'https://x.test'], '.']), 'read [here](https://x.test).');
  assert.equal(partsToMarkdown(['plain text']), 'plain text');
});

test('every page of the book is in the file, in reading order', () => {
  const headings = MD.split('\n').filter((l) => l.startsWith('## ') && l !== '## About this text');
  assert.equal(headings.length, ENTRIES.length, 'one heading per page');
  assert.equal(headings.length, 51);
  assert.equal(headings[0], '## Preface');
  assert.equal(headings[1], '## 1. Joshu\'s Dog');
  assert.equal(headings.at(-1), '## Afterword');
  // The numbered pages carry their number, and they run 1..49 without a gap.
  const numbered = headings.filter((h) => /^## \d+\. /.test(h));
  assert.equal(numbered.length, 49);
  assert.deepEqual(numbered.map((h) => Number(h.match(/^## (\d+)\./)[1])), CASES.map((c) => c.id));
});

test('a case shows its three parts under the names the reading uses', () => {
  // LABELS is the scroll's own table; rendering from anything else would let the
  // page and the file drift into calling the same thing two names.
  for (const label of Object.values(LABELS)) {
    assert.ok(MD.includes(`**${label}**`), `${label} should appear`);
  }
});

test('the whole text of every page is present, not just its heading', () => {
  // The failure this catches is a page rendering its title and nothing else.
  for (const c of CASES) {
    const text = CASES_TEXT[c.id];
    assert.ok(MD.includes(text.case.split('\n')[0]), `case ${c.id} text missing`);
  }
  for (const slug of ['preface', 'afterword']) {
    for (const key of MATTER[slug].sections) {
      const first = MATTER[slug].text[key].split('\n')[0];
      assert.ok(MD.includes(first), `${slug}.${key} text missing`);
    }
  }
});

test('the book closes on Amban, and the colophon comes after it', () => {
  const amban = MD.indexOf('Say it quick. Say it quick.');
  const colophon = MD.indexOf('## About this text');
  assert.ok(amban > 0 && colophon > amban, 'the about section belongs at the end');
});

test('the colophon says where the front and back matter came from', () => {
  // It ships as a file that travels without the About page attached, so the one
  // thing a reader must not have to go looking for is that the preface and the
  // back matter are a new translation rather than part of the 1934 rendering.
  assert.ok(MD.includes('**The front and back matter**'));
  assert.match(MD, /not\s+part of the 1934 translation/);
  assert.match(MD, /T48n2005/, 'the Chinese source should be named');
  assert.match(MD, /not independently collated/, 'the open caveat should be stated, not buried');
});

test('no ideographic indent reaches the file', () => {
  assert.ok(!MD.includes('　'), 'the verse marker is structure, never rendered');
});

test('the book is pure ASCII, front matter and all', () => {
  // Curly quotes and ellipses reach a TTS engine as something other than the
  // straight marks the bake was auditioned on, so the narrated body has always
  // been ASCII. The last holdouts sat in the front matter, which is NOT narrated
  // and so drifted unwatched: a macron on Taisho and a copyright sign. Both went
  // in August 2026 — the edition's naming rule already spells every other name
  // bare (Joshu, Hyakujo, Tosotsu), and (c) costs a reader nothing — which makes
  // the property total and therefore worth pinning.
  //
  // Both files are checked because they fail differently: the source is what an
  // editor pastes into, and the generated page additionally carries the About
  // text, so a curly apostrophe typed into about_state.js lands here too.
  const offenders = (text, where) => text.split('\n').flatMap((line, i) => {
    const bad = line.match(/[^\x00-\x7F]/g);
    return bad ? [`${where}:${i + 1} has ${[...new Set(bad)].join(' ')}`] : [];
  });
  const source = readFileSync(join(ROOT, 'book', 'gateless-gate.md'), 'utf8');
  assert.deepEqual(offenders(source, 'book/gateless-gate.md'), []);
  assert.deepEqual(offenders(MD, 'THE-GATELESS-GATE.md'), []);
});

test('the committed THE-GATELESS-GATE.md is what the builder produces', () => {
  // The guard that stops this file rotting: edit the text, forget to regenerate,
  // and the book and its Markdown quietly disagree. Line endings are normalised
  // because git converts them on checkout under Windows.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const onDisk = readFileSync(join(ROOT, 'THE-GATELESS-GATE.md'), 'utf8');
  assert.equal(norm(onDisk), norm(MD),
    'THE-GATELESS-GATE.md is stale — run `node scripts/build-book.js`');
});
