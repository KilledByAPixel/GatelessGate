import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeIsland } from '../src/kit/island.js';
import { makeMonk } from '../src/kit/monk.js';
import { makeTree } from '../src/kit/tree.js';
import { makeGate } from '../src/kit/gate.js';

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

test('monk has named parts (robe, sleeves, head, hat) and stands on y=0', () => {
  const m = makeMonk({ height: 1.6 });
  assert.equal(m.name, 'monk');
  const names = m.children.map((c) => c.name).sort();
  assert.deepEqual(names, ['arm', 'arm', 'body', 'hat', 'head']);
  const box = new THREE.Box3().setFromObject(m);
  assert.ok(box.min.y > -0.01, `feet at ${box.min.y}`);
  const h = box.max.y - box.min.y;
  assert.ok(h > 1.6 * 0.6 && h < 1.6 * 1.1, `height ${h}`);
});

test('monk options: no hat, stout build', () => {
  const bare = makeMonk({ hat: false });
  assert.deepEqual(bare.children.map((c) => c.name).sort(), ['arm', 'arm', 'body', 'head']);
  const thin = makeMonk({ stout: 0.8 });
  const stout = makeMonk({ stout: 1.4 });
  const wThin = new THREE.Box3().setFromObject(thin).max.x;
  const wStout = new THREE.Box3().setFromObject(stout).max.x;
  assert.ok(wStout > wThin, 'stout should be wider');
});

test('tree: trunk + canopy cluster, connected and deterministic by seed', () => {
  const t = makeTree({ height: 3.2, seed: 5 });
  assert.equal(t.name, 'tree');
  assert.equal(t.children.filter((c) => c.name === 'trunk').length, 1);
  const canopy = t.children.filter((c) => c.name === 'canopy');
  assert.ok(canopy.length >= 4, `fuller canopy, got ${canopy.length}`);
  // the anchor blob is centered on the trunk (no lateral gap) and its underside
  // reaches below the trunk top, so the crown never floats free
  const trunkTop = 3.2 * 0.5;
  const anchor = canopy[0];
  assert.ok(Math.hypot(anchor.position.x, anchor.position.z) < 0.01, 'anchor blob centered on trunk');
  const anchorBottom = new THREE.Box3().setFromObject(anchor).min.y;
  assert.ok(anchorBottom < trunkTop, `canopy must overlap trunk top ${trunkTop}, got underside ${anchorBottom}`);
  const t2 = makeTree({ height: 3.2, seed: 5 });
  const t3 = makeTree({ height: 3.2, seed: 6 });
  const posOf = (tree) => tree.children.filter((c) => c.name === 'canopy').map((c) => c.position.toArray()).flat();
  assert.deepEqual(posOf(t), posOf(t2));
  assert.notDeepEqual(posOf(t), posOf(t3));
  const box = new THREE.Box3().setFromObject(t);
  assert.ok(box.max.y > 3.2 * 0.6, `tree too short: ${box.max.y}`);
});

test('gate: two posts, two beams, top beam overhangs', () => {
  const g = makeGate({ width: 2.4, height: 2.6 });
  assert.equal(g.name, 'gate');
  assert.equal(g.children.length, 4);
  const box = new THREE.Box3().setFromObject(g);
  assert.ok(box.max.x - box.min.x > 2.4, 'beam should overhang the posts');
  assert.ok(box.max.y >= 2.6, `gate too short: ${box.max.y}`);
  assert.ok(box.min.y > -0.01, 'gate should stand on y=0');
});
