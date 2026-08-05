import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSand } from '../src/kit/sand.js';
import { groundHeight } from '../src/kit/ground.js';

const SHORE = { dx: 0, dz: -1, dist: 8, width: 4, sea: -0.35, depth: 1.4 };

const vertsOf = (mesh) => {
  const a = mesh.geometry.attributes.position.array;
  const out = [];
  for (let i = 0; i < a.length; i += 3) out.push({ x: a[i], y: a[i + 1], z: a[i + 2] });
  return out;
};

test('one mesh, one draw call, no outline, named sand', () => {
  const sand = makeSand({ shore: SHORE });
  assert.ok(sand.isMesh);
  assert.equal(sand.name, 'sand');
  assert.equal(sand.userData.noOutline, true);
  assert.equal(sand.children.length, 0);
});

test('the ribbon drapes the shore taper: every vertex sits just above the shored ground', () => {
  const sand = makeSand({ shore: SHORE, groundSeed: 21 });
  for (const v of vertsOf(sand)) {
    const g = groundHeight(v.x, v.z, { seed: 21, shore: SHORE });
    const lift = v.y - g;
    assert.ok(lift > 0.005 && lift < 0.05,
      `vertex at (${v.x.toFixed(1)}, ${v.z.toFixed(1)}) floats ${lift} above the shore`);
  }
});

test('the sand covers the whole beach: from the grass line to under the water', () => {
  const sand = makeSand({ shore: SHORE });
  // s = seaward coordinate: 0 at the waterline, -width at the beach's top edge
  const ss = vertsOf(sand).map((v) => v.x * SHORE.dx + v.z * SHORE.dz - SHORE.dist);
  assert.ok(Math.min(...ss) < -SHORE.width, 'the sand never laps into the grass');
  assert.ok(Math.max(...ss) > 2.0, 'the sand stops short of hiding the water sheet edge');
});

test('the upper edge is wavy, not ruler-straight, and seeded', () => {
  const edgeLine = (seed) => {
    const sand = makeSand({ shore: SHORE, seed });
    // the landward-most vertex in each along-shore column is the grass line
    const cols = new Map();
    for (const v of vertsOf(sand)) {
      const u = Math.round((v.x * -SHORE.dz + v.z * SHORE.dx) * 4) / 4;
      const s = v.x * SHORE.dx + v.z * SHORE.dz - SHORE.dist;
      if (!cols.has(u) || s < cols.get(u)) cols.set(u, s);
    }
    return [...cols.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
  };
  const a = edgeLine(20);
  const spread = Math.max(...a) - Math.min(...a);
  assert.ok(spread > 0.3, `the grass line is ruler-straight (spread ${spread})`);
  assert.deepEqual(edgeLine(20), edgeLine(20));
  assert.notDeepEqual(edgeLine(20), edgeLine(21));
});
