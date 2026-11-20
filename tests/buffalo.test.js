import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuffalo } from '../src/kit/buffalo.js';
import { triangles, sectionY } from './helpers/quadruped-probe.js';

// What makes the shared body plan a WATER BUFFALO is all on the skull: a long
// wedge of a head carried low and nosed down, and horns that lie out sideways
// and back in a flat crescent. Each of these is read off the meshes in world
// space, so they hold whichever way the head and horns are built.

const H = 1.4;

function probe() {
  const b = makeBuffalo({ height: H });
  const root = b.group;
  root.updateMatrixWorld(true);
  const cloud = (name) => {
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || o.name !== name) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone());
    });
    return pts;
  };
  const ext = (pts, k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
  const body = triangles(root, (o) => o.name === 'body');
  const legZ = root.children.filter((c) => c.name === 'leg').map((c) => c.position.z);
  const withers = sectionY(body, Math.max(...legZ) - 1e-3).max;
  const horns = root.children.filter((c) => c.name === 'horn');
  return { b, root, cloud, ext, body, withers, horns };
}

test('the buffalo carries its head below its withers, nosed down', () => {
  const { cloud, withers } = probe();
  const head = cloud('head');
  const zs = head.map((p) => p.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const mean = (pts) => pts.reduce((s, p) => s + p.y, 0) / pts.length;
  // the two ends of the skull, each taken as the top of its own slice so a jaw
  // or an ear hanging off either end cannot stand in for the forehead line
  const top = (pts) => Math.max(...pts.map((p) => p.y));
  const rear = head.filter((p) => p.z < z0 + 0.2 * (z1 - z0));
  const front = head.filter((p) => p.z > z1 - 0.2 * (z1 - z0));
  const poll = top(rear);
  assert.ok(poll < withers - 0.08 * H,
    `the poll (${poll.toFixed(2)}) is carried clearly under the withers (${withers.toFixed(2)})`);
  // LOW is not enough: a level head held low is a drawer pulled out of the
  // chest. The forehead line falls from poll to muzzle.
  const drop = poll - top(front);
  assert.ok(drop > 0.3 * (z1 - z0),
    `the forehead falls ${drop.toFixed(2)} over a head ${(z1 - z0).toFixed(2)} long`);
  assert.ok(mean(front) < mean(rear), 'the muzzle hangs below the back of the skull');
});

test('the head is one long wedge, not a ball with a muzzle on it', () => {
  const { root, cloud, ext, body } = probe();
  const names = [];
  root.traverse((o) => names.push(o.name));
  assert.ok(!names.includes('snout'), 'skull and muzzle are one piece');
  const head = cloud('head');
  // length along the head's own line, poll to nose
  const nose = head.reduce((a, p) => (p.z > a.z ? p : a));
  const back = head.reduce((a, p) => (p.z < a.z ? p : a));
  const len = Math.hypot(nose.y - back.y, nose.z - back.z);
  const wide = ext(head, 'x');
  assert.ok(len > 1.8 * wide, `the head is ${len.toFixed(2)} long on ${wide.toFixed(2)} across`);
  // BROAD-MUZZLED: it narrows toward the nose, but never to a snout
  const zs = head.map((p) => p.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const muzzle = ext(head.filter((p) => p.z > z1 - 0.25 * (z1 - z0)), 'x');
  assert.ok(muzzle > 0.55 * wide && muzzle < 0.9 * wide,
    `the muzzle is ${(muzzle / wide).toFixed(2)} of the skull's width`);
  // and the whole head stays small against the animal: an oversized one is
  // most of what reads as a toy
  let bw = 0;
  for (const t of body) for (let k = 0; k < 9; k += 3) bw = Math.max(bw, Math.abs(t[k]));
  assert.ok(wide < 0.7 * 2 * bw, `a head ${wide.toFixed(2)} across on a body ${(2 * bw).toFixed(2)} across`);
});

test('the horns sweep wider than they rise, out and back', () => {
  const { horns, cloud, ext, withers } = probe();
  assert.equal(horns.length, 2, 'two horns');
  const all = cloud('horn');
  const span = ext(all, 'x');
  for (const horn of horns) {
    const bb = new THREE.Box3().setFromObject(horn);
    const base = horn.position;
    const reach = Math.max(Math.abs(bb.max.x - base.x), Math.abs(bb.min.x - base.x));
    const rise = bb.max.y - base.y;
    // A CRESCENT LAID BACK: upright horns are a goat's from the front and a
    // pair of ears from the side. They do climb — along the nape, which is the
    // only way they show from the side — but always less than they spread.
    assert.ok(reach > 1.5 * rise, `a horn reaches ${reach.toFixed(2)} out and rises ${rise.toFixed(2)}`);
    assert.ok(base.z - bb.min.z > 0.5 * reach,
      `and sweeps back ${(base.z - bb.min.z).toFixed(2)} behind its base`);
    assert.ok(bb.max.z - base.z < 0.25 * reach, 'never forward of it');
    // lying back toward the plane of the back, never standing over it
    assert.ok(bb.max.y < withers, `the horn tops out at ${bb.max.y.toFixed(2)}, under the withers ${withers.toFixed(2)}`);
  }
  // WIDE: the pair outreaches the trunk itself
  assert.ok(span > 0.85 * H, `tip to tip ${span.toFixed(2)} on a ${H} buffalo`);
});

test('small ears hang below the horn bases', () => {
  const { root, horns, cloud, ext } = probe();
  const ears = cloud('ear');
  assert.ok(ears.length > 0, 'the buffalo has ears');
  const hornBase = Math.min(...horns.map((h) => h.position.y));
  const mid = ears.reduce((s, p) => s + p.y, 0) / ears.length;
  assert.ok(mid < hornBase, `the ears sit at ${mid.toFixed(2)}, under the horn bases at ${hornBase.toFixed(2)}`);
  // on both sides, and much the smaller pair
  assert.ok(Math.min(...ears.map((p) => p.x)) < 0 && Math.max(...ears.map((p) => p.x)) > 0);
  assert.ok(ext(ears, 'x') < 0.6 * ext(cloud('horn'), 'x'), 'the ears do not compete with the horns');
  // and the pair is one draw: the whole skull costs what the ball and spikes did
  let meshes = 0;
  root.traverse((o) => { if (o.isMesh && !o.parent.name.includes('tail')) meshes++; });
  // body, four legs, head, an ear pair, two horns
  assert.ok(meshes <= 9, `${meshes} meshes besides the tail`);
});
