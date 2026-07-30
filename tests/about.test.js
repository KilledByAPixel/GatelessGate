import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SECTIONS, SITE, SOURCE_URL, BOOK_MD, THREE_VERSION, TTS_MODEL,
} from '../src/ui/about_state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const flat = SECTIONS.map((s) =>
  s.parts.map((p) => (Array.isArray(p) ? p[0] : p)).join('')).join('\n');

test('the about page covers everything back matter owes the reader', () => {
  const labels = SECTIONS.map((s) => s.label);
  // 'The front and back matter' is pinned here because it is the one disclosure
  // a reader is owed and the only one that is not self-evident from the page:
  // the preface and the back matter are a new translation, not part of the 1934
  // rendering that carries the cases.
  for (const want of ['The translation', 'The front and back matter', 'The book',
    'This edition', 'Rights', 'Built with']) {
    assert.ok(labels.includes(want), `missing section: ${want}`);
  }
});

test('the translation is credited and its public-domain status stated', () => {
  assert.match(flat, /Nyogen Senzaki and Paul Reps/);
  assert.match(flat, /1934/);
  assert.match(flat, /public domain/);
});

// The version and the model are the two claims that go stale on their own —
// bump Three.js or re-voice the narration and the about page would quietly
// start lying. These hold it to the files that actually decide.
test('the stated Three.js version matches the vendored one', () => {
  const vendored = read('lib/THREE_VERSION.txt').trim();     // e.g. 0.185.1
  const minor = vendored.split('.')[1];
  assert.equal(THREE_VERSION, `r${minor}`,
    `the about page says ${THREE_VERSION} but lib/THREE_VERSION.txt says ${vendored}`);
  assert.ok(flat.includes(THREE_VERSION), 'the version is stated in the prose');
});

// Held against the MANIFEST, not against narration-voice.js. That file's MODEL
// is a default the bake overrides from the command line (--provider, --preset),
// so it says what a bake WOULD use, not what shipped. This test used to read it
// and passed happily while the page credited OpenAI for a reading baked in
// Gemini — the guard and the error agreed with each other. The manifest is
// written by the bake itself and is the only record of what a reader hears.
test('the stated narration model matches what was actually baked', () => {
  const manifest = JSON.parse(read('audio/narration/manifest.json'));
  assert.ok(manifest.model, 'the manifest records the model it baked with');
  assert.equal(TTS_MODEL, manifest.model,
    `the about page says ${TTS_MODEL} but the narration was baked with ${manifest.model}`);
  assert.ok(flat.includes(TTS_MODEL), 'the model is named in the prose');
});

test('every link is safe, and the expected links are present', () => {
  // Two kinds are allowed and nothing else. An OUTBOUND link must be absolute
  // https — never http, never javascript:, and never protocol-relative, which
  // would silently follow the page's own scheme. An IN-BOOK link must be a plain
  // relative path: no scheme, and no leading slash, so it resolves beside
  // index.html whether the book is served from a domain root or a subpath.
  const links = SECTIONS.flatMap((s) => s.parts.filter(Array.isArray));
  assert.ok(links.length >= 3, 'the site, the source and the plain text are linked');
  for (const [text, href] of links) {
    assert.ok(text && text.trim(), 'a link has visible text');
    const outbound = /^https:\/\//.test(href);
    const inBook = /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(href);
    assert.ok(outbound || inBook, `${href} is neither absolute https nor a plain relative path`);
  }
  const hrefs = links.map((l) => l[1]);
  assert.ok(hrefs.includes(SITE), 'Frank’s site is linked');
  assert.ok(hrefs.includes(SOURCE_URL), 'the transcription source is linked');
  assert.ok(hrefs.includes(BOOK_MD), 'the whole-text page is linked');
});

test('an in-book link points at a file that is actually there', () => {
  // The one failure mode a relative href has that an absolute one does not:
  // it can rot silently when the file is renamed, and nothing in the browser
  // would say so until a reader clicked it.
  read(BOOK_MD);
});

test('the rights line names the holder and the year', () => {
  const rights = SECTIONS.find((s) => s.label === 'Rights');
  const txt = rights.parts.join('');
  assert.match(txt, /©\s*2026\s*Frank Force/);
  assert.match(txt, /All rights reserved/i);
});
