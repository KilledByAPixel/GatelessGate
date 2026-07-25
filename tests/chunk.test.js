import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chunkText, splitParagraphs, splitSentences } from '../scripts/lib/chunk.js';

const CASES = (await import(pathToFileURL('c:/dev/claude/gateless_gate/src/koans/text/mumonkan.js').href)).default;

test('short text stays a single chunk', () => {
  assert.deepEqual(chunkText('A monk asked Joshu.', 650), ['A monk asked Joshu.']);
});

test('every chunk is within the limit', () => {
  const text = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} `.repeat(20).trim()).join('\n\n');
  for (const c of chunkText(text, 650)) assert.ok(c.length <= 650, `chunk ${c.length} > 650`);
});

test('splits happen only at paragraph breaks', () => {
  const paras = ['A'.repeat(400), 'B'.repeat(400), 'C'.repeat(400)];
  const chunks = chunkText(paras.join('\n\n'), 650);
  // No chunk may contain a partial paragraph — each chunk is whole paragraphs joined.
  for (const c of chunks) for (const part of c.split('\n\n')) {
    assert.ok(paras.includes(part), 'chunk contains a non-paragraph fragment');
  }
});

test('packs greedily — 400+400 fit together under 650? no, so they separate', () => {
  const chunks = chunkText(['A'.repeat(300), 'B'.repeat(300)].join('\n\n'), 650);
  assert.equal(chunks.length, 1);   // 300 + 2 + 300 = 602 <= 650
  const two = chunkText(['A'.repeat(400), 'B'.repeat(400)].join('\n\n'), 650);
  assert.equal(two.length, 2);      // 400 + 2 + 400 = 802 > 650
});

test('a single over-long paragraph falls back to sentence packing', () => {
  const para = Array.from({ length: 10 }, (_, i) => `This is sentence number ${i}.`).join(' ');
  const long = para.repeat(6);      // one paragraph, well over 650, no blank lines
  const chunks = chunkText(long, 300);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 300, `sentence chunk ${c.length} > 300`);
});

test('reassembling chunks recovers the source words', () => {
  // The bake must never alter the text — chunking only inserts split points. Compare
  // word sequences so paragraph-join vs space-join differences do not matter.
  const words = (s) => s.replace(/\s+/g, ' ').trim().split(' ');
  for (const id of [2, 28, 42, 23, 1]) {
    const src = CASES[id].case;
    const rejoined = chunkText(src, 650).join(' ');
    assert.deepEqual(words(rejoined), words(src), `case ${id} case text altered by chunking`);
  }
});

test('case 2 — the whisper-decay case — splits into a few paragraph-aligned chunks', () => {
  const chunks = chunkText(CASES[2].case, 650);
  assert.ok(chunks.length >= 3 && chunks.length <= 5, `expected 3-5 chunks, got ${chunks.length}`);
  for (const c of chunks) assert.ok(c.length <= 650);
});

test('splitParagraphs and splitSentences basics', () => {
  assert.deepEqual(splitParagraphs('a\n\nb\n\n\nc'), ['a', 'b', 'c']);
  assert.deepEqual(splitSentences('One. Two! Three?'), ['One.', 'Two!', 'Three?']);
});
