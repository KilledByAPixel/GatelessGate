import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeDog } from '../src/kit/dog.js';
import { makeQuadruped } from '../src/kit/quadruped.js';
import { makeTail } from '../src/kit/tail.js';
import { makeBuffalo } from '../src/kit/buffalo.js';

// Both animals shipped with their legs hanging in the air below the belly, for
// the same reason: the barrel is a capsule and narrows toward its sides, so a
// leg at hip offset x meets the body HIGHER than the body's lowest point. This
// reconstructs the capsule from the mesh itself and asserts every leg top is
// genuinely buried inside it.
function assertLegsConnect(root, label) {
  const body = root.getObjectByName('body');
  assert.ok(body, `${label} has a body`);
  const bb = new THREE.Box3().setFromObject(body);
  // a capsule lying along z is exactly 2R tall, and (L + 2R) deep
  const R = (bb.max.y - bb.min.y) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const halfL = Math.max(0, (bb.max.z - bb.min.z) / 2 - R);

  const legs = [];
  root.traverse((o) => { if (o.name === 'leg') legs.push(o); });
  assert.equal(legs.length, 4, `${label} has four legs`);

  for (const leg of legs) {
    const lb = new THREE.Box3().setFromObject(leg);
    const top = new THREE.Vector3((lb.min.x + lb.max.x) / 2, lb.max.y, (lb.min.z + lb.max.z) / 2);
    // nearest point on the capsule's axis, then the distance to it
    const az = Math.max(-halfL, Math.min(halfL, top.z));
    const d = Math.hypot(top.x, top.y - cy, top.z - az);
    assert.ok(d < R, `${label} leg top is inside the barrel: ${d.toFixed(3)} vs radius ${R.toFixed(3)}`);
    assert.ok(lb.min.y < 0.02, `${label} leg reaches the ground: ${lb.min.y.toFixed(3)}`);
  }
}

test('makeDog is a grounded quadruped with named parts', () => {
  const d = makeDog({ height: 0.5 }).group;
  assert.equal(d.name, 'dog');
  // By TRAVERSAL, not by direct children: the head and the tail hang off pivots
  // of their own so the animal can turn them (kit/dog.js), and a test that pins
  // the parenting instead of the parts fails on a rig change that broke nothing.
  const names = [];
  d.traverse((o) => names.push(o.name));
  assert.equal(names.filter((n) => n === 'leg').length, 4, 'four legs');
  assert.ok(names.includes('body') && names.includes('head') && names.includes('tail'));
  const box = new THREE.Box3().setFromObject(d);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.3 && box.max.y < 0.9, `dog-sized: ${box.max.y}`);
  assertLegsConnect(d, 'dog');
});

// ---- the dog moves ---------------------------------------------------------
// It was the one animal in the book that was furniture, standing dead still in
// both cases that use it while a cat and a fox either side of it breathed and
// turned. What it does belongs to the ANIMAL; a case only says when.

test('the dog hinges on its own joints, not on points in mid air', () => {
  const d = makeDog({ height: 0.6 });
  const root = d.group;

  // THE TAIL PIVOT IS AT THE TAIL'S ROOT. A 'stiff' tail is a cylinder centred
  // on its own origin, so sweeping the MESH swings both ends and the buried end
  // walks out of the rump. Rotating the pivot must leave the root exactly where
  // it was — this is the whole reason the pivot exists.
  const tail = d.tail.getObjectByName('tail');
  const buried = new THREE.Vector3(0, -tail.geometry.parameters.height / 2, 0);
  const rootAt = () => { root.updateMatrixWorld(true); return tail.localToWorld(buried.clone()); };
  const before = rootAt();
  d.tail.rotation.y = 1;
  const after = rootAt();
  d.tail.rotation.y = 0;
  assert.ok(before.distanceTo(after) < 1e-6,
    `the tail root walks ${before.distanceTo(after)} under a sweep`);

  // ...and the head hinges INSIDE the skull, so a turn is a turn and not an
  // orbit. Derived from the head the quadruped built, so it survives the skull
  // being moved or resized.
  root.updateMatrixWorld(true);
  const head = root.getObjectByName('head');
  const gap = head.getWorldPosition(new THREE.Vector3())
    .distanceTo(d.head.getWorldPosition(new THREE.Vector3()));
  assert.ok(gap < head.geometry.parameters.radius, `the hinge sits ${gap} outside the skull`);

  // and none of it costs a draw: pivots are Groups
  let meshes = 0;
  root.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes <= 12, `${meshes} meshes in one dog`);
});

test('a touched dog cocks its head and wags, then goes back to standing there', () => {
  const d = makeDog({ height: 0.6 });
  assert.equal(d.notice(), true);
  assert.equal(d.notice(), false, 'a held pointer stacked a second stir on the first');

  let tilt = 0, wag = 0, flips = 0, prev = d.tailYaw();
  for (let i = 0; i <= 60 * 6; i++) {
    d.update(1 / 60, i / 60);
    tilt = Math.max(tilt, Math.abs(d.head.rotation.z));
    const w = d.tailYaw();
    wag = Math.max(wag, Math.abs(w));
    if (d.stirring() && Math.sign(w) !== Math.sign(prev)) flips++;
    prev = w;
  }
  // THE HEAD COCK is the gesture — a turn alone is a head on a stick. Read as
  // "big enough to see across a diorama", not as a pinned value.
  assert.ok(tilt > 0.25, `the head barely cocks: ${tilt} rad`);
  // A WAG OSCILLATES. A tail that sweeps aside once and comes back is a tail
  // being pushed; several reversals inside one response is what says dog.
  assert.ok(flips >= 6, `the tail swung ${flips} times — that is a lean, not a wag`);
  assert.ok(wag > 0.3, `the wag is ${wag} rad wide`);
  // and it ENDS. A response that never closes leaves the animal permanently
  // excited, which reads as broken rather than as alive.
  assert.equal(d.stirring(), false);
  assert.ok(Math.abs(d.head.rotation.z) < 1e-9, 'the head stayed cocked');
});

test('the dog idles without being asked, and two dogs on a seed agree forever', () => {
  const d = makeDog({ height: 0.6, seed: 3 });
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 60 * 90; i++) { d.update(1 / 60, i / 60); lo = Math.min(lo, d.headYaw()); hi = Math.max(hi, d.headYaw()); }
  // never still...
  assert.ok(hi - lo > 0.02, `the head never moves: ${hi - lo}`);
  // ...and never busy. An idle that wanders as far as a response does steals
  // the response's meaning.
  assert.ok(hi - lo < 0.25, `the idle wanders ${hi - lo} rad — that is not idling`);

  // the determinism rule: no Math.random outside src/audio
  const a = makeDog({ seed: 7 }), b = makeDog({ seed: 7 });
  a.notice(); b.notice();
  for (let i = 0; i < 200; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.equal(a.headYaw(), b.headYaw());
  assert.equal(a.tailYaw(), b.tailYaw());
});

test('the shared quadruped joins legs to the barrel at any proportion', () => {
  // the join is computed, so it must hold across the whole range the presets use
  for (const [hipX, bodyR, legH] of [[0.05, 0.20, 0.5], [0.13, 0.20, 0.52],
    [0.26, 0.42, 0.50], [0.38, 0.42, 0.30], [0.30, 0.32, 0.7]]) {
    const q = makeQuadruped({
      height: 1, hipX, bodyR, legH,
      head: { shape: 'sphere', r: 0.18, fwd: 0.5, up: 0.2 },
    });
    assertLegsConnect(q.group, `hipX ${hipX} bodyR ${bodyR}`);
  }
});

test('tail is warmed up at build time so it does not drop into place on spawn', () => {
  const lateral = (t) => {
    const p = t.group.userData.cloth.positions;
    let m = 0;
    for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.abs(p[i]), Math.abs(p[i + 2]));
    return m;
  };
  const warm = makeTail({ segments: 7, length: 1.0 });
  assert.ok(lateral(warm) > 1e-4, 'warm strand has settled into a live pose');
  assert.ok(warm.energy() < 1e-2, `settled, not thrashing: ${warm.energy()}`);

  const cold = makeTail({ segments: 7, length: 1.0, warmup: 0 });
  assert.ok(lateral(cold) < 1e-9, 'cold strand is the straight authored line');
  assert.equal(cold.energy(), 0, 'cold strand is motionless until first update');
});

test('makeTail hangs, swishes on impulse, and settles', () => {
  const t = makeTail({ segments: 7, length: 1.0 });
  assert.equal(t.group.name, 'tail');
  for (let i = 0; i < 60; i++) t.update(1 / 60, i / 60);   // let it settle hanging
  const rest = t.energy();
  assert.ok(rest < 1e-3, `settles near still: ${rest}`);
  t.impulse(1);
  t.update(1 / 60, 1);
  assert.ok(t.energy() > rest, 'impulse adds motion');
  // tip hangs below the root once settled
  for (let i = 0; i < 120; i++) t.update(1 / 60, 2 + i / 60);
  const p = t.group.userData.cloth.positions;
  const tipY = p[(7 - 1) * 3 + 1];
  assert.ok(tipY < -0.3, `tip hangs below root: ${tipY}`);
});

test('horns and ears point away from the skull, not across it', () => {
  // Rotating +y about +z sends it toward -x, so the left side needs a POSITIVE
  // angle to lean out. With the sign inverted the pair crossed over the head and
  // vanished into it — the buffalo shipped hornless-looking for weeks.
  const b = makeBuffalo({ height: 1.4 });
  const horns = [];
  b.group.traverse((o) => { if (o.name === 'horn') horns.push(o); });
  assert.equal(horns.length, 2);
  for (const horn of horns) {
    const base = horn.position.x;
    const bb = new THREE.Box3().setFromObject(horn);
    // the far end of the horn must be further from the centreline than its root
    const far = Math.abs(base) > 1e-6 && base < 0 ? bb.min.x : bb.max.x;
    assert.ok(Math.abs(far) > Math.abs(base) + 0.15,
      `horn extends outward from x=${base.toFixed(2)} to ${far.toFixed(2)}`);
    assert.ok(Math.sign(far) === Math.sign(base), 'horn stays on its own side of the head');
  }
  const spread = new THREE.Box3().setFromObject(horns[0]).union(
    new THREE.Box3().setFromObject(horns[1]));
  const head = new THREE.Box3().setFromObject(b.group.getObjectByName('head'));
  // Was * 1.8, sized against the old 0.36-wide box skull. A retune (524f3ad)
  // rebuilt the head as a 0.6-wide sphere with the horns kept, and the ratio
  // fell to ~1.36 on purpose. The claim that survives is the direction: the
  // sweep still clearly outreaches the skull.
  assert.ok(spread.max.x - spread.min.x > (head.max.x - head.min.x) * 1.2,
    'the sweep reads wider than the skull at a distance');
});

test('makeBuffalo is a grounded beast with horns and a live tail', () => {
  const b = makeBuffalo({ height: 1.4 });
  assert.equal(b.group.name, 'buffalo');
  const names = b.group.children.map((c) => c.name);
  assert.equal(names.filter((n) => n === 'leg').length, 4, 'four legs');
  assert.equal(names.filter((n) => n === 'horn').length, 2, 'two horns');
  assert.ok(names.includes('body') && names.includes('head') && names.includes('tail'));
  assert.ok(new THREE.Box3().setFromObject(b.group).min.y > -0.03, 'on the ground');
  assertLegsConnect(b.group, 'buffalo');
  assert.ok(names.includes('hump'), 'the shoulder hump that makes it a buffalo');
  for (let i = 0; i < 30; i++) b.update(1 / 60, i / 60);
  const rest = b.tail.energy();
  b.tail.impulse(1); b.update(1 / 60, 1);
  assert.ok(b.tail.energy() > rest, 'tail responds to impulse');
});

// ---- the tail leaves the body ----------------------------------------------
// A strand pinned at ONE node hangs flat against the animal's flank, and a
// swish then swings it through the body — the buffalo's rotated around inside
// its own barrel. Aiming the first segment up and out is what makes it whip
// clear of the flank instead.
//
// `root` pins the SECOND node as well, at a chosen offset from the first: the
// root segment becomes a rigid stub held wherever the caller aims it, and the
// rest of the strand hangs and whips from the end of that stub. No force is
// fighting gravity to keep it there.
test('makeTail: an aimed root holds the first segment where it is put', () => {
  const plain = makeTail({ segments: 7, length: 0.5, seed: 37 });
  const aimed = makeTail({ segments: 7, length: 0.5, seed: 37, root: [0, -0.72, -0.69] });
  const first = (t) => {
    t.group.updateMatrixWorld(true);
    const seg = t.group.children.find((c) => c.isMesh);
    return new THREE.Vector3(0, 1, 0).applyQuaternion(seg.quaternion).normalize();
  };
  const p = first(plain);
  assert.ok(p.y < -0.9, `an unaimed tail hangs straight down (${p.y.toFixed(2)})`);
  const a = first(aimed);
  assert.ok(Math.abs(a.y - (-0.72)) < 0.02 && Math.abs(a.z - (-0.69)) < 0.02,
    `and an aimed one points where it was told (${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)})`);
});

test('makeTail: an aimed tail whips outward and never crosses its own root', () => {
  // MEASURED, and the numbers chose the whip direction. Over two swishes, how
  // far forward of its root the strand travels — forward being into the animal:
  //   no aim, whip forward (the original)   reach z = 0.227, sideways 0.439
  //   aimed root, whip forward              reach z = 0.125, sideways 0.366
  //   aimed root, whip BACK                 reach z = 0.157, sideways 0.375
  //   aimed root, whip FLAT                 reach z = 0.000, sideways 0.423
  // Flat wins twice: nothing crosses forward at all, and it sweeps wider doing
  // it, because none of the shove is spent fighting the strand's own hang.
  const reachOf = (opts) => {
    const t = makeTail({ segments: 7, length: 0.5, seed: 37, ...opts });
    const segs = [];
    t.group.traverse((o) => { if (o.isMesh) segs.push(o); });
    let clock = 0;
    const step = () => { t.update(1 / 60, clock); clock += 1 / 60; t.group.updateMatrixWorld(true); };
    for (let i = 0; i < 60; i++) step();
    let forward = -Infinity;
    let sideways = 0;
    const w = new THREE.Vector3();
    for (let i = 0; i < 60 * 6; i++) {
      if (i === 0 || i === 180) t.impulse(1.2);
      step();
      for (const m of segs) {
        m.getWorldPosition(w);
        forward = Math.max(forward, w.z);
        sideways = Math.max(sideways, Math.abs(w.x));
      }
    }
    return { forward, sideways };
  };

  const plain = reachOf({});
  const aimed = reachOf({ root: [0, -0.72, -0.69] });
  assert.ok(plain.forward > 0.15, `an unaimed tail swings well forward of its root (${plain.forward.toFixed(3)})`);
  assert.ok(aimed.forward <= 1e-6, `an aimed one never does (${aimed.forward.toFixed(3)})`);
  assert.ok(aimed.sideways > 0.3, `and still whips (${aimed.sideways.toFixed(3)})`);
});

test('makeTail: an unaimed tail is exactly the tail it always was', () => {
  // `root` defaults to null, and every caller that does not pass one has to be
  // byte-identical — the option is an addition, not a change
  const snap = () => {
    const t = makeTail({ segments: 7, length: 0.5, seed: 37 });
    let clock = 0;
    for (let i = 0; i < 120; i++) { t.update(1 / 60, clock); clock += 1 / 60; }
    t.impulse(1.2);
    for (let i = 0; i < 60; i++) { t.update(1 / 60, clock); clock += 1 / 60; }
    return Array.from(t.group.userData.cloth.positions).map((v) => v.toFixed(6)).join(',');
  };
  assert.equal(snap(), snap(), 'and deterministic besides');
});
