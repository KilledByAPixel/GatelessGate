import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHorse } from '../src/kit/horse.js';

// The horse rework (overnight polish 2, item 14): pins the silhouette events
// that make it a HORSE and not a llama, measured from the meshes themselves so
// a regression in either horse.js or the shared plan trips them. The reference
// photo lives in the gitignored local/refs; the numbers in the comments below
// were counted off it, so they cannot be re-checked from a fresh clone.

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

// withers = top of the barrel, measured from the body mesh itself
function withersOf(group) {
  const body = find(group, 'body')[0];
  const v = new THREE.Vector3();
  body.getWorldPosition(v);
  return v.y + body.geometry.parameters.radius;
}

test('the horse holds at 11 meshes: trade, never add', () => {
  // Under the inverted-hull outline system (the hull, since deleted), every
  // mesh cost 2 draws, and this was pinned because k45 was frozen at 148/150
  // draw calls; k45 no longer feels it — it bakes its whole horse to one mesh
  // with `bakeStatic` — but the horse itself is shared (k36 stages it
  // unbaked), so its mesh count is still exactly what any case drawing it
  // unbaked pays. 12 is what the pre-rework horse spent; the knee'd hind pair
  // was paid for by merging the front posts and the ear pair, and the
  // single-loft head then RETIRED the snout mesh — trade, never add.
  const { group } = build();
  let meshes = 0;
  group.traverse((o) => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 11, 'mesh count is what an unbaked horse costs — trade, never add');
});

test('THE NECK WEDGE: leaning 40-50 degrees off vertical, broad base to narrow top', () => {
  const { group } = build();
  const neck = find(group, 'neck')[0];
  assert.ok(neck, 'the neck exists');

  // lean, from the transform the plan aimed chest -> head
  const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(neck.quaternion);
  const lean = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.y));
  assert.ok(lean > 40 && lean < 50,
    `neck leans ${lean.toFixed(1)} deg off vertical (llama was ~29)`);

  // taper: a wedge, not the plan's 0.85x pipe
  const { radiusTop, radiusBottom } = neck.geometry.parameters;
  assert.ok(radiusTop / radiusBottom < 0.55,
    `neck tapers ${(radiusTop / radiusBottom).toFixed(2)}x base-to-poll (pipe was 0.85)`);
});

test('a SMALL head, carried around 1.1-1.25x withers, nosed down the neck line', () => {
  const { group } = build();
  const withers = withersOf(group);
  const head = find(group, 'head')[0];
  const v = new THREE.Vector3();
  head.getWorldPosition(v);

  // the llama carried its head centre at 1.34x withers
  assert.ok(v.y / withers > 1.05 && v.y / withers < 1.25,
    `head centre at ${(v.y / withers).toFixed(2)}x withers`);

  // skull AND muzzle together stay small against the body (the old pin was
  // the skull box alone at < 0.28; the loft carries the muzzle too)
  head.geometry.computeBoundingBox();
  const bb = head.geometry.boundingBox;
  assert.ok((bb.max.z - bb.min.z) / withers < 0.40,
    `the whole head is small against the body: ${((bb.max.z - bb.min.z) / withers).toFixed(2)}`);
  assert.ok(head.rotation.x > 0.5, 'the head is nosed well down');
});

test('ONE head: no snout mesh, one loft tapering poll to nostril unbroken', () => {
  // "if there was a way to nail the vertices together to create a smoother
  // shaped head" — the head is a single geometry now; a regression to the
  // box + muzzle-cylinder pair brings the snout mesh back and trips this.
  const { group } = build();
  assert.equal(find(group, 'snout').length, 0, 'the snout mesh is retired');
  const head = find(group, 'head')[0];
  const p = head.geometry.getAttribute('position');
  assert.ok(p.count > 24, 'a loft, not the old 24-corner box');

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

test('deep chest, rising belly: the barrel pitches nose-down', () => {
  const { group } = build();
  const body = find(group, 'body')[0];
  const pitch = body.rotation.x - Math.PI / 2;
  assert.ok(pitch > 0.02 && pitch < 0.15,
    `barrel pitched ${pitch.toFixed(3)} rad: chest deeper than rump, underline climbs aft`);
});

test('the hind fold sits at a LOW hock, behind the hip', () => {
  const { group } = build();
  const withers = withersOf(group);
  const shins = find(group, 'shin');
  assert.equal(shins.length, 2, 'both hind legs fold');
  const v = new THREE.Vector3();
  for (const shin of shins) {
    shin.getWorldPosition(v);                     // the shin hangs from the hock
    assert.ok(v.y / withers < 0.3, `hock at ${(v.y / withers).toFixed(2)}x withers — low`);
    const hip = shin.parent.position;             // the thigh's top, on the barrel
    assert.ok(v.z < hip.z - 0.05, 'the hock folds BACK of the hip');
  }
});

test('the tail flows off the CROUP, swept back clear of the rump', () => {
  const { group, tail } = build();
  assert.ok(tail, 'the strand tail is live');
  const body = find(group, 'body')[0];
  const bodyPos = new THREE.Vector3();
  body.getWorldPosition(bodyPos);

  // root on the rump's top-rear, not a stub at rear-centre height
  assert.ok(tail.group.position.y > bodyPos.y + 0.1, 'roots above the barrel axis');
  assert.ok(tail.group.position.z < -0.55, 'roots at the rear');
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
  assert.equal(segsA.length, 2, 'two strand segments');
  for (let i = 0; i < segsA.length; i++) {
    segsA[i].getWorldPosition(va);
    segsB[i].getWorldPosition(vb);
    assert.ok(Number.isFinite(va.x + va.y + va.z), 'finite tail');
    assert.ok(va.distanceTo(vb) < 1e-9, 'same seed, same sway');
  }
  assert.equal(a.group.name, 'horse');
});
