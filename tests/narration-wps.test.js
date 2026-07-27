import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, countParagraphs, mean, findPaceOutliers } from '../scripts/lib/narration-wps.js';

test('countWords collapses whitespace and handles empty', () => {
  assert.equal(countWords('the flag is moving'), 4);
  assert.equal(countWords('  spaced   out \n words '), 3);
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
});

test('countParagraphs splits on blank lines, ignoring trailing space', () => {
  assert.equal(countParagraphs('one paragraph only'), 1);
  assert.equal(countParagraphs('first\n\nsecond'), 2);
  assert.equal(countParagraphs('a\n\n  \n\nb'), 2);      // a run of blank lines is one break
  assert.equal(countParagraphs('a\n\nb\n\nc'), 3);
});

test('mean of empty is zero', () => {
  assert.equal(mean([]), 0);
  assert.equal(mean([2, 4]), 3);
});

// A healthy section: every unit reads at ~2 words/sec of actual speech, plus the
// pause budget the model credits back. seconds = words/2 + breaks*0.5 + 0.25.
const healthy = (specs, section = 'case') => specs.map(({ words, paras = 1 }, i) => ({
  key: `${i + 1}:${section}`, section, words, paras,
  seconds: words / 2 + (paras - 1) * 0.5 + 0.25,
}));
const SPECS = [{ words: 20 }, { words: 40 }, { words: 60 }, { words: 90 }, { words: 120 }, { words: 200 }];

test('a healthy section flags nothing', () => {
  assert.deepEqual(findPaceOutliers(healthy(SPECS)).flagged, []);
});

test('a multi-paragraph unit is not penalised once its breaks are credited', () => {
  // Same speaking pace, but three paragraphs. Without the pause credit its raw wps
  // would look slow; with it, it sits on the section mean.
  const rows = [...healthy(SPECS), { key: '9:case', section: 'case', words: 60, paras: 3, seconds: 60 / 2 + 2 * 0.5 + 0.25 }];
  assert.ok(findPaceOutliers(rows).flagged.every((f) => f.key !== '9:case'));
});

test('flags a dropout as fast for its section', () => {
  // 100 words of text but only ~35s spoken — the model raced because it skipped some.
  const rows = [...healthy(SPECS), { key: '9:case', section: 'case', words: 100, paras: 1, seconds: 100 / 3 + 0.25 }];
  const { flagged } = findPaceOutliers(rows);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].key, '9:case');
  assert.equal(flagged[0].kind, 'fast');
});

test('flags a repeat/padding as slow for its section', () => {
  // 60 words but ~60s spoken — a line repeated, or long dead air.
  const rows = [...healthy(SPECS), { key: '9:case', section: 'case', words: 60, paras: 1, seconds: 60 + 0.25 }];
  const { flagged } = findPaceOutliers(rows);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].kind, 'slow');
});

test('verses are judged against verses, not prose', () => {
  // Verses read slower; a shared baseline would flag them all.
  const verses = SPECS.map(({ words }, i) => ({
    key: `${i + 1}:verse`, section: 'verse', words, paras: 1, seconds: words / 1.3 + 0.25,
  }));
  const { flagged, means } = findPaceOutliers([...healthy(SPECS), ...verses]);
  assert.deepEqual(flagged, []);
  assert.ok(means.case > means.verse);
});

test('a tiny unit is flagged but marked short/noisy', () => {
  // 8 words spoken very slowly — flagged slow, but tagged short so the reader knows
  // fixed per-unit overhead this model cannot remove may be the whole story.
  const rows = [...healthy(SPECS), { key: '9:case', section: 'case', words: 8, paras: 1, seconds: 8 + 0.25 }];
  const hit = findPaceOutliers(rows).flagged.find((f) => f.key === '9:case');
  assert.ok(hit);
  assert.equal(hit.short, true);
});

test('a sample too small to set a baseline is not judged', () => {
  const rows = [
    { key: '1:case', section: 'case', words: 100, paras: 1, seconds: 50 },
    { key: '2:case', section: 'case', words: 100, paras: 1, seconds: 10 },
  ];
  assert.deepEqual(findPaceOutliers(rows).flagged, []);
});
