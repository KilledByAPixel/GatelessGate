import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k9 from '../src/koans/k9.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';

// Case 9 is staged as a DISCOVERY, not a product shot: the colossus sits off at
// the left third against the mountain flank, and an ordinary full-grown tree
// stands at his base so the eye has something to measure him with. These tests
// pin that composition — if the statue drifts back to the camera axis, or the
// scale tree wanders away from him or grows out of ordinary world scale, the
// case has lost its point.

// the shipped camera, at a square-ish book aspect (the reading pane's canvas
// is narrower than the 1.78 test rig, which halves apparent x offsets)
const shippedCamera = (aspect = 1.0) => sharedRig(k9.camera, { aspect, far: 200 });

function buildScene() {
  const ctx = fakeCtx();
  const root = k9.build(ctx);
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return { ctx, root, scene: root.scene };
}

test('the colossus is off-center: discovered at the left third, not presented', () => {
  const { scene } = buildScene();
  const buddha = scene.getObjectByName('buddha');
  assert.ok(buddha, 'no buddha');

  const cam = shippedCamera(1.0);
  const v = buddha.getWorldPosition(new THREE.Vector3()).project(cam);
  assert.ok(v.x < -0.25, `statue base projects to x=${v.x.toFixed(2)} — drifted back toward the camera axis`);
  assert.ok(v.x > -0.85 && Math.abs(v.y) < 0.85, `statue out of frame at ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);

  // and the crown stays in frame too — off-center must not mean cropped
  const crown = buddha.getWorldPosition(new THREE.Vector3());
  crown.y += 6.0;
  const vc = crown.project(cam);
  assert.ok(Math.abs(vc.x) < 0.9 && Math.abs(vc.y) < 0.9, `crown out of frame at ${vc.x.toFixed(2)}, ${vc.y.toFixed(2)}`);
});

test('a full-size tree stands at his base and gives him scale', () => {
  const { scene } = buildScene();
  const buddha = scene.getObjectByName('buddha');
  const bp = buddha.getWorldPosition(new THREE.Vector3());

  // find the hand-placed scale tree: a kit tree within the monument's footprint
  const near = [];
  scene.traverse((o) => {
    if (o.name !== 'tree') return;
    const p = o.getWorldPosition(new THREE.Vector3());
    if (Math.hypot(p.x - bp.x, p.z - bp.z) < 9) near.push(o);
  });
  assert.equal(near.length, 1, `expected exactly one scale tree at the statue's base, found ${near.length}`);
  const tree = near[0];

  // ordinary world scale: the same size range as the midground scatter — the
  // whole point is that a NORMAL tree only reaches the colossus's lap
  const box = new THREE.Box3().setFromObject(tree);
  const treeTop = box.max.y;
  assert.ok(treeTop > 2.5 && treeTop < 5.5, `scale tree top at y=${treeTop.toFixed(2)} — not an ordinary tree`);
  const crownY = bp.y + 6.0;   // the statue's head, roughly
  assert.ok(treeTop < crownY * 0.72,
    `tree (top ${treeTop.toFixed(1)}) must stay well below the statue's crown (${crownY.toFixed(1)}) or the scale read dies`);

  // it must not cross the statue's silhouette from the shipped camera: the
  // tree stays screen-RIGHT of the statue with clear water between them
  const cam = shippedCamera(1.0);
  const vb = bp.clone().project(cam);
  const vt = tree.getWorldPosition(new THREE.Vector3()).project(cam);
  assert.ok(vt.x > vb.x + 0.3, `tree at NDC x=${vt.x.toFixed(2)} crowds the statue at ${vb.x.toFixed(2)}`);

  // ink, never accent: the seal belongs to the buddha alone
  const accents = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
    .map((c) => new THREE.Color(c).getHexString()));
  tree.traverse((o) => {
    if (o.isMesh && o.material && o.material.color) {
      assert.ok(!accents.has(o.material.color.getHexString()),
        `scale tree carries an accent color: #${o.material.color.getHexString()}`);
    }
  });
});

test('everything anchored to the statue moved with it', () => {
  const { scene } = buildScene();
  const buddha = scene.getObjectByName('buddha');
  const bp = buddha.getWorldPosition(new THREE.Vector3());

  // the strata are the hill he is worn into — same center
  const strata = scene.getObjectByName('strata');
  const sp = strata.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.hypot(sp.x - bp.x, sp.z - bp.z) < 1e-6, 'strata left behind by the statue');

  // the tap cylinder covers HIM, wherever he sits
  const hit = scene.getObjectByName('buddha-hit');
  const hp = hit.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.hypot(hp.x - bp.x, hp.z - bp.z) < 1e-6, 'tap target left behind by the statue');
  assert.ok(hp.y > bp.y, 'tap cylinder should ride up the statue body');

  // both monks still look up at him — the case IS the small figure before
  // the enormous one
  const monks = [];
  scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 2, 'the asking monk and Seijo');
  // FACE, not aim: the body fronts local +z, so the bearing is atan2(dx, dz).
  // This pinned aimMonk's atan2(-dz, dx) — which turns the POINTING SLEEVE —
  // and so pinned the monk standing a quarter turn off the colossus he is
  // asking about — aimMonk was wrong, and wrong nearly everywhere it was used.
  // See faceMonk in src/kit/monk.js.
  const asking = monks[0];
  const want = Math.atan2(bp.x - asking.position.x, bp.z - asking.position.z);
  assert.ok(Math.abs(asking.rotation.y - want) < 1e-6, 'the asking monk no longer faces the statue');
});

test('the tap still tolls the deepest bell, from the new position', () => {
  const rung = [];
  const taps = [];
  const ctx = {
    audio: { bell: (o) => rung.push(o) },
    input: { onTap: (cb) => taps.push(cb), onHover: () => {}, raycastFirst: () => null },
  };
  const root = k9.build(ctx);
  const hit = root.scene.getObjectByName('buddha-hit');
  root.setCamera(shippedCamera());
  root.update(1 / 60, 10);
  ctx.input.raycastFirst = (cam, objs) => (objs.includes(hit)
    ? { object: hit, point: new THREE.Vector3(), distance: 1 } : null);
  taps.forEach((cb) => cb());
  assert.equal(rung.length, 1, 'the bell did not sound');
  assert.equal(rung[0].preset, 'great', 'the colossus rings the great preset — see task-12');
  assert.equal(root.fragment().tolls, 1);
});

test('the toll rocks the colossus a tiny bit, and it settles to exactly still', () => {
  // A touch wants feedback you can SEE as well as hear. Tiny is load-bearing:
  // the peak lean is held to a band — enough to see at the case's 17-unit
  // staging distance, never enough to read as a wobble toy.
  const taps = [];
  const ctx = {
    audio: { bell: () => {} },
    input: { onTap: (cb) => taps.push(cb), onHover: () => {}, raycastFirst: () => null },
  };
  const root = k9.build(ctx);
  const hit = root.scene.getObjectByName('buddha-hit');
  const buddha = root.scene.getObjectByName('buddha');
  root.setCamera(shippedCamera());
  root.update(1 / 60, 10);
  assert.equal(buddha.rotation.z, 0, 'still before the toll');

  ctx.input.raycastFirst = (cam, objs) => (objs.includes(hit)
    ? { object: hit, point: new THREE.Vector3(), distance: 1 } : null);
  taps.forEach((cb) => cb());

  let peak = 0;
  for (let t = 10; t < 13.2; t += 1 / 60) {
    root.update(1 / 60, t);
    peak = Math.max(peak, Math.abs(buddha.rotation.z));
    assert.equal(root.fragment().rock, +buddha.rotation.z.toFixed(5), 'the fragment reports the lean');
  }
  assert.ok(peak > 0.005, `the statue never visibly moved (peak ${peak.toFixed(4)})`);
  assert.ok(peak < 0.05, `"just a tiny bit" — peak ${peak.toFixed(4)} is not tiny`);

  root.update(1 / 60, 13.5);
  assert.equal(buddha.rotation.z, 0, 'the rock window closes on exactly zero, not a residue');
});
