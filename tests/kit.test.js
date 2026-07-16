import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeIsland } from '../src/kit/island.js';
import { makeMonk } from '../src/kit/monk.js';

function rimRadii(mesh, nominal) {
  const pos = mesh.geometry.attributes.position;
  const radii = [];
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (r > nominal * 0.7) radii.push(r);
  }
  return radii;
}

test('island rim is torn (displaced), deterministic by seed', () => {
  const a = makeIsland({ radius: 6, seed: 3 });
  const b = makeIsland({ radius: 6, seed: 3 });
  const c = makeIsland({ radius: 6, seed: 4 });
  const ra = rimRadii(a, 6);
  assert.ok(ra.length > 50, 'expected many rim vertices');
  const spread = Math.max(...ra) - Math.min(...ra);
  assert.ok(spread > 6 * 0.15, `rim spread too small: ${spread}`);
  assert.deepEqual(Array.from(a.geometry.attributes.position.array), Array.from(b.geometry.attributes.position.array));
  assert.notDeepEqual(Array.from(a.geometry.attributes.position.array), Array.from(c.geometry.attributes.position.array));
});

test('island top surface sits at y=0', () => {
  const m = makeIsland({ radius: 6, thickness: 0.55, seed: 3 });
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(Math.abs(box.max.y) < 0.01, `top at ${box.max.y}`);
  assert.ok(box.min.y < -0.4, `bottom at ${box.min.y}`);
});

test('monk has named parts and stands on y=0', () => {
  const m = makeMonk({ height: 1.6 });
  assert.equal(m.name, 'monk');
  const names = m.children.map((c) => c.name).sort();
  assert.deepEqual(names, ['body', 'hat', 'head']);
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(box.min.y > -0.01, `feet at ${box.min.y}`);
  const h = box.max.y - box.min.y;
  assert.ok(h > 1.6 * 0.6 && h < 1.6 * 1.1, `height ${h}`);
});

test('monk options: no hat, stout build', () => {
  const bare = makeMonk({ hat: false });
  assert.deepEqual(bare.children.map((c) => c.name).sort(), ['body', 'head']);
  const thin = makeMonk({ stout: 0.8 });
  const stout = makeMonk({ stout: 1.4 });
  const wThin = new THREE.Box3().setFromObject(thin).max.x;
  const wStout = new THREE.Box3().setFromObject(stout).max.x;
  assert.ok(wStout > wThin, 'stout should be wider');
});
