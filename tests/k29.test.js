import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../lib/three.module.js';
import k29 from '../src/koans/k29.js';
import { clothEnergy } from '../src/sim/verlet.js';
import { noteForSize, makeFurin, SWING, SINGLE_BODY_LEN } from '../src/kit/furin.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const fakeCtx = () => sharedCtx({
  accent: k29.accent,
  audio: { setWindLevel() {}, startAmbience() {}, stopAmbience() {}, chimeStrike() {} },
});

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
  // Each single reports the note its OWN size implies (kit/furin.js's
  // noteForSize — k29.js's SINGLE_SIZES are 0.18/0.12/0.09, which map to
  // -1/5/9) in place of the index a tubes:1 chime would otherwise report, so
  // a real strike lands on exactly one of these three values and never
  // anything else. A raw tube index (always 0 for a single tube) would fail
  // here, which is the specific regression this excludes.
  for (const s of struck) {
    assert.ok([-1, 5, 9].includes(s.tube), `unexpected tube ${s.tube}`);
    assert.ok(s.force > 0 && s.force <= 1);
  }
  const frag = k.fragment();
  assert.equal(frag.singleStrikes, struck.length,
    'every strike reaching audio came from one of the three singles');
});

test('three single-tube chimes hang under the gate, on three different cords, reaching the same line', () => {
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const audio = { startAmbience() {}, stopAmbience() {}, setWindLevel() {}, chimeStrike() {} };
  const k = k29.build({ audio, input });

  const gate = k.scene.getObjectByName('gate');
  assert.ok(gate, 'gate present');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  assert.equal(chimes.length, 3, 'three chimes, all children of the gate — the five-tube ring is gone');

  // every one of them is a SINGLE tube: the ring Frank asked to be removed
  // carried five, so counting tube meshes is what would catch it coming back
  for (const c of chimes) {
    let tubes = 0;
    c.traverse((o) => { if (o.name === 'tube') tubes++; });
    assert.equal(tubes, 1, 'a multi-tube ring is hanging under case 29 again');
  }

  k.scene.updateMatrixWorld(true);
  // THE CORDS DIFFER — a build that forgot cordLength entirely, or passed
  // one value three times, would hang them all off the same string
  const cords = chimes.map((c) => {
    let len = null;
    c.traverse((o) => { if (o.name === 'cord') len = o.geometry.parameters.height; });
    return len;
  });
  assert.equal(new Set(cords.map((v) => v.toFixed(4))).size, 3,
    `the three should hang on three different cords, got ${cords}`);

  // ...AND THE BOTTOMS LINE UP, which is the point of the cords differing.
  // Frank: "the small ones are not hanging low enough." With cord measured
  // in units of SIZE — the previous implementation, and the one a future
  // edit would most plausibly slip back to — the smallest chime gets the
  // shortest string and sits highest of the three, which is backwards. Here
  // the bottoms are within a fifth of the biggest chime's own tube length
  // of each other. Mutation-checked: reverting to `cord: [0.42, 0.52, 0.60]`
  // spreads them by 0.13 and fails this.
  const bottoms = chimes.map((c) => {
    const box = new THREE.Box3();
    c.traverse((o) => { if (o.isMesh && o.name === 'tube') box.union(new THREE.Box3().setFromObject(o)); });
    return box.min.y;
  });
  const spread = Math.max(...bottoms) - Math.min(...bottoms);
  assert.ok(spread < 0.07,
    `the three should reach roughly the same line; their bottoms spread ${spread.toFixed(4)} (${bottoms})`);
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
  // THE GOTCHA: a tubes:1 chime always reports its own tube index as 0 — if
  // k29.js forwarded that raw index instead of the note kit/furin.js derives
  // from each single's OWN size, every single would show up indistinguishable
  // from the ring's own tube-0 strikes, and 5 and 9 would never appear.
  // -1/5/9 are not hardcoded in k29.js any more — they fall out of
  // SINGLE_SIZES (0.18/0.12/0.09) via noteForSize, chosen specifically to
  // reproduce this previously-approved spread (see k29.js's own comment).
  // Checking for the actual literal values that reached the STUB (not
  // re-deriving them from the sizes here) also catches the copy-paste
  // version of the bug, where all three singles were wired to the same size.
  for (const note of [-1, 5, 9]) {
    assert.ok(tubes.has(note), `single note ${note} never reached the audio stub (saw: ${[...tubes]})`);
  }
});

test("each single's reported note is derived from its own built size, not a number k29.js chose independently", () => {
  // PROBLEM 1, task-swing-tune-brief.md: "the case asks for a size, and the
  // note follows" — the property that distinguishes the fix from just
  // moving the same three magic numbers into a differently-named constant.
  //
  // CODE REVIEW CAUGHT that an earlier draft of this test, despite its own
  // name, never drove update(), never captured a strike, and never imported
  // noteForSize — it only checked that three built tube lengths were
  // distinct and near a 2x ratio, a real property but not the one the name
  // promises. Fixed: drive the real case, capture what actually reaches the
  // audio stub (copying x/y/z out of the shared WORLD scratch vector
  // SYNCHRONOUSLY, in the callback — see furin.js's own onStrike comment;
  // storing the object/vector by reference would read back whatever the
  // NEXT strike overwrote it with), and require each captured note to equal
  // noteForSize(measuredSize), where measuredSize is read off the real
  // built tube geometry (length / furin.js's own exported SINGLE_BODY_LEN),
  // never retyped from k29.js.
  const struck = [];
  const audio = {
    startAmbience() {}, stopAmbience() {}, setWindLevel() {},
    chimeStrike: (o) => struck.push({ tube: o.tube, x: o.at.x }),
  };
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const k = k29.build({ audio, input });

  const gate = k.scene.getObjectByName('gate');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  const singles = chimes.filter((c) => {
    let tubes = 0;
    c.traverse((o) => { if (o.name === 'tube') tubes++; });
    return tubes === 1;
  });
  assert.equal(singles.length, 3, 'exactly three single-tube chimes');

  k.scene.updateMatrixWorld(true);
  // each single's real, built size AND world x — both read off the actual
  // geometry, never a constant copied out of k29.js
  const known = singles.map((c) => {
    let worldX = null, size = null;
    c.traverse((o) => {
      if (o.name === 'tube') {
        worldX = o.getWorldPosition(new THREE.Vector3()).x;
        size = o.geometry.parameters.height / SINGLE_BODY_LEN;
      }
    });
    return { worldX, size, expectedNote: noteForSize(size) };
  });
  // three distinct expected notes is itself a real property this test would
  // be vacuous without — if the three measured sizes ever collapsed to one,
  // there would be nothing left to distinguish below
  assert.equal(new Set(known.map((k) => k.expectedNote)).size, 3,
    `the three measured sizes should imply three different notes, got ${known.map((k) => k.expectedNote)}`);

  // long enough for every chime's own slow weather to strike at least once
  // (matches the existing "three different notes" test's own drive length)
  for (let i = 0; i < 60 * 400; i++) k.update(1 / 60, i / 60);
  const singleStrikes = struck.filter((s) => !Number.isInteger(s.tube) || s.tube < 0 || s.tube > 4);
  assert.ok(singleStrikes.length > 3, `too few single-tube strikes to judge: ${singleStrikes.length}`);

  // match each single-tube strike to the single nearest it (world x), and
  // require the reported note to equal noteForSize of THAT single's own
  // measured size — not a value copied from this test's own expectations
  for (const s of singleStrikes) {
    let nearest = known[0], best = Infinity;
    for (const kObj of known) {
      const d = Math.abs(kObj.worldX - s.x);
      if (d < best) { best = d; nearest = kObj; }
    }
    assert.ok(best < 0.3, `strike at x=${s.x} did not land near any known single (nearest ${best} away)`);
    assert.equal(s.tube, nearest.expectedNote,
      `a single at x~${nearest.worldX.toFixed(2)} (measured size ${nearest.size.toFixed(3)}) reported note ${s.tube}, expected noteForSize(size)=${nearest.expectedNote}`);
  }
});

test("case 29's chimes stay clear of each other at the LIVE swing cap, counter-phase, worst case", () => {
  // FOLLOW-UP CAUGHT: the collision-free result in swing-tune-report.md
  // (RING_X=-0.79, SINGLE_X=[-0.17,0.39,0.80], checked against
  // SWING.maxOmegaFrac=0.65) was only ever asserted in a k29.js COMMENT.
  // Nothing re-derived it against the LIVE constant, so raising
  // SWING.maxOmegaFrac — which is exactly what Frank is likely to do; he
  // complained the swing was too SMALL, not too big — would silently
  // reopen the counter-phase collision this branch already found once,
  // with nothing anywhere failing to say so. This recomputes the real
  // worst-case counter-phase gap from the ACTUAL staged scene and the
  // LIVE SWING.maxOmegaFrac/tapPeak/damping every time the suite runs, so
  // raising the cap past what case 29's spacing tolerates fails HERE,
  // not silently in the harness or, worse, not at all until Frank notices
  // two chimes passing through each other.
  //
  // theta (the saturated-burst peak) does not depend on which chime's own
  // size measures it: at saturation, pendulumEnergy's omega0^2 term
  // cancels — 1-cos(theta) = 0.5*maxOmegaFrac^2 has no L in it — so ONE
  // probe furin (size-independent constants only: SWING.tapPeak/
  // maxOmegaFrac/damping) driven with the exact same burst-mash a real
  // chime saturates under stands in for the ring and all three
  // differently-sized singles at once.
  const probe = makeFurin({ seed: 999, phase: 0, onStrike: () => {} });
  probe.setWindLevel(0);
  const probeSwing = probe.group.getObjectByName('swing');
  for (let i = 0; i < 50; i++) probe.ring(1);   // burst, before any update() — the saturating scenario
  let theta = 0;
  for (let i = 0; i < 60 * 5; i++) {
    probe.update(1 / 60, 1 + i / 60);
    theta = Math.max(theta, Math.abs(probeSwing.rotation.z));
  }
  assert.ok(theta > 0.1, `probe never swung — cannot judge case 29's clearance: ${theta}`);

  // the REAL staged scene, not a reproduction with guessed parameters
  const input = { onHover() {}, onTap() {}, raycastFirst: () => null };
  const audio = { startAmbience() {}, stopAmbience() {}, setWindLevel() {}, chimeStrike() {} };
  const k = k29.build({ audio, input });
  const gate = k.scene.getObjectByName('gate');
  const chimes = gate.children.filter((c) => c.name === 'furin');
  assert.equal(chimes.length, 3, 'the three singles');
  k.scene.updateMatrixWorld(true);
  // left to right by world x, so adjacent entries in this array are the
  // real physical neighbours hanging under the gate
  const ordered = chimes
    .map((group) => ({ group, x: group.getWorldPosition(new THREE.Vector3()).x }))
    .sort((a, b) => a.x - b.x);

  const VISIBLE_NAMES = new Set(['cord', 'tube', 'cap', 'clapper', 'tag', 'tag-thread']);
  function boxAtSign(chimeGroup, sign) {
    const swing = chimeGroup.getObjectByName('swing');
    const before = swing.rotation.z;
    swing.rotation.z = sign * theta;
    chimeGroup.updateMatrixWorld(true);
    const box = new THREE.Box3();
    chimeGroup.traverse((node) => {
      if (node.isMesh && VISIBLE_NAMES.has(node.name)) box.union(new THREE.Box3().setFromObject(node));
    });
    swing.rotation.z = before;   // leave the real scene exactly as found
    chimeGroup.updateMatrixWorld(true);
    return box;
  }
  // TRUE worst case per pair: each neighbour's phase is uncorrelated with
  // the other's in the real case (independent `phase` per single, and the
  // ring's own clock), so any sign combination is physically reachable —
  // try both signs on each side independently and keep the smallest gap
  function worstGap(a, b) {
    let worst = Infinity;
    for (const sa of [1, -1]) {
      for (const sb of [1, -1]) {
        const gap = boxAtSign(b.group, sb).min.x - boxAtSign(a.group, sa).max.x;
        worst = Math.min(worst, gap);
      }
    }
    return worst;
  }

  // a real, if modest, safety margin — not just "technically not touching"
  const MIN_MARGIN = 0.02;
  for (let i = 0; i < ordered.length - 1; i++) {
    const gap = worstGap(ordered[i], ordered[i + 1]);
    assert.ok(gap > MIN_MARGIN,
      `chimes at x=${ordered[i].x.toFixed(3)} and x=${ordered[i + 1].x.toFixed(3)} come within ${gap.toFixed(4)} of ` +
      `each other at the LIVE SWING.maxOmegaFrac=${SWING.maxOmegaFrac} (saturated-burst theta=${theta.toFixed(4)} rad) — ` +
      `need > ${MIN_MARGIN}. Either widen case 29's spacing (RING_X/SINGLE_X in src/koans/k29.js) or lower SWING.maxOmegaFrac.`);
  }
});

test('k29.js carries no note table of its own — the single-tube notes come from noteForSize, not a local constant', () => {
  // Closes a gap the behavioural test above CANNOT close by itself: k29.js's
  // SINGLE_SIZES (0.18/0.12/0.09) were deliberately chosen to reproduce the
  // previously-approved -1/5/9 spread exactly (see k29.js's own SIZES
  // comment), so a mutant that reintroduces a hardcoded
  // `SINGLE_NOTES = [-1, 5, 9]` table and switches onStrike back to reading
  // it produces BYTE-IDENTICAL stub output to the correct, derived version —
  // a genuine equivalent mutant, not a loophole in the arithmetic above. No
  // behavioural check of what reaches the stub can tell "derived" apart from
  // "hardcoded to the same numbers" when the numbers already agree. Same
  // technique tests/walk.test.js already uses for "no Math.random" — read
  // the source text and require the removed mechanism stays removed.
  const src = readFileSync(new URL('../src/koans/k29.js', import.meta.url), 'utf8');
  assert.ok(!/SINGLE_NOTES/.test(src),
    "k29.js should not carry its own per-single note table any more — the note comes from makeFurin's noteForSize(size)");
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
