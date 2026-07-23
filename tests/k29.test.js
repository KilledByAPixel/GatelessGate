import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k29 from '../src/koans/k29.js';
import { clothEnergy } from '../src/sim/verlet.js';

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    accent: k29.accent,
    quality: 'high',
    audio: { setWindLevel() {}, startAmbience() {}, stopAmbience() {}, chimeStrike() {} },
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null, // no hit by default
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

test('module shape matches the koan contract', () => {
  assert.equal(k29.id, 29);
  assert.equal(k29.slug, 'not-the-wind-not-the-flag');
  assert.equal(k29.tier, 2);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k29.text[f] && k29.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.equal(typeof k29.build, 'function');
});

test('build returns a root with a two-monk diorama and lifecycle', () => {
  const root = k29.build(fakeCtx());
  assert.ok(root.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment']) {
    assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
  }
  const monks = [];
  root.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 2, 'two monks argue about the flag');
  assert.ok(root.scene.getObjectByName('flag'), 'flag present');
  const frag = root.fragment();
  assert.equal(typeof frag.windLevel, 'number');
  assert.equal(frag.windOn, true);
});

test('update advances the cloth; tap toggles the wind off', () => {
  const ctx = fakeCtx();
  const root = k29.build(ctx);
  const flagGroup = root.scene.getObjectByName('flag');
  const cloth = root.scene.getObjectByName('cloth');
  for (let i = 1; i <= 30; i++) root.update(1 / 60, i / 60);
  assert.ok(root.fragment().clothEnergy >= 0);
  // simulate a tap on the cloth by making raycastFirst return a hit — but only
  // for queries that actually include the cloth, so the chime's own probe
  // (checked first by the handler) correctly misses and falls through
  root.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = (cam, targets) => (
    targets.includes(cloth) ? { object: cloth, point: new THREE.Vector3(0, 3, 0) } : null
  );
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(root.fragment().windOn, false, 'tapping the flag toggles the wind off');
});

test('the chime hangs under the gate and answers the flag', async () => {
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push(o),
  };
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const k = k29.build({ audio, input });

  assert.ok(k29.ambience.includes('furin'), 'the recipe declares the chime');
  assert.ok(k29.ambience.includes('music'), 'and asks for the swells');

  // 180s of sim, not more: this test proves WIRING (strikes reach the audio
  // engine with valid payloads) — the pacing itself is owned by furin.test.js.
  // Driving the whole case (cloth, meadow) for 600s cost 61s of a 66s suite.
  for (let i = 0; i < 60 * 180; i++) k.update(1 / 60, i / 60);
  assert.ok(struck.length > 5, `the chime never struck: ${struck.length}`);
  for (const s of struck) {
    assert.ok(Number.isInteger(s.tube) && s.tube >= 0 && s.tube < 5);
    assert.ok(s.force > 0 && s.force <= 1);
  }
  assert.equal(k.fragment().strikes, struck.length);
});
