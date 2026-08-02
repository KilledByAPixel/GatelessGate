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
    read: {}, sat: {}, soundOn: true, lastSlug: null, onboarded: false, theme: 'light',
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

test('corrupt JSON falls back to blank', () => {
  const s = createSave(fakeStorage({ 'gateless-gate-v1': '{not json' }));
  assert.deepEqual(s.state().read, {});
  assert.equal(s.state().soundOn, true);
});
