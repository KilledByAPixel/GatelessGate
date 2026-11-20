import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHorse } from '../src/kit/horse.js';
import { triangles, sectionY } from './helpers/quadruped-probe.js';

// Pins the silhouette events that make it a HORSE and not a llama, measured
// from the meshes themselves wherever a mesh can answer, so a regression in
// either horse.js or the shared plan trips them. `plan` (quadruped.js) is read
// only for where things are — the shoulder, the hip, the neck's two ends — and
// never for the shape being asserted.

function build() {
  const horse = makeHorse({});
  horse.group.updateMatrixWorld(true);
  return horse;
}

const find = (group, name) => {
  const out = [];
  group.traverse((o) => { if (o.name === name && o.isMesh) out.push(o); });
  return out;
};

const bodyOf = (group) => triangles(group, (o) => o.name === 'body');

// withers = the top of the body's own section over the front legs
const withersOf = ({ group, plan }) => sectionY(bodyOf(group), plan.zShoulder - 1e-3).max;

test('the horse holds at 11 meshes: trade, never add', () => {
  // k45 bakes its whole horse to one mesh with `bakeStatic`, but the horse is
  // shared (k36 stages it unbaked), so its mesh count is exactly what any case
  // drawing it unbaked pays. Eleven is what it has always spent; the lofted
  // plan gave back the neck and both shins, and the fuller tail spent two of
  // those on strand segments.
  const { group } = build();
  let meshes = 0;
  group.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes <= 11, `mesh count is what an unbaked horse costs — trade, never add: ${meshes}`);
});

test('THE NECK WEDGE: leaning 40-50 degrees off vertical, deep at the chest, slim at the poll', () => {
  const horse = build();
  const { root, end } = horse.plan.neck;                  // [y, z] each
  const lean = THREE.MathUtils.radToDeg(Math.atan2(end[1] - root[1], end[0] - root[0]));
  assert.ok(lean > 40 && lean < 50,
    `neck leans ${lean.toFixed(1)} deg off vertical (the llama stood at ~29)`);

  // The wedge, off the mesh: the body's extent ACROSS the neck's own line,
  // sampled near its root and near the poll. A pipe holds its depth.
  const len = Math.hypot(end[0] - root[0], end[1] - root[1]);
  const d = [(end[0] - root[0]) / len, (end[1] - root[1]) / len];   // along the neck, [y, z]
  const n = [d[1], -d[0]];                                          // across it, toward the crest
  const p = find(horse.group, 'body')[0].geometry.getAttribute('position');
  const bodyY = find(horse.group, 'body')[0].position.y;
  const depthAt = (t0, t1) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + bodyY - root[0], z = p.getZ(i) - root[1];
      const along = (y * d[0] + z * d[1]) / len;
      if (along < t0 || along > t1) continue;
      const across = y * n[0] + z * n[1];
      lo = Math.min(lo, across); hi = Math.max(hi, across);
    }
    return hi - lo;
  };
  const low = depthAt(0.2, 0.45), high = depthAt(0.9, 1.1);
  assert.ok(high > 0 && low > 0, 'the neck has rings at both ends');
  assert.ok(high / low < 0.65,
    `a third of the way up, the neck is still well deeper than at the poll: ${(high / low).toFixed(2)}x (a pipe is ~0.85)`);
  // and where it leaves the chest it is deeper again, by a wide margin
  const { rootDepth, endDepth } = horse.plan.neck;
  assert.ok(endDepth / rootDepth < 0.5, `poll to root ${(endDepth / rootDepth).toFixed(2)}x`);
});

test('a SMALL head, carried around 1.05-1.25x withers, nosed down the neck line', () => {
  const horse = build();
  const withers = withersOf(horse);
  const head = find(horse.group, 'head')[0];
  const v = new THREE.Vector3();
  head.getWorldPosition(v);

  // the llama carried its head centre at 1.34x withers
  assert.ok(v.y / withers > 1.05 && v.y / withers < 1.25,
    `head centre at ${(v.y / withers).toFixed(2)}x withers`);

  // skull AND muzzle together stay small against the body
  head.geometry.computeBoundingBox();
  const bb = head.geometry.boundingBox;
  assert.ok((bb.max.z - bb.min.z) / withers < 0.40,
    `the whole head is small against the body: ${((bb.max.z - bb.min.z) / withers).toFixed(2)}`);
  assert.ok(head.rotation.x > 0.5, 'the head is nosed well down');
});

test('ONE head: one loft tapering poll to nostril unbroken', () => {
  // the head is a single lofted geometry, not a skull with a muzzle bolted on
  const { group } = build();
  const head = find(group, 'head')[0];
  const p = head.geometry.getAttribute('position');
  assert.ok(p.count > 24, 'a loft, not a 24-corner box');

  // ring half-widths must NARROW monotonically from the cheek forward — one
  // continuous taper is what makes it read as one form, not parts
  const zs = new Map();
  for (let i = 0; i < p.count; i++) {
    const z = +p.getZ(i).toFixed(4);
    zs.set(z, Math.max(zs.get(z) ?? 0, Math.abs(p.getX(i))));
  }
  const stations = [...zs.entries()].sort((a, b) => a[0] - b[0])
    .map(([, w]) => w).filter((w) => w > 1e-6);
  const cheekAt = stations.indexOf(Math.max(...stations));
  for (let i = cheekAt; i < stations.length - 1; i++) {
    assert.ok(stations[i + 1] <= stations[i] + 1e-6,
      `taper never widens again forward of the cheek (station ${i})`);
  }
  // and the nostril end is genuinely narrower than the skull — a taper, not a tube
  assert.ok(stations[stations.length - 1] < Math.max(...stations) * 0.6,
    'the muzzle ends well inside the skull width');
});

test('deep chest, tucked flank, withers over the back', () => {
  const horse = build();
  const { plan } = horse;
  const body = bodyOf(horse.group);
  const span = plan.zShoulder - plan.zHip;
  const chest = sectionY(body, plan.zShoulder - 0.05 * span);
  const flank = sectionY(body, plan.zHip + 0.3 * span);
  const mid = sectionY(body, plan.zHip + 0.6 * span);
  assert.ok(chest.depth > flank.depth * 1.25,
    `chest ${chest.depth.toFixed(3)} is well deeper than the flank ${flank.depth.toFixed(3)}`);
  assert.ok(flank.min > chest.min + 0.15 * chest.depth,
    `the underline climbs aft: brisket ${chest.min.toFixed(3)}, flank ${flank.min.toFixed(3)}`);
  assert.ok(chest.max > mid.max, 'the withers stand over the middle of the back');
});

test('the hind fold sits at a LOW hock, behind the hip', () => {
  const horse = build();
  const withers = withersOf(horse);
  const hinds = find(horse.group, 'leg').filter((l) => l.position.z < 0);
  assert.equal(hinds.length, 2, 'both hind legs');
  const v = new THREE.Vector3();
  for (const leg of hinds) {
    // the hock is the rearmost point of the leg's own outline
    const p = leg.geometry.getAttribute('position');
    const hock = new THREE.Vector3(0, 0, Infinity);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
      if (v.z < hock.z) hock.copy(v);
    }
    assert.ok(hock.y / withers < 0.4, `hock at ${(hock.y / withers).toFixed(2)}x withers — low`);
    assert.ok(hock.z < leg.position.z - 0.05, 'the hock folds BACK of the hip');
  }
});

test('the tail flows off the CROUP, swept back clear of the rump', () => {
  const horse = build();
  const { group, tail, plan } = horse;
  assert.ok(tail, 'the strand tail is live');

  // root on the rump's top-rear, not a stub at rear-centre height: above the
  // body's axis, behind the hip, and under the topline so the join is buried
  assert.ok(tail.group.position.y > plan.bodyY + 0.1, 'roots above the body axis');
  assert.ok(tail.group.position.z < plan.zHip - 0.05, 'roots behind the hip');
  assert.ok(tail.group.position.y < sectionY(bodyOf(group), tail.group.position.z).max,
    'and under the topline there, not perched on it');
  // and the group is swept back so the hanging strand clears the buttock line
  assert.ok(tail.group.rotation.x > 0.2, 'carried off the croup, not plumb inside the rump');
});

test('deterministic and steady: the update only stirs the tail', () => {
  const a = build(), b = build();
  for (let i = 0; i < 90; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  a.group.updateMatrixWorld(true);
  b.group.updateMatrixWorld(true);
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const segsA = find(a.group, 'seg'), segsB = find(b.group, 'seg');
  assert.ok(segsA.length >= 2, 'the strand has segments');
  assert.equal(segsA.length, segsB.length);
  for (let i = 0; i < segsA.length; i++) {
    segsA[i].getWorldPosition(va);
    segsB[i].getWorldPosition(vb);
    assert.ok(Number.isFinite(va.x + va.y + va.z), 'finite tail');
    assert.ok(va.distanceTo(vb) < 1e-9, 'same seed, same sway');
  }
  assert.equal(a.group.name, 'horse');
});
