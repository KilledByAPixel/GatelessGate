import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageShape, SECTIONS, LABELS, narrationQueue } from '../src/ui/scroll_state.js';
import MATTER from '../src/koans/text/matter.js';

test('a numbered case keeps the shape it always had', () => {
  const s = pageShape({ id: 29, text: { case: 'a', comment: 'b', verse: 'c' } });
  assert.deepEqual(s.sections, SECTIONS);
  assert.deepEqual(s.labels, LABELS);
  assert.equal(s.showSeal, true);
  assert.equal(s.showNarration, true);
});

test('a page with no number shows no seal and no narration controls', () => {
  const s = pageShape({ id: null, ...MATTER.preface });
  assert.equal(s.showSeal, false, 'the seal is a case number; this page has none');
  assert.equal(s.showNarration, false, 'the 147 baked files are cases only');
});

test('the matter pages bring their own sections and labels', () => {
  const pre = pageShape({ id: null, ...MATTER.preface });
  assert.deepEqual(pre.sections, ['preface']);
  assert.equal(pre.labels.preface, '', 'the single section is deliberately unlabelled');

  const aft = pageShape({ id: null, ...MATTER.afterword });
  assert.deepEqual(aft.sections, ['afterword', 'warnings', 'amban']);
  assert.equal(aft.labels.afterword, "Mumon's Afterword");
  assert.equal(aft.labels.warnings, 'Zen Warnings');
  assert.equal(aft.labels.amban, "Amban's Letter");
});

test('the afterword ends the book on Amban', () => {
  assert.equal(MATTER.afterword.sections.at(-1), 'amban');
  assert.match(MATTER.afterword.text.amban, /Say it quick/);
});

test('the narration queue is empty for a page that has no narration', () => {
  assert.deepEqual(narrationQueue(MATTER.preface.text, MATTER.preface.sections), []);
  assert.deepEqual(narrationQueue({ case: 'a', verse: 'c' }), ['case', 'verse']);
});
