import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { washMaterial, setSeal } from '../src/render/material.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT, ACCENT_PALE } from '../src/palette.js';

test('washMaterial: a MeshLambertMaterial, flatShading pinned, side and color honoured', () => {
  const m = washMaterial({ color: '#336699' });
  assert.ok(m.isMeshLambertMaterial, 'washMaterial must return a MeshLambertMaterial');

  // The deleted toon test pinned flatShading both ways; this is the same pin,
  // carried into washMaterial. flatShading is unpinned nowhere else — a grep
  // for it across tests/ turns up nothing — even though ~50 kit builders pass
  // flat: true, so a regression here would render every faceted form smooth
  // with no other test noticing.
  assert.equal(washMaterial().flatShading, false, 'flat defaults to false');
  assert.equal(washMaterial({ flat: true }).flatShading, true, 'flat: true sets flatShading');

  assert.equal(washMaterial({ side: THREE.BackSide }).side, THREE.BackSide);
  assert.equal(washMaterial().side, THREE.FrontSide, 'side defaults to FrontSide');

  assert.equal(m.color.getHexString(), new THREE.Color('#336699').getHexString());
});

test('washMaterial: the seal glow lights an accent colour and leaves a non-accent one alone', () => {
  for (const color of [ACCENT, ACCENT_DEEP, ACCENT_LIGHT]) {
    const m = washMaterial({ color });
    assert.equal(m.emissiveIntensity, 0.5, `${color} is a seal colour and should glow`);
    assert.equal(m.emissive.getHexString(), new THREE.Color(color).getHexString());
  }

  // ACCENT_PALE is red-family but not one of the three seal colours the
  // module keys off (see material.js's SEAL set) — it must not glow.
  const pale = washMaterial({ color: ACCENT_PALE });
  assert.equal(pale.emissiveIntensity, 1, 'a non-seal colour gets no glow');
  assert.equal(pale.emissive.getHexString(), '000000');

  // glow: false opts an accent-coloured surface OUT, e.g. a big lit surface
  // where emissive would flatten Lambert's own shading (case 30's pond).
  const optedOut = washMaterial({ color: ACCENT, glow: false });
  assert.equal(optedOut.emissiveIntensity, 1, 'glow: false must opt out even for a seal colour');
  assert.equal(optedOut.emissive.getHexString(), '000000');
});

test('setSeal mutates emissive/emissiveIntensity in place and toggles cleanly', () => {
  const m = washMaterial({ color: '#336699' });
  assert.equal(m.emissiveIntensity, 1, 'a non-accent material starts unlit');

  setSeal(m, true, ACCENT);
  assert.equal(m.emissiveIntensity, 0.5);
  assert.equal(m.emissive.getHexString(), new THREE.Color(ACCENT).getHexString());

  setSeal(m, false);
  assert.equal(m.emissiveIntensity, 1);
  assert.equal(m.emissive.getHexString(), '000000');

  // a material with no .emissive (e.g. a bare object) is returned untouched
  // rather than throwing
  const notAMaterial = {};
  assert.equal(setSeal(notAMaterial, true, ACCENT), notAMaterial);
});
