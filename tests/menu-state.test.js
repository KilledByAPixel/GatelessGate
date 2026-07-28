import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, continueTarget } from '../src/ui/menu_state.js';

const CASES = [
  { id: 1, slug: 'a', title: 'A', extra: false },
  { id: 29, slug: 'wind', title: 'Wind', extra: false },
  { id: 49, slug: 'amban', title: 'Amban', extra: true },
];
const reg = (slug) => slug === 'wind';

test('buildRows reflects staging and progress', () => {
  const rows = buildRows(CASES, { read: { wind: true }, sat: { wind: true } }, reg);
  const wind = rows.find((r) => r.slug === 'wind');
  assert.equal(wind.staged, true, 'has a diorama of its own');
  assert.equal(wind.read, true);
  assert.equal(wind.sat, true);

  // Unstaged rows are still ROWS the reader can open — `staged` only decides how
  // the row is drawn. Nothing in the menu withholds a case any more.
  const a = rows.find((r) => r.slug === 'a');
  assert.equal(a.staged, false);
  assert.equal(a.read, false);
  assert.equal(rows.length, CASES.length, 'every case appears');
});

test('continueTarget prefers lastSlug, then first read, else null', () => {
  assert.equal(continueTarget(CASES, { read: {} }, 'wind'), 'wind');
  assert.equal(continueTarget(CASES, { read: { a: true } }, null), 'a');
  assert.equal(continueTarget(CASES, { read: {} }, null), null);
  assert.equal(continueTarget(CASES, { read: {} }, 'ghost'), null); // unknown slug ignored
});

const ENTRIES = [
  { id: null, slug: 'preface', title: "Mumon's Preface" },
  ...CASES,
  { id: null, slug: 'afterword', title: 'Afterword' },
];

test('the matter pages are rows like any other', () => {
  const rows = buildRows(ENTRIES, { read: { preface: true }, sat: {} }, reg);
  assert.equal(rows.length, ENTRIES.length);
  const pre = rows.find((r) => r.slug === 'preface');
  assert.equal(pre.id, null, 'no number is what makes the number cell empty');
  assert.equal(pre.read, true, 'a page you have read is marked, number or not');
  assert.equal(pre.title, "Mumon's Preface");
});

test('continue can land on a matter page', () => {
  assert.equal(continueTarget(ENTRIES, { read: {} }, 'afterword'), 'afterword');
});
