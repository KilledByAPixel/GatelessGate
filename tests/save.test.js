import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../src/save.js';

function fakeStorage(seed = {}) {
  const d = { ...seed };
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; } };
}

test('blank state when empty', () => {
  const s = createSave(fakeStorage());
  assert.deepEqual(s.state(), {
    read: {}, sat: {}, touched: {}, soundOn: true, lastSlug: null, onboarded: false, theme: 'light',
  });
});

test('the reading light is remembered, and a junk one reads as light', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.setTheme('dark');
  assert.equal(s.state().theme, 'dark');
  assert.equal(JSON.parse(st.d['gateless-gate-v1']).theme, 'dark', 'not persisted');
  assert.equal(createSave(st).state().theme, 'dark', 'not read back');
  s.setTheme('sepia');
  assert.equal(s.state().theme, 'light', 'only the two skins exist');
});

// A save written before the setting existed must not open the book in the dark.
test('an old save with no theme opens light', () => {
  const st = fakeStorage({ 'gateless-gate-v1': JSON.stringify({ read: { a: true }, sat: {} }) });
  assert.equal(createSave(st).state().theme, 'light');
});

test('markRead sets read + lastSlug and persists', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markRead('wind-flag');
  assert.equal(s.state().read['wind-flag'], true);
  assert.equal(s.state().lastSlug, 'wind-flag');
  const reloaded = createSave(st);
  assert.equal(reloaded.state().read['wind-flag'], true);
  assert.equal(reloaded.state().lastSlug, 'wind-flag');
});

test('markSat, setSound, setOnboarded persist', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markSat('wind-flag'); s.setSound(false); s.setOnboarded();
  const r = createSave(st).state();
  assert.equal(r.sat['wind-flag'], true);
  assert.equal(r.soundOn, false);
  assert.equal(r.onboarded, true);
});

// The third mark, beside read and sat: the reader found the thing the page
// answers to. It must NOT move lastSlug — Continue means "where you were
// reading", and touching a bell on a page you arrived at by deep link should
// not repoint it.
test('markTouched persists and leaves lastSlug alone', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markRead('wind-flag');
  s.markTouched('gutei');
  assert.equal(s.state().touched['gutei'], true);
  assert.equal(s.state().lastSlug, 'wind-flag', 'a touch is not a reading');
  assert.equal(createSave(st).state().touched['gutei'], true, 'not persisted');
});

// A save written before touches were tracked must not throw on the first one.
test('an old save with no touched map takes a touch', () => {
  const st = fakeStorage({ 'gateless-gate-v1': JSON.stringify({ read: { a: true }, sat: {} }) });
  const s = createSave(st);
  assert.deepEqual(s.state().touched, {});
  s.markTouched('a');
  assert.equal(s.state().touched['a'], true);
});

test('clearMark wipes all three marks for one page and nothing else', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markRead('a'); s.markTouched('a'); s.markSat('a');
  s.markRead('b'); s.markTouched('b'); s.markSat('b');
  s.clearMark('a');
  assert.equal(s.state().read['a'], undefined);
  assert.equal(s.state().touched['a'], undefined);
  assert.equal(s.state().sat['a'], undefined);
  assert.equal(s.state().read['b'], true, 'its neighbour is untouched');
  assert.equal(s.state().touched['b'], true);
  assert.equal(s.state().sat['b'], true);
  assert.equal(createSave(st).state().read['a'], undefined, 'not persisted');
});

// Continue would otherwise offer the very page whose mark the reader just
// wiped — the one inconsistency in this that is visible on the page.
test('clearing the page Continue points at forgets it', () => {
  const s = createSave(fakeStorage());
  s.markRead('a');
  s.markRead('b');
  s.clearMark('a');
  assert.equal(s.state().lastSlug, 'b', 'clearing another page leaves it');
  s.clearMark('b');
  assert.equal(s.state().lastSlug, null);
});

test('clearing a page with no marks is a no-op', () => {
  const s = createSave(fakeStorage());
  s.markRead('a');
  assert.doesNotThrow(() => s.clearMark('ghost'));
  assert.equal(s.state().read['a'], true);
  assert.equal(s.state().lastSlug, 'a');
});

test('clearAll wipes every mark on every page, and Continue with them', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markRead('a'); s.markTouched('a'); s.markSat('a');
  s.markRead('b'); s.markTouched('c');
  s.clearAll();
  assert.deepEqual(s.state().read, {});
  assert.deepEqual(s.state().sat, {});
  assert.deepEqual(s.state().touched, {});
  assert.equal(s.state().lastSlug, null);
  assert.deepEqual(createSave(st).state().read, {}, 'not persisted');
});

// Clearing your marks is not asking to be put back in the light with the sound
// on. This is the whole reason clearAll is written out rather than reassigning
// a blank state.
test('clearAll keeps the settings', () => {
  const s = createSave(fakeStorage());
  s.setSound(false); s.setTheme('dark'); s.setOnboarded();
  s.markRead('a');
  s.clearAll();
  assert.equal(s.state().soundOn, false);
  assert.equal(s.state().theme, 'dark');
  assert.equal(s.state().onboarded, true);
});

test('clearing an already-clear book is a no-op', () => {
  const s = createSave(fakeStorage());
  assert.doesNotThrow(() => s.clearAll());
  assert.deepEqual(s.state().read, {});
});

test('corrupt JSON falls back to blank', () => {
  const s = createSave(fakeStorage({ 'gateless-gate-v1': '{not json' }));
  assert.deepEqual(s.state().read, {});
  assert.equal(s.state().soundOn, true);
});
