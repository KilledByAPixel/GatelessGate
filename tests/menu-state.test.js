import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, continueTarget } from '../src/ui/menu_state.js';

const CASES = [
  { id: 1, slug: 'a', title: 'A', extra: false },
  { id: 29, slug: 'wind', title: 'Wind', extra: false },
  { id: 49, slug: 'amban', title: 'Amban', extra: true },
];
const reg = (slug) => slug === 'wind';

test('buildRows reflects registration and progress', () => {
  const rows = buildRows(CASES, { read: { wind: true }, sat: { wind: true } }, reg);
  const wind = rows.find((r) => r.slug === 'wind');
  assert.equal(wind.registered, true);
  assert.equal(wind.read, true);
  assert.equal(wind.sat, true);
  const a = rows.find((r) => r.slug === 'a');
  assert.equal(a.registered, false);
  assert.equal(a.read, false);
});

test('continueTarget prefers lastSlug, then first read, else null', () => {
  assert.equal(continueTarget(CASES, { read: {} }, 'wind'), 'wind');
  assert.equal(continueTarget(CASES, { read: { a: true } }, null), 'a');
  assert.equal(continueTarget(CASES, { read: {} }, null), null);
  assert.equal(continueTarget(CASES, { read: {} }, 'ghost'), null); // unknown slug ignored
});
