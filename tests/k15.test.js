import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k15 from '../src/koans/k15.js';
import { noteForSize, makeFurin, SWING, SINGLE_BODY_LEN } from '../src/kit/furin.js';

// Case 15 is Tozan's three blows, and it now hangs three fūrin under Ummon's
// gate — one per blow, which is the reading of the case. What is worth
// protecting here is what makes them THREE rather than one repeated: three
// sizes, three notes, and enough room to swing without passing through each
// other.

const stubs = () => ({
  audio: { startAmbience() {}, stopAmbience() {}, setWindLevel() {}, chimeStrike() {}, knock() {} },
  input: { onHover() {}, onTap() {}, raycastFirst: () => null },
});

test('three chimes hang under the gate, at three sizes, on one line', () => {
  const k = k15.build(stubs());
  const gate = k.scene.getObjectByName('gate');
  assert.ok(gate, 'gate present');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  assert.equal(chimes.length, 3, 'three chimes, one per blow, all children of the gate');

  k.scene.updateMatrixWorld(true);

  // THREE SIZES, not one size hung three times — the thing that makes them
  // read as a set rather than a repetition. Measured off the built geometry
  // (the bell's own length in units of size, kit/furin.js's SINGLE_BODY_LEN),
  // never retyped from k15.js.
  const sizes = chimes.map((c) => {
    let s = null;
    c.traverse((o) => { if (o.name === 'tube') s = o.geometry.parameters.height / SINGLE_BODY_LEN; });
    return s;
  });
  assert.equal(new Set(sizes.map((s) => s.toFixed(4))).size, 3, `three sizes expected, got ${sizes}`);

  // ...and therefore three NOTES. A case that overrode the note (as this one
  // used to, reporting a flat `tube: 2` whatever it had built) would hang
  // three visibly different objects that all sounded the same.
  const notes = sizes.map(noteForSize);
  assert.equal(new Set(notes).size, 3, `three sizes should imply three notes, got ${notes}`);

  // the bells reach one line, so the set reads as three SIZES rather than
  // three heights (k29's own rule, and what the absolute cords are for)
  const bottoms = chimes.map((c) => {
    const box = new THREE.Box3();
    c.traverse((o) => { if (o.isMesh && o.name === 'tube') box.union(new THREE.Box3().setFromObject(o)); });
    return box.min.y;
  });
  const spread = Math.max(...bottoms) - Math.min(...bottoms);
  assert.ok(spread < 0.05, `the three bells should hang on one line; spread ${spread.toFixed(4)} (${bottoms})`);
});

test('the three notes actually reach the audio engine, one per chime', () => {
  // Behavioural, not structural: the test above proves the GEOMETRY differs,
  // this proves the difference survives all the way to a strike. A case that
  // built three sizes and then forwarded a constant would pass that one and
  // fail this.
  const struck = [];
  const s = stubs();
  s.audio.chimeStrike = (o) => struck.push(o.tube);
  const k = k15.build(s);
  for (let i = 0; i < 60 * 400; i++) k.update(1 / 60, i / 60);

  assert.ok(struck.length > 3, `too few strikes to judge: ${struck.length}`);
  const heard = new Set(struck);
  assert.equal(heard.size, 3, `all three chimes should have sounded their own note, heard ${[...heard]}`);
  // and nothing else got in: every strike is one of the three sizes' notes
  const expected = new Set([0.20, 0.15, 0.11].map(noteForSize));
  for (const n of heard) assert.ok(expected.has(n), `unexpected note ${n} (expected one of ${[...expected]})`);
});

test("case 15's chimes stay clear of each other at the LIVE swing cap, counter-phase", () => {
  // Same guard case 29 carries, and for the same reason: the spacing was chosen
  // against a particular SWING.maxOmegaFrac, and raising that cap is exactly
  // what someone would do next: the swing has been asked to get BIGGER twice
  // now, never smaller. Recomputed from the real staged scene and the live
  // constant, so raising it past what this gate's lintel tolerates fails here
  // rather than silently pushing two chimes through each other.
  //
  // theta at the energy cap's saturation point has no L in it (pendulumEnergy's
  // omega0^2 cancels), so one probe stands in for all three sizes at once.
  const probe = makeFurin({ seed: 999, phase: 0, onStrike: () => {} });
  probe.setWindLevel(0);
  const probeSwing = probe.group.getObjectByName('swing');
  for (let i = 0; i < 50; i++) probe.ring(1);        // burst, the saturating scenario
  let theta = 0;
  for (let i = 0; i < 60 * 5; i++) {
    probe.update(1 / 60, 1 + i / 60);
    theta = Math.max(theta, Math.abs(probeSwing.rotation.z));
  }
  assert.ok(theta > 0.1, `probe never swung — cannot judge clearance: ${theta}`);

  const k = k15.build(stubs());
  const gate = k.scene.getObjectByName('gate');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  k.scene.updateMatrixWorld(true);
  const ordered = chimes
    .map((group) => ({ group, x: group.getWorldPosition(new THREE.Vector3()).x }))
    .sort((a, b) => a.x - b.x);

  // VISIBLE meshes only: the invisible oversized pick drums are allowed to
  // overlap, since a forgiving tap zone is not a visual bug
  const VISIBLE = new Set(['cord', 'tube', 'cap', 'tag', 'tag-thread']);
  function boxAtSign(group, sign) {
    const swing = group.getObjectByName('swing');
    const before = swing.rotation.z;
    swing.rotation.z = sign * theta;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    group.traverse((n) => {
      if (n.isMesh && VISIBLE.has(n.name)) box.union(new THREE.Box3().setFromObject(n));
    });
    swing.rotation.z = before;        // leave the real scene exactly as found
    group.updateMatrixWorld(true);
    return box;
  }
  // TRUE worst case per pair: each chime carries its own `phase`, so any sign
  // combination is physically reachable — two ordinary taps half a period
  // apart reach it, or one tap against an existing wind lean.
  const MIN_MARGIN = 0.02;
  for (let i = 0; i < ordered.length - 1; i++) {
    let worst = Infinity;
    for (const sa of [1, -1]) {
      for (const sb of [1, -1]) {
        worst = Math.min(worst, boxAtSign(ordered[i + 1].group, sb).min.x - boxAtSign(ordered[i].group, sa).max.x);
      }
    }
    assert.ok(worst > MIN_MARGIN,
      `chimes at x=${ordered[i].x.toFixed(3)} and x=${ordered[i + 1].x.toFixed(3)} come within ${worst.toFixed(4)} ` +
      `at the LIVE SWING.maxOmegaFrac=${SWING.maxOmegaFrac} (theta=${theta.toFixed(4)}) — need > ${MIN_MARGIN}. ` +
      `Widen CHIME_X in src/koans/k15.js or lower the cap.`);
  }
});

test('the three chimes clear the gate\'s own cross-tie', () => {
  // The tanzaku hangs below the bell now, so a chime reaches deeper than it
  // used to — and this gate has a nuki spanning the full width right under
  // them. Rest is the worst case: swinging only ever shortens the drop.
  const k = k15.build(stubs());
  const gate = k.scene.getObjectByName('gate');
  k.scene.updateMatrixWorld(true);

  // read the tie beam's own top face off the built gate rather than
  // recomputing it from k15's height constant
  let nukiTop = -Infinity;
  gate.traverse((o) => {
    if (o.isMesh && o.name === 'tie') nukiTop = Math.max(nukiTop, new THREE.Box3().setFromObject(o).max.y);
  });
  assert.ok(Number.isFinite(nukiTop) && nukiTop > 0, 'no cross-tie found on the gate to measure against');

  for (const c of gate.children.filter((n) => n.name === 'furin')) {
    const box = new THREE.Box3();
    c.traverse((o) => { if (o.isMesh && o.material.visible !== false) box.union(new THREE.Box3().setFromObject(o)); });
    assert.ok(box.min.y > nukiTop,
      `a chime reaches to y=${box.min.y.toFixed(3)}, through the cross-tie at ${nukiTop.toFixed(3)}`);
  }
});

test('a tap rings one chime and never also starts a beating', () => {
  // The chimes' hit drums sit INSIDE the gate's big forgiving hit-box, so the
  // handler has to probe them first and return. Both halves matter: one tap
  // must not ring two chimes, and it must not also set Ummon's stick going.
  let onTap = null;
  const s = stubs();
  s.input.onTap = (fn) => { onTap = fn; };
  const struck = [];
  s.audio.chimeStrike = (o) => struck.push(o.tube);
  const knocks = [];
  s.audio.knock = () => knocks.push(1);

  const k = k15.build(s);
  k.setCamera(new THREE.PerspectiveCamera());
  const gate = k.scene.getObjectByName('gate');
  const chimes = gate.children.filter((c) => c.name === 'furin');

  // EVERY sleeve AND the gate box are hittable — which is the real geometry
  // (all three drums sit inside that box) and the only stub that puts the
  // handler's `return` under test at all. A first draft made only ONE
  // sleeve hittable, so the gate box was never reachable and deleting the
  // return changed nothing: the mutation survived and the test was reporting
  // a protection it did not have.
  const sleeves = [];
  for (const c of chimes) c.traverse((o) => { if (o.name === 'tube-hit') sleeves.push(o); });
  assert.equal(sleeves.length, 3, 'each chime should expose a tube sleeve to pick');
  const gateHit = k.scene.getObjectByName('gate-hit');
  assert.ok(gateHit, 'the gate hit-box is there to be fallen through to');
  s.input.raycastFirst = (cam, targets) => {
    const s0 = targets.find((t) => sleeves.includes(t));
    if (s0) return { object: s0 };
    return targets.includes(gateHit) ? { object: gateHit } : null;
  };

  onTap();
  assert.equal(struck.length, 1, `one tap should ring exactly one chime, got ${struck.length}`);

  // drive long enough that a beating, if one had started, would have landed
  for (let i = 0; i < 60 * 4; i++) k.update(1 / 60, i / 60);
  assert.equal(k.fragment().beatings, 0, 'ringing a chime must not also start the beating');
  assert.equal(knocks.length, 0, `ringing a chime sounded ${knocks.length} blows`);

  // ...and the gate itself DOES still start one, or the check above would
  // pass just as well on a handler that had stopped working entirely
  s.input.raycastFirst = (cam, targets) => (targets.includes(gateHit) ? { object: gateHit } : null);
  onTap();
  for (let i = 0; i < 60 * 4; i++) k.update(1 / 60, (240 + i) / 60);
  assert.equal(k.fragment().beatings, 1, 'tapping the gate itself should still start the beating');
  assert.equal(knocks.length, 3, `the beating should be three blows, got ${knocks.length}`);
});

test('the staff comes down with each blow, and is still between beatings', () => {
  // The interaction audit reversed the original never-moves staging note — the
  // staff tips about its planted base once per knock, at empty air, and rests
  // at exactly its built pose otherwise.
  let onTap = null;
  const s = stubs();
  s.input.onTap = (fn) => { onTap = fn; };
  const k = k15.build(s);
  k.setCamera(new THREE.PerspectiveCamera());
  const staff = k.scene.getObjectByName('staff');
  assert.ok(staff, 'Ummon holds the stick');

  k.update(1 / 60, 0);
  assert.equal(staff.rotation.x, 0, 'at rest before any beating');

  const gateHit = k.scene.getObjectByName('gate-hit');
  s.input.raycastFirst = (cam, targets) => (targets.includes(gateHit) ? { object: gateHit } : null);
  onTap();

  // three dips, one per blow: count the frames-with-motion transitions
  let peaks = 0, moving = false, peak = 0;
  for (let t = 0; t < 3.0; t += 1 / 60) {
    k.update(1 / 60, t);
    const tip = staff.rotation.x;
    peak = Math.max(peak, tip);
    if (tip > 0.02 && !moving) { moving = true; peaks++; }
    if (tip <= 0.02) moving = false;
  }
  assert.equal(peaks, 3, `one dip per blow, got ${peaks}`);
  assert.ok(peak > 0.1, `the dip is legible, peak ${peak.toFixed(3)}`);
  assert.equal(staff.rotation.x, 0, 'and it rests again when the beating is over');
});

test('touching Tozan deepens his bow, and never starts a beating', () => {
  // The one figure the reader can reach has to answer. The held BOW dips by DIP
  // and comes back up; the probe sits before the gate's forgiving hit-box, so
  // touching the man is never read as starting the blows.
  let onTap = null;
  const s = stubs();
  s.input.onTap = (fn) => { onTap = fn; };
  const cloths = [];
  s.audio.cloth = (o) => cloths.push(o);
  const knocks = [];
  s.audio.knock = () => knocks.push(1);

  const k = k15.build(s);
  k.setCamera(new THREE.PerspectiveCamera());
  const monks = [];
  k.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  const tozan = monks.find((m) => Math.abs(m.position.x - 2.5) < 1e-6);
  assert.ok(tozan, 'Tozan stands at the gateway');
  const waist = tozan.getObjectByName('waist');
  const tozanMeshes = [];
  tozan.traverse((o) => { if (o.isMesh) tozanMeshes.push(o); });
  s.input.raycastFirst = (cam, targets) => {
    const t = targets.find && targets.find((o) => tozanMeshes.includes(o));
    return t ? { object: t, point: new THREE.Vector3(), distance: 1 } : null;
  };

  k.update(1 / 60, 0);
  const held = waist.rotation.x;
  assert.ok(Math.abs(held - 0.55) < 1e-6, `he idles at the held BOW, got ${held}`);

  onTap();
  let peak = 0;
  for (let t = 0; t < 1.2; t += 1 / 60) {
    k.update(1 / 60, t);
    peak = Math.max(peak, waist.rotation.x);
  }
  assert.ok(peak > held + 0.15, `the bow never visibly deepened (peak ${peak.toFixed(3)})`);

  // a second tap mid-dip is absorbed, k49's cooldown idiom
  onTap();
  assert.equal(k.fragment().dips, 1, 'one dip at a time');
  assert.equal(cloths.length, 1, 'and one rustle');

  for (let t = 1.2; t < 3.0; t += 1 / 60) k.update(1 / 60, t);
  assert.ok(Math.abs(waist.rotation.x - held) < 1e-6, 'and he returns to exactly the held bow');
  assert.equal(k.fragment().beatings, 0, 'touching the man is not the gate');
  assert.equal(knocks.length, 0, 'no blow sounds for it');
});
