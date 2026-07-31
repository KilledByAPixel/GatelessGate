import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuddha } from '../src/kit/buddha.js';
import { makeAssembly } from '../src/kit/assembly.js';

// The widest radius the mesh's own geometry reaches inside a y band —
// how the tests read a silhouette back off a lathe.
function maxRadiusInBand(mesh, y0, y1) {
  const pos = mesh.geometry.attributes.position;
  let r = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1) continue;
    r = Math.max(r, Math.hypot(pos.getX(i), pos.getZ(i)));
  }
  return r;
}

test('makeBuddha is a seated MAN — lap, waist step, shoulders, arms — on the ground', () => {
  const H = 2.0;
  const b = makeBuddha({ height: H });
  assert.equal(b.name, 'buddha');
  const names = b.children.map((c) => c.name);
  assert.ok(names.includes('body') && names.includes('head') && names.includes('ushnisha'));
  assert.ok(names.includes('hands'), 'hands resting in the lap');
  assert.equal(names.filter((n) => n === 'arm').length, 2, 'two arms — what makes it a man');
  assert.equal(names.filter((n) => n === 'ear').length, 2, 'the long ears');

  const box = new THREE.Box3().setFromObject(b);
  assert.ok(box.min.y > -0.02, `on the ground: ${box.min.y}`);
  assert.ok(box.max.y > 1.0 && box.max.y < 2.2, `seated proportion: ${box.max.y}`);

  // upright and slim: noticeably taller than wide, lap under 0.6·H
  const width = box.max.x - box.min.x;
  assert.ok(width < 0.6 * H, `lap width under 0.6·H: ${width}`);
  assert.ok(box.max.y / width > 1.4, `taller than wide: ${(box.max.y / width).toFixed(2)}`);

  // the silhouette discontinuity, read off the body lathe itself: a lap that
  // is the widest thing he owns, a waist visibly inset from it, shoulders
  // between the two — the old continuous knee→shoulder taper is the "big
  // round thing" this figure must never collapse back into
  const body = b.children.find((c) => c.name === 'body');
  const lap = maxRadiusInBand(body, 0, 0.25 * H);
  const waist = maxRadiusInBand(body, 0.23 * H, 0.28 * H);
  const shoulder = maxRadiusInBand(body, 0.6 * H, 0.72 * H);
  assert.ok(waist < lap * 0.7, `waist steps in from the lap: ${waist} vs ${lap}`);
  assert.ok(shoulder < lap * 0.75, `shoulders narrower than the lap: ${shoulder} vs ${lap}`);
  assert.ok(shoulder > waist, `but the chest carries real shoulders: ${shoulder} vs ${waist}`);
});

test('makeAssembly is one instanced, grounded, deterministic crowd', () => {
  const a = makeAssembly({ count: 8, seed: 6 });
  assert.equal(a.name, 'assembly');
  assert.ok(a.isInstancedMesh, 'a single instanced mesh');
  assert.equal(a.count, 8);
  assert.equal(a.userData.noOutline, true);
  const m = new THREE.Matrix4();
  a.getMatrixAt(0, m);
  const p = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(p.y) < 0.05, `seated on the ground: ${p.y}`);
  // deterministic
  const b = makeAssembly({ count: 8, seed: 6 });
  const m2 = new THREE.Matrix4(); b.getMatrixAt(0, m2);
  assert.deepEqual([...m.elements], [...m2.elements]);
});

test('makeAssembly accepts a THREE.Color for color (contract parity with siblings)', () => {
  assert.doesNotThrow(() => makeAssembly({ count: 4, color: new THREE.Color(0x336699) }));
});
