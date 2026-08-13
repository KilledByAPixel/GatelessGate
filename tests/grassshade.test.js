import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { grassShadeData, grassShadeUV, makeGrassShade, SHADE_STRENGTH } from '../src/kit/grassshade.js';
import { grassPlacements } from '../src/kit/grassfield.js';
import { composeWorld } from '../src/kit/scenery.js';
import { makeGround } from '../src/kit/ground.js';
import { plainMaterial } from '../src/render/material.js';

// The meadow is a field of camera-facing cards. It cannot cast a shadow that
// holds still — a billboard's silhouette is defined against the VIEWER — and it
// never really did: three.js renders shadow casters with MeshDepthMaterial,
// which does not run the billboard code, so the shadow map only ever saw a grid
// of identical unrotated quads. What replaced it is occlusion: the ground is
// darker where the grass is thick, baked once from the real placements.

const grid = (d, res, i, j) => d[(j * res + i) * 4];

test('the map is dark under a plant and clean away from one', () => {
  const res = 64, radius = 8;
  const { data } = grassShadeData({ spots: [{ x: 0, z: 0, rim: 0 }], radius, res });
  // world (0,0) is the middle of the grid
  const mid = res / 2;
  assert.ok(grid(data, res, mid, mid) < 255, 'the texel under the plant is darkened');
  assert.equal(grid(data, res, 2, 2), 255, 'a corner far from it is untouched');
  // and the smudge is SOFT — it falls off rather than stopping
  const near = grid(data, res, mid, mid);
  const out = grid(data, res, mid + 1, mid);
  assert.ok(out > near && out < 255, `it feathers outward (${near} -> ${out} -> 255)`);
});

test('strength is the floor, and it is reached only where the grass piles up', () => {
  const res = 32, radius = 4;
  const one = grassShadeData({ spots: [{ x: 0, z: 0, rim: 0 }], radius, res });
  // a heap of plants on one spot must not go past the stated strength
  const many = grassShadeData({
    spots: Array.from({ length: 40 }, () => ({ x: 0, z: 0, rim: 0 })), radius, res,
  });
  const mid = res / 2;
  const floor = Math.round(255 * (1 - SHADE_STRENGTH));
  assert.ok(grid(many.data, res, mid, mid) >= floor - 1, 'never darker than the strength allows');
  assert.ok(grid(many.data, res, mid, mid) < grid(one.data, res, mid, mid), 'but thicker grass IS darker');
  for (const v of many.data) assert.ok(v >= 0 && v <= 255);
});

// A plant in the rim taper is scaled down by the renderer, so it occludes less.
// `rim` is 0 in the core and 1 at the very edge — getting that backwards would
// have shaded the empty boundary and left the thick middle clean, and nothing
// else in the suite would have noticed.
test('a shrunken rim plant casts less shade than one in the core', () => {
  const res = 32, radius = 4;
  const core = grassShadeData({ spots: [{ x: 0, z: 0, rim: 0 }], radius, res });
  const edge = grassShadeData({ spots: [{ x: 0, z: 0, rim: 1 }], radius, res });
  const mid = res / 2;
  assert.ok(grid(edge.data, res, mid, mid) > grid(core.data, res, mid, mid),
    'the rim plant leaves the ground lighter');
});

// THE ONE THAT MATTERS. The ground is a PlaneGeometry laid flat, and its v axis
// runs BACKWARDS against z. A map built without that flip is mirrored in z, and
// mirrored occlusion over a seeded meadow looks exactly like correct occlusion
// until you compare it against where the grass actually is.
test('the map lines up with the ground it is painted on, in BOTH axes', () => {
  const ground = makeGround({ seed: 21 });
  const S = ground.geometry.parameters.width;
  const R = 10, res = 128;

  // one plant, well off the centre in both axes and asymmetric, so a flip or a
  // transpose cannot pass
  const spot = { x: 6.2, z: -3.4, rim: 0 };
  const { data } = grassShadeData({ spots: [spot], radius: R, res });
  const { repeat, offset } = grassShadeUV(R, S);

  // read the map exactly the way the shader will: ground uv -> repeat/offset
  const sample = (x, z) => {
    const u = x / S + 0.5;
    const v = 0.5 - z / S;
    const uu = u * repeat + offset;
    const vv = v * repeat + offset;
    const i = Math.floor(uu * res);
    const j = Math.floor(vv * res);
    if (i < 0 || j < 0 || i >= res || j >= res) return 255;
    return grid(data, res, i, j);
  };
  assert.ok(sample(spot.x, spot.z) < 255, 'the dark is where the plant is');
  assert.equal(sample(spot.x, -spot.z), 255, 'and NOT at its mirror in z');
  assert.equal(sample(-spot.x, spot.z), 255, 'nor at its mirror in x');
  assert.equal(sample(spot.z, spot.x), 255, 'nor transposed');

  // ...and the ground's uv convention is the one this assumed
  const pos = ground.geometry.attributes.position;
  const uv = ground.geometry.attributes.uv;
  const p = new THREE.Vector3().fromBufferAttribute(pos, 0);
  ground.localToWorld(p);
  assert.ok(Math.abs(uv.getX(0) - (p.x / S + 0.5)) < 1e-6, 'u = x/size + 0.5');
  assert.ok(Math.abs(uv.getY(0) - (0.5 - p.z / S)) < 1e-6, 'v = 0.5 - z/size');
});

test('deterministic: the same field bakes the same map', () => {
  const spots = grassPlacements({ count: 400, radius: 12, seed: 7, groundSeed: 21 });
  const a = grassShadeData({ spots, radius: 12, res: 64 });
  const b = grassShadeData({ spots, radius: 12, res: 64 });
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

// ---- wired into a scene -----------------------------------------------------

test('composeWorld paints the shade onto the ground, and can be told not to', () => {
  const scene = new THREE.Scene();
  const world = composeWorld(scene, { seed: 19, grass: 4000, trees: 0, rocks: 0, bushes: 0 });
  const ground = scene.getObjectByName('ground');
  assert.ok(ground.material.map, 'the ground carries the shade');
  assert.equal(ground.material.map.name, 'grass-shade');
  assert.ok(world.grass.spots.length > 0, 'and it was built from the real placements');

  const bare = new THREE.Scene();
  composeWorld(bare, { seed: 19, grass: 4000, trees: 0, rocks: 0, bushes: 0, grassShade: false });
  assert.equal(bare.getObjectByName('ground').material.map, null,
    'grassShade:false leaves the ground clean');
});

// The shipped look rebuilds every lit material as a plain Lambert. A clone that
// dropped `map` would make this whole thing render to nowhere, which is exactly
// how case 4's ink drain and its beard spent their lives invisible.
test('the shade survives the workbench material swap', () => {
  const scene = new THREE.Scene();
  composeWorld(scene, { seed: 3, grass: 3000, trees: 0, rocks: 0, bushes: 0 });
  const ground = scene.getObjectByName('ground');
  const swapped = plainMaterial(ground.material);
  assert.ok(swapped.map, 'plainMaterial carries the map across');
  assert.equal(swapped.map, ground.material.map, 'the same texture, not a stripped copy');
});

test('the meadow does not cast shadow, but still receives one', () => {
  const scene = new THREE.Scene();
  composeWorld(scene, { seed: 3, grass: 3000, trees: 0, rocks: 0, bushes: 0 });
  const field = scene.getObjectByName('grassfield');
  // castShadow alone never held: debug.apply() re-asserts it on every page
  // build, so the builder's `castShadow = false` was overwritten before a frame
  // was drawn and the grass cast shadow on every page in the book.
  assert.equal(field.userData.noCastShadow, true, 'the flag the workbench honours');
  assert.notEqual(field.userData.noShadow, true,
    'and NOT the blunt one — a tree\'s shadow lying across the meadow is right');
  assert.equal(field.receiveShadow, true);
});
