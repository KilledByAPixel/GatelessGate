import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SECTIONS, SITE, SOURCE_URL, THREE_VERSION, TTS_MODEL,
} from '../src/ui/colophon_state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const flat = SECTIONS.map((s) =>
  s.parts.map((p) => (Array.isArray(p) ? p[0] : p)).join('')).join('\n');

test('the colophon covers the four things a colophon owes the reader', () => {
  const labels = SECTIONS.map((s) => s.label);
  for (const want of ['The translation', 'The book', 'This edition', 'Rights', 'Built with']) {
    assert.ok(labels.includes(want), `missing section: ${want}`);
  }
});

test('the translation is credited and its public-domain status stated', () => {
  assert.match(flat, /Nyogen Senzaki and Paul Reps/);
  assert.match(flat, /1934/);
  assert.match(flat, /public domain/);
});

// The version and the model are the two claims that go stale on their own —
// bump Three.js or re-voice the narration and the colophon would quietly start
// lying. These hold it to the files that actually decide.
test('the stated Three.js version matches the vendored one', () => {
  const vendored = read('lib/THREE_VERSION.txt').trim();     // e.g. 0.185.1
  const minor = vendored.split('.')[1];
  assert.equal(THREE_VERSION, `r${minor}`,
    `colophon says ${THREE_VERSION} but lib/THREE_VERSION.txt says ${vendored}`);
  assert.ok(flat.includes(THREE_VERSION), 'the version is stated in the prose');
});

test('the stated narration model matches the bake script', () => {
  const src = read('scripts/lib/narration-voice.js');
  const m = src.match(/export const MODEL\s*=\s*'([^']+)'/);
  assert.ok(m, 'narration-voice.js still declares MODEL');
  assert.equal(TTS_MODEL, m[1],
    `colophon says ${TTS_MODEL} but narration-voice.js bakes with ${m[1]}`);
  assert.ok(flat.includes(TTS_MODEL), 'the model is named in the prose');
});

test('every link is an absolute https url, and both expected links are present', () => {
  const links = SECTIONS.flatMap((s) => s.parts.filter(Array.isArray));
  assert.ok(links.length >= 2, 'the site and the source are both linked');
  for (const [text, href] of links) {
    assert.ok(text && text.trim(), 'a link has visible text');
    assert.match(href, /^https:\/\//, `${href} is absolute https`);
  }
  const hrefs = links.map((l) => l[1]);
  assert.ok(hrefs.includes(SITE), 'Frank’s site is linked');
  assert.ok(hrefs.includes(SOURCE_URL), 'the transcription source is linked');
});

test('the rights line names the holder and the year', () => {
  const rights = SECTIONS.find((s) => s.label === 'Rights');
  const txt = rights.parts.join('');
  assert.match(txt, /©\s*2026\s*Frank Force/);
  assert.match(txt, /All rights reserved/i);
});
