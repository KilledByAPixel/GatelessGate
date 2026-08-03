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
  // the ring reports its own tube index (0-4); the three singles substitute
  // their own note (-1, 5, 9 — see k29.js's SINGLE_NOTES) for the index a
  // tubes:1 chime always reports, so a real strike lands on one of these
  // eight values and never anything else
  for (const s of struck) {
    assert.ok([-1, 0, 1, 2, 3, 4, 5, 9].includes(s.tube), `unexpected tube ${s.tube}`);
    assert.ok(s.force > 0 && s.force <= 1);
  }
  const frag = k.fragment();
  assert.equal(frag.strikes + frag.singleStrikes, struck.length,
    'every strike reaching audio came from either the ring or a single');
});

test('three single-tube chimes hang under the gate at three different heights', () => {
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const audio = { startAmbience() {}, stopAmbience() {}, setWindLevel() {}, chimeStrike() {} };
  const k = k29.build({ audio, input });

  const gate = k.scene.getObjectByName('gate');
  assert.ok(gate, 'gate present');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  assert.equal(chimes.length, 4, 'the ring plus three singles, all children of the gate');

  // a single carries exactly one 'tube' mesh; the ring carries five — this is
  // how the test tells them apart without reaching into k29's own closure
  const singles = chimes.filter((c) => {
    let tubes = 0;
    c.traverse((o) => { if (o.name === 'tube') tubes++; });
    return tubes === 1;
  });
  assert.equal(singles.length, 3, 'exactly three single-tube chimes');

  k.scene.updateMatrixWorld(true);
  const heights = singles.map((c) => {
    let y = null;
    c.traverse((o) => { if (o.name === 'tube') y = o.getWorldPosition(new THREE.Vector3()).y; });
    return y;
  });
  // a wrong-but-plausible implementation that gives every single the same
  // default cord (or forgets to vary it) would still satisfy "three singles
  // exist" but hang dead level — checking the SET of heights, not just that
  // three numbers were produced, is what catches that
  const distinct = new Set(heights.map((h) => h.toFixed(4)));
  assert.equal(distinct.size, 3, `singles should hang at three different heights, got ${heights}`);
});

test('the three singles sound three different notes, not the ring index', () => {
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push(o),
  };
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const k = k29.build({ audio, input });

  // long enough for every chime's own slow weather (each single carries its
  // own phase offset) to strike at least once
  for (let i = 0; i < 60 * 400; i++) k.update(1 / 60, i / 60);

  const tubes = new Set(struck.map((s) => s.tube));
  // THE GOTCHA: a tubes:1 chime always reports its own tube index as 0 —
  // if k29.js forwarded that raw index instead of substituting its own note,
  // every single would show up indistinguishable from the ring's own tube-0
  // strikes, and 5 and 9 would never appear. Checking for the actual
  // literal values that reached the STUB (not re-importing the constant
  // k29.js used to produce them) also catches the copy-paste version of the
  // bug, where all three singles were wired to the same one note.
  for (const note of [-1, 5, 9]) {
    assert.ok(tubes.has(note), `single note ${note} never reached the audio stub (saw: ${[...tubes]})`);
  }
});

test('stilling the wind stills the singles too, not just the ring', () => {
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push(o),
  };
  const taps = [];
  const input = { onHover() {}, onTap: (cb) => taps.push(cb), raycastFirst: () => null };
  const k = k29.build({ audio, input });
  k.setCamera(new THREE.PerspectiveCamera());
  const cloth = k.scene.getObjectByName('cloth');

  for (let i = 0; i < 60 * 200; i++) k.update(1 / 60, i / 60);
  const before = struck.length;
  assert.ok(before > 0, 'nothing struck in 200s of wind — test cannot prove stilling silences anything');

  // tap the cloth: same mechanism as the pre-existing tap test above
  input.raycastFirst = (cam, targets) => (
    targets.includes(cloth) ? { object: cloth, point: new THREE.Vector3(0, 3, 0) } : null
  );
  taps.forEach((cb) => cb());
  assert.equal(k.fragment().windOn, false, 'tap should have stilled the wind');

  // WIND_TAU is 0.7s (src/kit/flag.js), so windLevel is at the floor well
  // inside 10s; give it that settling room uncounted, then prove nothing
  // rings — ring OR single — once the wind has actually stopped
  for (let i = 0; i < 60 * 10; i++) k.update(1 / 60, 200 + i / 60);
  const settled = struck.length;
  for (let i = 0; i < 60 * 150; i++) k.update(1 / 60, 210 + i / 60);
  assert.equal(struck.length, settled,
    `a stilled scene must ring nothing, ring or single (${struck.length - settled} strikes after stilling)`);
});

test('a tap rings exactly one chime, even with several hanging, and never also toggles the wind', () => {
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push(o),
  };
  const taps = [];
  const input = { onHover() {}, onTap: (cb) => taps.push(cb), raycastFirst: () => null };
  const k = k29.build({ audio, input });
  k.setCamera(new THREE.PerspectiveCamera());

  const gate = k.scene.getObjectByName('gate');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  const single = chimes.find((c) => {
    let tubes = 0;
    c.traverse((o) => { if (o.name === 'tube') tubes++; });
    return tubes === 1;
  });
  assert.ok(single, 'at least one single-tube chime is a child of the gate');
  let sleeve = null;
  single.traverse((o) => { if (o.name === 'tube-hit') sleeve = o; });
  assert.ok(sleeve, 'the single exposes a tube sleeve to pick');
  const cloth = k.scene.getObjectByName('cloth');

  // raycastFirst is keyed on object identity: a hit ONLY when the queried
  // array actually contains this one single's sleeve or the flag's cloth —
  // never the ring's own sleeves/drum. Making the cloth hittable too (not
  // just the sleeve, as a narrower version of this fixture once did) is what
  // lets the test see the real consequence of a missing `return` after
  // ringing a chime: the handler falling through to also treat the same tap
  // as a hit on the flag and toggle the wind. A sleeve-only fixture can never
  // observe that fallthrough, because the flag-mesh query would always miss
  // regardless of whether the return is there.
  input.raycastFirst = (cam, targets) => {
    if (targets.includes(sleeve)) return { object: sleeve, point: new THREE.Vector3() };
    if (targets.includes(cloth)) return { object: cloth, point: new THREE.Vector3(0, 3, 0) };
    return null;
  };
  taps.forEach((cb) => cb());
  assert.equal(struck.length, 1, `one tap on one chime's sleeve should ring exactly one chime, got ${struck.length}`);
  assert.equal(k.fragment().windOn, true, 'ringing a chime must not also toggle the wind');
});
