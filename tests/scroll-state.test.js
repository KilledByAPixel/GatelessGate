import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageShape, SECTIONS, LABELS, narrationQueue } from '../src/ui/scroll_state.js';
import MATTER from '../src/koans/text/matter.js';

test('sections are case, comment, verse in order', () => {
  assert.deepEqual(SECTIONS, ['case', 'comment', 'verse']);
});

test('narrationQueue skips empty sections, keeps order', () => {
  assert.deepEqual(narrationQueue({ case: 'a', comment: 'b', verse: 'c' }), ['case', 'comment', 'verse']);
  assert.deepEqual(narrationQueue({ case: 'a', comment: '  ', verse: 'c' }), ['case', 'verse']);
  assert.deepEqual(narrationQueue({ case: '', comment: '', verse: '' }), []);
  assert.deepEqual(narrationQueue({ case: 'a', verse: 'c' }), ['case', 'verse']);
});

test('a numbered case keeps the shape it always had', () => {
  const s = pageShape({ id: 29, text: { case: 'a', comment: 'b', verse: 'c' } });
  assert.deepEqual(s.sections, SECTIONS);
  assert.deepEqual(s.labels, LABELS);
  assert.equal(s.showSeal, true);
  assert.equal(s.showNarration, true);
});

test('a page with no number shows no seal but still reads aloud', () => {
  const s = pageShape({ id: null, ...MATTER.preface });
  assert.equal(s.showSeal, false, 'the seal is a case number; this page has none');
  assert.equal(s.showNarration, true, 'every page in the book is baked');
});

test('the narration queue accepts a page\'s own section names', () => {
  assert.deepEqual(
    narrationQueue(MATTER.preface.text, MATTER.preface.sections),
    ['prose', 'verse'],
  );
  assert.deepEqual(
    narrationQueue(MATTER.afterword.text, MATTER.afterword.sections),
    ['prose', 'verse', 'colophon', 'warnings', 'amban'],
  );
});

test('the queue still skips a section with nothing in it', () => {
  assert.deepEqual(narrationQueue({ prose: 'a', verse: '  ' }, ['prose', 'verse']), ['prose']);
});

test('the matter pages bring their own sections and labels', () => {
  const pre = pageShape({ id: null, ...MATTER.preface });
  assert.deepEqual(pre.sections, ['prose', 'verse']);
  assert.equal(pre.labels.prose, "Mumon's Preface");
  assert.equal(pre.labels.verse, 'The Verse');

  const aft = pageShape({ id: null, ...MATTER.afterword });
  assert.deepEqual(aft.sections, ['prose', 'verse', 'colophon', 'warnings', 'amban']);
  assert.equal(aft.labels.prose, "Mumon's Afterword");
  assert.equal(aft.labels.verse, 'The Verse');
  assert.equal(aft.labels.colophon, 'Colophon');
  assert.equal(aft.labels.warnings, 'Zen Warnings');
  assert.equal(aft.labels.amban, "Amban's Letter");
});

test('the afterword ends the book on Amban', () => {
  assert.equal(MATTER.afterword.sections.at(-1), 'amban');
  assert.match(MATTER.afterword.text.amban, /Say it quick/);
});
