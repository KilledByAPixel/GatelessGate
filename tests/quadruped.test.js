import test from 'node:test';
import assert from 'node:assert';
import * as THREE from '../lib/three.module.js';
import { makeQuadruped } from '../src/kit/quadruped.js';
import { makeDog } from '../src/kit/dog.js';
import { makeFox } from '../src/kit/fox.js';

const names = (g) => g.children.map((c) => c.name).sort();

test('legacy child names survive (species re-parent by name)', () => {
  const { group } = makeQuadruped({
    neck: { r: 0.07, len: 0.3 }, snout: { r0: 0.03, r1: 0.07, len: 0.2, fwd: 0.7, up: 0.2 },
    ears: { r: 0.09, h: 0.2, x: 0.07, up: 0.3, fwd: 0.5 },
    horns: { r: 0.05, len: 0.3, x: 0.1, up: 0.3, fwd: 0.4, sweep: 0.8 },
    hump: { r: 0.15, up: 0.15, fwd: 0.15 },
    tail: { kind: 'stiff', r0: 0.05, r1: 0.07, length: 0.5, up: 0.1, back: 0.35 },
  });
  for (const n of ['body', 'head', 'neck', 'snout', 'hump', 'tail'])
    assert.ok(names(group).includes(n), `missing child '${n}'`);
  assert.strictEqual(group.children.filter((c) => c.name === 'leg').length, 4);
  assert.strictEqual(group.children.filter((c) => c.name === 'ear').length, 2);
  assert.strictEqual(group.children.filter((c) => c.name === 'horn').length, 2);
});

test('THE LEG RULE holds with knees: every leg part reaches the ground', () => {
  const { group } = makeQuadruped({ legs: { knee: 0.35 } });
  const legParts = group.children.filter((c) => c.name === 'leg' || c.name === 'shin');
  assert.ok(legParts.length >= 4);
  const box = new THREE.Box3();
  for (const p of legParts) {
    box.setFromObject(p);
    assert.ok(box.min.y < 0.02, `leg part floats: min.y=${box.min.y}`);
  }
});

test('haunch and shoulder seat ON the barrel, not inside or above it', () => {
  const { group } = makeQuadruped({
    haunch: { r: 0.16, back: 0.28 }, shoulder: { r: 0.14, fwd: 0.28 },
  });
  const body = group.children.find((c) => c.name === 'body');
  for (const n of ['haunch', 'shoulder']) {
    const m = group.children.find((c) => c.name === n);
    assert.ok(m, `missing '${n}'`);
    assert.ok(Math.abs(m.position.y - body.position.y) < 0.25, `${n} detached from barrel line`);
  }
});

test('a knee splits the hind legs into leg + shin, and only the hind legs', () => {
  const plain = makeQuadruped({});
  assert.strictEqual(plain.group.getObjectByName('shin'), undefined,
    'no knee asked for, so no shin');

  const { group } = makeQuadruped({ legs: { knee: 0.35 } });
  const legs = group.children.filter((c) => c.name === 'leg');
  assert.strictEqual(legs.length, 4, 'still four legs at the top level');
  const shins = [];
  group.traverse((o) => { if (o.name === 'shin') shins.push(o); });
  assert.strictEqual(shins.length, 2, 'a knee is a HIND-leg joint: two shins, not four');
  // the two jointed legs are the rear pair (the animal faces +z)
  const jointed = legs.filter((l) => l.children.some((c) => c.name === 'shin'));
  assert.strictEqual(jointed.length, 2);
  for (const l of jointed) assert.ok(l.position.z < 0, 'the knee went on a FRONT leg');
  // and the joint is a real bend, not a straight leg cut in two
  for (const l of jointed) assert.ok(Math.abs(l.rotation.x) > 0.01, 'thigh is not tilted');
});

// EARS ROOT ON THE SKULL — the fix for "the ears are hanging off the side of
// its head" (Frank, on the fox and the dog both). { x, up, fwd } aim a ray
// from the head's centre; the base snaps onto the sphere's surface, slightly
// sunk (EAR_SINK = 0.96 of the radius) so the join is buried, never gapped.
// Checked on the real species builds, not a synthetic option set, because the
// dog attaches ears straight to the group while the fox re-parents them onto
// a headPivot — the invariant must survive both.
test('ear bases sit on the head sphere, slightly sunk, for dog and fox', () => {
  const builds = [
    ['dog', makeDog({ height: 0.5 })],
    ['fox', makeFox({ height: 0.45 }).group],
  ];
  for (const [label, root] of builds) {
    root.updateMatrixWorld(true);
    const head = root.getObjectByName('head');
    const r = head.geometry.parameters.radius;
    const centre = head.getWorldPosition(new THREE.Vector3());
    const ears = [];
    root.traverse((o) => { if (o.name === 'ear' && !o.userData.isOutline) ears.push(o); });
    assert.strictEqual(ears.length, 2, `${label} has two ears`);
    for (const ear of ears) {
      // the geometry is base-hinged (translated), so the mesh origin IS the base
      const d = ear.getWorldPosition(new THREE.Vector3()).distanceTo(centre);
      assert.ok(Math.abs(d - r * 0.96) < r * 0.03,
        `${label} ear base rides the skull surface: d/r = ${(d / r).toFixed(3)}`);
    }
  }
});

test('the ear hinge channel (rotation.x) is left free for the species to animate', () => {
  // The base orientation must live entirely in rotation.z + rotation.y: the
  // fox's flick and the cat's swivel OVERWRITE rotation.x every frame, so any
  // placement stored there would be silently destroyed on the first update.
  const { group } = makeQuadruped({
    ears: { r: 0.09, h: 0.2, x: 0.07, up: 0.3, fwd: 0.5, tilt: 0.3 },
  });
  for (const ear of group.children.filter((c) => c.name === 'ear')) {
    assert.strictEqual(ear.rotation.x, 0, 'no placement in the hinge channel');
    assert.ok(Math.abs(ear.rotation.z) > 0.01, 'the cant lives in z');
  }
});

test('the dog dropped the chest ball; the haunch stays', () => {
  // Frank: "he has something weird hanging below his chest now, like a round
  // ball type thing" — the brisket never merged with the body line, so the
  // dog stopped asking for it. The option itself stays on the shared plan.
  const dog = makeDog({});
  assert.strictEqual(dog.getObjectByName('chest'), undefined, 'no brisket');
  assert.ok(dog.getObjectByName('haunch'), 'the rump mass is still there');
});

// NOTE — this is the brief's determinism test with ONE change, and the change is
// in the harness, not in what it asserts. Pairing a's parts to b's by
// `getObjectByName` cannot work here: several children legitimately SHARE a name
// ('leg' x4, 'seg' x6 in a strand tail, 'ear'/'horn' x2), and getObjectByName
// returns the FIRST match, so it compares hind-left's matrix against front-left's
// and fails on a perfectly deterministic build. Verified against the untouched
// file before any kit edit. Pairing by traversal position instead tests the same
// property — same options in, same transforms out — and is strictly stronger,
// since it also pins the child ORDER and the total part count.
test('deterministic: same options, identical transforms', () => {
  const a = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  const b = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  a.group.updateMatrixWorld(true); b.group.updateMatrixWorld(true);
  const flatten = (g) => { const out = []; g.traverse((o) => out.push(o)); return out; };
  const A = flatten(a.group), B = flatten(b.group);
  assert.strictEqual(A.length, B.length);
  for (let i = 0; i < A.length; i++) {
    assert.strictEqual(A[i].name, B[i].name);
    assert.deepStrictEqual(A[i].matrix.toArray(), B[i].matrix.toArray());
  }
});
