import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFan } from '../src/kit/fan.js';

test('makeFan is a two-mesh ōgi: pleated wedge on a grip', () => {
  const f = makeFan({ radius: 0.5, angle: Math.PI * 0.72, handleLen: 0.16 });
  assert.equal(f.name, 'fan');

  // two meshes and no more — the fan appears in held poses where every extra
  // mesh is an extra draw call
  const meshes = [];
  f.traverse((o) => { if (o.isMesh) meshes.push(o.name); });
  assert.deepEqual(meshes.sort(), ['fan-handle', 'fan-leaf']);

  const leaf = f.children.find((c) => c.name === 'fan-leaf');
  assert.equal(leaf.material.side, THREE.DoubleSide, 'a sheet shows both faces');

  // the group origin is the hand: grip at the bottom, leaf opening up +Y
  const box = new THREE.Box3().setFromObject(f);
  assert.ok(box.min.y > -0.01, `nothing below the grip end: ${box.min.y}`);
  assert.ok(box.max.y > 0.5, `the leaf reaches past its radius above the hand: ${box.max.y}`);

  // the wedge is wide — a fan silhouette, not a lollipop: for a ~130 degree
  // sector the rim spans well over one radius side to side
  assert.ok(box.max.x > 0.4 && box.min.x < -0.4, `open wedge: x spans ${box.min.x}..${box.max.x}`);

  // the pleats are real geometry: rim vertices alternate to BOTH sides of the
  // leaf plane, and the folds converge flat at the pivot (vertex 0)
  const pos = leaf.geometry.attributes.position;
  let front = 0, back = 0;
  for (let i = 1; i < pos.count; i++) {
    if (pos.getZ(i) > 0.001) front++;
    if (pos.getZ(i) < -0.001) back++;
  }
  assert.ok(front > 0 && back > 0, `folds zigzag: ${front} ridge / ${back} valley`);
  assert.ok(Math.abs(pos.getZ(0)) < 1e-9, 'the pivot itself stays in plane');
});

test('makeFan options are honoured and the wobble is seeded, not random', () => {
  const wide = makeFan({ radius: 0.8, angle: Math.PI * 0.9, pleats: 14 });
  assert.deepEqual(wide.userData.fan, { radius: 0.8, angle: Math.PI * 0.9, pleats: 14 });
  const bw = new THREE.Box3().setFromObject(wide);
  const small = makeFan({ radius: 0.3 });
  const bs = new THREE.Box3().setFromObject(small);
  assert.ok(bw.max.y > bs.max.y && bw.max.x > bs.max.x, 'radius scales the silhouette');

  const leafPos = (fan) => fan.children.find((c) => c.name === 'fan-leaf').geometry.attributes.position.array;
  // same seed, same geometry, to the bit
  assert.deepEqual([...leafPos(makeFan({ seed: 7 }))], [...leafPos(makeFan({ seed: 7 }))]);
  // different seed, different hand-cut edge
  const a = leafPos(makeFan({ seed: 7 }));
  const b = leafPos(makeFan({ seed: 8 }));
  assert.ok(a.some((v, i) => v !== b[i]), 'the rim wobble follows the seed');

  // everything finite, whatever the options
  for (const v of leafPos(makeFan({ radius: 1.2, angle: Math.PI, pleats: 9, seed: 3 }))) {
    assert.ok(Number.isFinite(v));
  }
});
