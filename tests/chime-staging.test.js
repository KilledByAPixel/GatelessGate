import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { loadKoan } from '../src/koans/registry.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { stubAudio } from './helpers/stub-audio.js';

// The ten cases this pass hung a fūrin or a bronze cylinder in (chime-
// staging task): each one's own case file explains WHY that particular
// scene earns a chime. This file pins the wiring every one of them shares,
// the way tests/staging.test.js pins the module contract every case shares —
// bespoke per-case tests (k16, k29, k47) still own their own scene-specific
// claims.
//
// Ask of every assertion here whether a case that hung the chime but never
// wired it in, or that let a tap fall through past it, would still pass. A
// "the chime makes SOME sound eventually" test would pass a case that built
// the object and forgot to call update() on it, if enough simulated time
// happened to trip some OTHER interaction — these specifically isolate the
// chime's own path.
const CASES = [
  { slug: 'a-beardless-foreigner', kind: 'chime' },              // k4
  { slug: 'tozan-s-three-blows', kind: 'chime' },                // k15
  { slug: 'bells-and-robes', kind: 'cylinder' },                 // k16
  { slug: 'the-three-calls-of-the-emperor-s-teacher', kind: 'cylinder', pair: true }, // k17
  { slug: 'mahakashapa-s-preaching-sign', kind: 'chime', windTied: true },   // k22
  { slug: 'blow-out-the-candle', kind: 'cylinder' },             // k28
  { slug: 'joshu-investigates', kind: 'chime' },                 // k31
  { slug: 'learning-is-not-the-path', kind: 'chime' },           // k34 (revised from a cylinder)
  { slug: 'basho-s-staff', kind: 'chime' },                      // k44
  { slug: 'amban-s-addition', kind: 'cylinder' },                // k49
];

// every mesh belonging to EACH chime object found in the scene, grouped by
// instance and collected by object identity rather than by name —
// cylinder.js's own 'body' mesh name collides with bell.js's, so matching by
// name alone across a whole scene would risk a false hit on an unrelated
// instrument
function chimeInstances(scene) {
  const groups = [];
  scene.traverse((o) => { if (o.name === 'furin' || o.name === 'cylinder-chime') groups.push(o); });
  assert.ok(groups.length > 0, 'no chime object found in the scene');
  return groups.map((g) => { const t = []; g.traverse((o) => { if (o.isMesh) t.push(o); }); return t; });
}

for (const { slug, kind, pair, windTied } of CASES) {
  test(`${slug}: the hung chime is wired into update() — a wind-driven strike reaches audio`, async () => {
    const audio = stubAudio();
    const ctx = fakeCtx({ audio });
    const mod = await loadKoan(slug);
    const root = mod.build(ctx);
    // no camera, no taps: this exercises ONLY the ambient wind path, so a
    // case that built the chime but never called chime.update() in its own
    // update() loop leaves it motionless forever and this must fail. (Every
    // case here also calls chime.setWindLevel(1) every frame — see the
    // "wind level" test below for what that call actually does and does not
    // prove; it is not what this assertion depends on, since both kit
    // files' own windLevel already defaults to 1.)
    for (let i = 0; i < 60 * 400; i++) root.update(1 / 60, i / 60);
    const strikes = audio.calls.filter(([k]) => k === kind);
    assert.ok(strikes.length > 0,
      `${slug}: no ${kind} strike reached audio in 400s of wind — the chime is hanging dead`);
    for (const [, o] of strikes) {
      assert.ok(o.at && Number.isFinite(o.at.x) && Number.isFinite(o.at.y) && Number.isFinite(o.at.z),
        `${slug}: strike position is not a finite vector an AudioParam can take`);
      assert.ok(o.force > 0 && o.force <= 1, `${slug}: strike force out of range: ${o.force}`);
    }
    if (pair) {
      // k17's own gotcha: a cylinder's note comes from its SIZE (noteForSize),
      // so two instances built with the same size (a copy-paste of the first
      // rather than a genuinely varied pair) would report the identical note
      // on every strike — checking the SET, not just that strikes happened,
      // is what catches that.
      const notes = new Set(strikes.map(([, o]) => o.note));
      assert.ok(notes.size >= 2, `${slug}: the pair never sounded two distinct notes (saw: ${[...notes]})`);
    }
  });

  test(`${slug}: a tap that hits everything still rings the chime exactly once, and nothing else`, async () => {
    // Deliberately crude — EVERY query, chime or not, returns a hit. This is
    // the shape that actually exercises the missing-`return` bug: a stub
    // that ONLY matches the chime's own meshes can never observe a fallback
    // firing too, because the case's other pick (a hut-hall bell, a rack, a
    // flag mesh, a gate's own big hit-box...) would always miss under that
    // narrower stub regardless of whether the `return` is there. Nine of the
    // ten cases also happen to guard their fallback with its own
    // `if (!raycastFirst(...)) return;`, which a narrow stub would silently
    // rely on — but k49's does not (its gate-ring branch has no such guard),
    // so a narrow stub leaves that one case's probe order entirely unpinned.
    // An always-hit stub closes both gaps at once, for all ten.
    const audio = stubAudio();
    const ctx = fakeCtx({ audio });
    const mod = await loadKoan(slug);
    const root = mod.build(ctx);
    root.setCamera(new THREE.PerspectiveCamera());
    root.update(1 / 60, 0);

    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null);
    ctx._taps.forEach((cb) => cb());
    // A furin's ring() fires synchronously; a cylinder's does not — it only
    // kicks the clapper's velocity, and the actual contact (the thing that
    // calls onStrike) happens a couple of physics substeps later once the
    // relative angle crosses GAP_ANGLE (kit/cylinder.js: "within a couple of
    // frames" of a full-force tap). A handful of update() frames covers both
    // shapes without running long enough for an ambient wind strike to sneak
    // in and confuse the count.
    for (let i = 0; i < 10; i++) root.update(1 / 60, i / 60);

    // exactly one call reached audio at all, and it was the chime's own —
    // a missing `return` after ringing the chime would let the SAME tap
    // fall through into the case's other tap response (a knock, a bell, a
    // toggled flag) and show up here as a second call
    assert.equal(audio.calls.length, 1,
      `${slug}: one tap that hits everything produced ${audio.calls.length} audio calls: ${JSON.stringify(audio.calls)}`);
    assert.equal(audio.calls[0][0], kind, `${slug}: the one call was not a ${kind} strike`);
  });

  if (pair) {
    test(`${slug}: each chime in the pair answers its OWN tap, not just the first one probed`, async () => {
      // The generic "hits everything" test above always satisfies the
      // FIRST chime the case's onTap loop probes, so it can never reach the
      // second one's own pick() — a broken chimeB.pick() (or a case that
      // built two chimes but only ever wired the loop to the first) would
      // be invisible there. Isolate each instance's own meshes in turn.
      const audio = stubAudio();
      const ctx = fakeCtx({ audio });
      const mod = await loadKoan(slug);
      const root = mod.build(ctx);
      root.setCamera(new THREE.PerspectiveCamera());
      root.update(1 / 60, 0);
      const instances = chimeInstances(root.scene);
      assert.ok(instances.length >= 2, `${slug}: expected a pair, found ${instances.length}`);

      for (const [i, targets] of instances.entries()) {
        audio.calls.length = 0;
        ctx.input.raycastFirst = (cam, objs) => {
          const hit = objs && objs.find((o) => targets.includes(o));
          return hit ? { object: hit, point: new THREE.Vector3(), distance: 1 } : null;
        };
        ctx._taps.forEach((cb) => cb());
        for (let f = 0; f < 10; f++) root.update(1 / 60, f / 60);
        const strikes = audio.calls.filter(([k]) => k === kind);
        assert.equal(strikes.length, 1, `${slug}: tapping instance ${i} alone produced ${strikes.length} ${kind} strikes`);
      }
    });
  }

  if (windTied) {
    test(`${slug}: stilling the case's own wind stills its chime too`, async () => {
      // k22 ties its chime's wind level to the same flag the reader can
      // toggle — case 29's own rule for a hanging voice sharing a scene with
      // a wind toggle. A chime left at the kit's own constant default
      // (every OTHER case in this pass) would keep ringing here even after
      // the flag's wind is switched off, which is exactly the bug this pins.
      const audio = stubAudio();
      const ctx = fakeCtx({ audio });
      const mod = await loadKoan(slug);
      const root = mod.build(ctx);
      root.setCamera(new THREE.PerspectiveCamera());

      const flagCloth = root.scene.getObjectByName('cloth');
      assert.ok(flagCloth, `${slug}: no flag cloth found to toggle`);

      for (let i = 0; i < 60 * 200; i++) root.update(1 / 60, i / 60);
      const before = audio.calls.filter(([k]) => k === kind).length;
      assert.ok(before > 0, `${slug}: nothing struck in 200s of wind — cannot prove stilling silences anything`);

      // tap the cloth to toggle the wind off, same mechanism k29's own test uses
      ctx.input.raycastFirst = (cam, objs) => (
        objs.includes(flagCloth) ? { object: flagCloth, point: new THREE.Vector3(0, 3, 0) } : null
      );
      ctx._taps.forEach((cb) => cb());

      for (let i = 0; i < 60 * 10; i++) root.update(1 / 60, 200 + i / 60);   // let it settle
      const settled = audio.calls.filter(([k]) => k === kind).length;
      for (let i = 0; i < 60 * 150; i++) root.update(1 / 60, 210 + i / 60);
      const after = audio.calls.filter(([k]) => k === kind).length;
      assert.equal(after, settled,
        `${slug}: the chime rang ${after - settled} more times after the wind was stilled`);
    });
  }
}
