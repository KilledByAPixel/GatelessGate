import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k45 from '../src/koans/k45.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';
import { fakeCtx } from './helpers/fake-ctx.js';

function staged({ hits = false } = {}) {
  const ctx = fakeCtx();
  // the tap tests need the ray to land on the horse; the rest want it to miss
  if (hits) ctx.input.raycastFirst = () => ({ object: null, point: new THREE.Vector3() });
  const root = k45.build(ctx);
  const cam = new THREE.PerspectiveCamera(38, 1.78, 0.1, 200);
  cam.position.set(6, 5, 8);
  cam.lookAt(0, 1.5, -1);
  cam.updateMatrixWorld(true);
  root.setCamera(cam);
  return { root, cam, tap: () => { for (const cb of ctx._taps) cb(); } };
}

const named = (scene, name) => {
  const out = [];
  scene.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

test('the market is there: a row of stalls', () => {
  const { root } = staged();
  assert.equal(named(root.scene, 'stall').length, 3, 'three stalls line the lane');
});

test('the horse is the one red thing, and it stands still', () => {
  const { root } = staged();
  const horse = named(root.scene, 'horse');
  assert.equal(horse.length, 1, 'one horse tethered by the stalls');
  // the abstract marker stone is gone — the horse carries the accent now
  assert.equal(named(root.scene, 'marker').length, 0, 'no marker stone any more');

  // every accent-coloured mesh in the street belongs to the horse
  const want = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT].map((c) => new THREE.Color(c).getHexString()));
  const reds = [];
  root.scene.traverse((o) => {
    if (o.isMesh && !o.userData.isOutline && o.material && o.material.color
        && want.has(o.material.color.getHexString())) reds.push(o);
  });
  assert.ok(reds.length > 0, 'the horse is red');
  for (const m of reds) assert.ok(named(horse[0], m.name).length || horse[0] === m || isDescendant(horse[0], m),
    'nothing red outside the horse');

  const before = horse[0].position.clone();
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  assert.ok(before.distanceTo(horse[0].position) < 1e-6, 'the horse does not wander');
});

function isDescendant(root, node) {
  for (let n = node; n; n = n.parent) if (n === root) return true;
  return false;
}

// The street is STAGED, not animated (Frank, 2026-08-10: "no people walking,
// they are just standing" — no other case walks a figure along a path, and
// legs that do not stride read as a glide). Two strollers used to run a
// triangle wave up and down the lane; this is the assertion that they stay
// gone, and that nothing replaced them.
test('the whole street stands still', () => {
  const { root } = staged();
  const monks = named(root.scene, 'monk');
  assert.ok(monks.length >= 5, 'keepers, a customer, and the two who are meeting');
  const start = new Map(monks.map((m) => [m.uuid, m.position.clone()]));
  for (let i = 0; i < 60 * 12; i++) root.update(1 / 60, i / 60);
  for (const m of monks) {
    assert.ok(start.get(m.uuid).distanceTo(m.position) < 1e-9,
      `nobody in the market walks: one moved ${start.get(m.uuid).distanceTo(m.position).toFixed(3)}`);
  }
});

// Mumon's image, staged: "as if you met your own father on a busy street."
// An elder and a younger man stopped face to face: the recognition itself,
// which is the whole of what this case has to show.
test('an elder and a younger man are met, face to face, in the lane', () => {
  const { root, cam } = staged();
  const monks = named(root.scene, 'monk');
  const elder = monks.find((m) => m.userData.meeting === 'elder');
  const younger = monks.find((m) => m.userData.meeting === 'younger');
  assert.ok(elder && younger, 'the two who are meeting are tagged, not guessed at');

  const gap = elder.position.distanceTo(younger.position);
  assert.ok(gap > 0.8 && gap < 2.4, `a pace apart, not a pile-up or a shout: ${gap.toFixed(2)}u`);
  assert.ok(elder.position.y === 0 && younger.position.y === 0, 'both stand on the ground');

  // FACING each other, which is what makes it a meeting rather than two more
  // bystanders. Bodies front local +z (the kit convention), so each one's
  // forward must point at the other.
  for (const [self, other] of [[elder, younger], [younger, elder]]) {
    const fx = Math.sin(self.rotation.y), fz = Math.cos(self.rotation.y);
    const dx = other.position.x - self.position.x, dz = other.position.z - self.position.z;
    assert.ok((fx * dx + fz * dz) / Math.hypot(dx, dz) > 0.9,
      'each is turned to the other, not past him');
  }

  // the elder is the one with the staff — makeMonk's `elder` — and it must be
  // exactly one of them, or "an elder meeting a younger" is two of a kind
  assert.ok(!!elder.getObjectByName('staff'), 'the elder carries a staff');
  assert.ok(!younger.getObjectByName('staff'), 'the younger man does not');

  // AND THEY READ AS TWO. World distance is not screen separation (the case-7
  // lesson): squared up along the road these two stand 1.7 apart and project
  // to 0.09 of half-frame — one man with a shadow. The 62° axis they are set
  // on is what buys 0.22. Anything under ~0.12 has lost the picture.
  const at = (m) => new THREE.Vector3(m.position.x, 0.9, m.position.z).project(cam);
  const a = at(elder), b = at(younger);
  for (const v of [a, b]) {
    assert.ok(Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1, 'both are in the picture');
  }
  const sep = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(sep > 0.12, `they read as two men, not one: ${sep.toFixed(3)} of half-frame`);
});

// The street answers a touch, and the horse is the only thing that can move
// at all — "Do not ride another's horse." Everything else, including every
// person, is staged and still.
test('the horse shies from a hand, sounds, and settles back exactly', () => {
  const { root, tap } = staged({ hits: true });
  const horse = named(root.scene, 'horse')[0];
  const rest = horse.rotation.y;

  for (let i = 0; i < 30; i++) root.update(1 / 60, i / 60);
  assert.equal(horse.rotation.y, rest, 'untouched, it does not move at all');
  assert.equal(root.fragment().touched, 0);

  tap();
  assert.equal(root.fragment().touched, 1);
  let moved = 0;
  for (let i = 0; i < 60; i++) {
    root.update(1 / 60, 0.5 + i / 60);
    moved = Math.max(moved, Math.abs(horse.rotation.y - rest));
  }
  assert.ok(moved > 0.05, `it shies from the hand: ${moved.toFixed(3)} rad`);

  // and it comes all the way back — a prop left a few degrees off its rest
  // pose after every touch drifts a scene apart over a long read
  for (let i = 0; i < 60 * 4; i++) root.update(1 / 60, 0.5 + 1 + i / 60);
  assert.ok(Math.abs(horse.rotation.y - rest) < 1e-9, 'and settles back exactly');
  assert.equal(horse.position.y, 0, 'all four feet down');
});

// The man of the koan used to be staged HERE: at the margin of the picture,
// with his back turned, walking away whenever you reached for him. He worked
// on a still page and nowhere else — in the look, whose drift never stops, he
// re-placed between the two margins about once a second, which reads as
// several monks glitching in and out (Frank, 2026-08-10). He was cut. This is
// the assertion that nothing in the street is driven by the camera again.
test('no figure is steered by the camera — swing it and the street is unchanged', () => {
  const { root, cam } = staged();
  const figures = [];
  root.scene.traverse((o) => {
    if (o.name === 'monk' || o.name === 'horse') figures.push({ o, at: o.position.clone(), ry: o.rotation.y });
  });
  assert.ok(figures.length >= 7, 'a street full of people');

  for (let i = 0; i < 60 * 20; i++) {
    // orbit hard: the motion that used to sweep his mark across the street
    const a = i / 30;
    cam.position.set(Math.cos(a) * 9, 5, Math.sin(a) * 9);
    cam.lookAt(0, 1.5, -1);
    cam.updateMatrixWorld(true);
    root.update(1 / 60, a);
  }
  for (const f of figures) {
    assert.ok(f.at.distanceTo(f.o.position) < 1e-9,
      `${f.o.name} stays put however the camera moves`);
    assert.equal(f.o.rotation.y, f.ry, `${f.o.name} does not turn with the lens`);
  }
  assert.equal(named(root.scene, 'him').length, 0, 'and there is no man at the margin any more');
});
