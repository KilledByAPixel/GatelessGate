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

test('the rights line names the holder, the year and the licence', () => {
  const rights = SECTIONS.find((s) => s.label === 'Rights');
  const txt = rights.parts.join('');
  assert.match(txt, /©\s*2026\s*Frank Force/);
  assert.match(txt, /BY-NC-ND 4\.0/);
  // and it still says what is NOT his to license — the reason this page has a
  // rights line at all is that the book is two things with different owners
  assert.match(txt, /1934 translation is in the public domain/);
});

// The page and the repository must not say different things about the terms.
// A reader sees the About page; anyone who lands on GitHub sees LICENSE. They
// were already out of step once: the page said "all rights reserved" while the
// repository carried a Creative Commons licence.
test('the About page and the repository agree on the licence', () => {
  const rights = SECTIONS.find((s) => s.label === 'Rights');
  const url = rights.parts.filter(Array.isArray).map(([, href]) => href)
    .find((h) => /creativecommons\.org/.test(h));
  assert.ok(url, 'the rights line links the licence deed');
  assert.match(url, /by-nc-nd\/4\.0/, `the deed for the licence we actually ship: ${url}`);

  const license = read('LICENSE');
  assert.match(license, /^Attribution-NonCommercial-NoDerivatives 4\.0 International/,
    'LICENSE carries the CC BY-NC-ND 4.0 legal text');
  // the real text, not a stub that links away: all eight sections
  for (let n = 1; n <= 8; n++) {
    assert.ok(license.includes(`Section ${n} --`), `LICENSE is complete: no Section ${n}`);
  }

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.license, 'CC-BY-NC-ND-4.0', 'the SPDX id matches the licence text');

  // and NOTICE.md keeps the two things the licence itself must not be edited
  // to say: what is public domain, and what is MIT
  const notice = read('NOTICE.md');
  // \s+, not a space: NOTICE.md is hard-wrapped prose and the phrase straddles
  // a line break. A test that forces prose to reflow for its own regex is the
  // test being wrong.
  assert.match(notice, /public\s+domain/i, 'NOTICE names the 1934 translation as public domain');
  assert.match(notice, /MIT/, 'NOTICE names the vendored Three.js as MIT');
});
