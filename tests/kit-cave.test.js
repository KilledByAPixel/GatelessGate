import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCave } from '../src/kit/cave.js';

// The cave's mouth is a natural opening, not a doorway. These pin the three
// things that made it read as built: a rectangular dark, a box for a sill, and
// jambs standing plumb either side.

const verts = (mesh) => {
  mesh.updateWorldMatrix(true, false);
  const p = mesh.geometry.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) {
    out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  }
  return out;
};

// The dark's face toward the reader, as an outline in x/y.
function mouth(cave) {
  const v = verts(cave.getObjectByName('throat'));
  const front = Math.max(...v.map((q) => q.z));
  return v.filter((q) => front - q.z < 1e-4);
}

// Left and right extent of the outline at a height, by walking its edges —
// the hull of a convex-ish arch is its outline, so every pair is tried.
function spanAt(outline, y) {
  let lo = Infinity, hi = -Infinity;
  for (const a of outline) for (const b of outline) {
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
    const x = a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y));
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return { lo, hi, w: hi - lo };
}

for (const opts of [{ width: 2.4, height: 2.4, depth: 1.9, seed: 2 }, { width: 3.0, height: 2.8, depth: 3.2, seed: 41 }]) {
  const label = `seed ${opts.seed}`;

  test(`the mouth is an arch, wider at its base than its top, and lopsided (${label})`, () => {
    const o = mouth(makeCave(opts));
    const y0 = Math.max(0, Math.min(...o.map((q) => q.y)));
    const y1 = Math.max(...o.map((q) => q.y));
    const at = (f) => spanAt(o, y0 + (y1 - y0) * f);

    const base = at(0.08), mid = at(0.55), top = at(0.92);
    assert.ok(mid.w < base.w * 0.92, `it narrows by mid-height: ${mid.w.toFixed(2)} vs ${base.w.toFixed(2)}`);
    assert.ok(top.w < base.w * 0.5, `and closes toward the top: ${top.w.toFixed(2)} vs ${base.w.toFixed(2)}`);

    // no plumb sides: a side that holds its x from the ground to shoulder
    // height is a door jamb
    const low = at(0.1), high = at(0.7);
    assert.ok(low.lo < high.lo - 0.04 * opts.width && low.hi > high.hi + 0.04 * opts.width,
      `both sides lean in: ${low.lo.toFixed(2)}→${high.lo.toFixed(2)}, ${low.hi.toFixed(2)}→${high.hi.toFixed(2)}`);

    // and the two sides are not mirror images of each other
    const skew = [0.3, 0.5, 0.7, 0.85].map((f) => { const s = at(f); return Math.abs(s.lo + s.hi); });
    assert.ok(Math.max(...skew) > 0.05 * opts.width,
      `the outline is asymmetric about the centre line: ${skew.map((s) => s.toFixed(2))}`);

    const peak = o.reduce((a, q) => (q.y > a.y ? q : a));
    assert.ok(Math.abs(peak.x) > 0.02 * opts.width, `the peak is off centre: ${peak.x.toFixed(3)}`);
  });

  test(`the threshold is a worn stone, not a box sill (${label})`, () => {
    const cave = makeCave(opts);
    const v = verts(cave.getObjectByName('apron'));
    const yTop = Math.max(...v.map((q) => q.y)), yBot = Math.min(...v.map((q) => q.y));
    const ring = (y) => v.filter((q) => Math.abs(q.y - y) < 1e-4);
    const top = ring(yTop), bot = ring(yBot);

    // a box has four corners in plan; a stone has more, at uneven reaches
    const corners = new Set(top.map((q) => `${q.x.toFixed(3)},${q.z.toFixed(3)}`));
    assert.ok(corners.size >= 6, `the top face is a many-sided slab: ${corners.size} corners`);
    const reach = [...corners].map((k) => Math.hypot(...k.split(',').map(Number).map((n, i) => (i ? n / opts.depth : n / opts.width))));
    assert.ok(Math.max(...reach) - Math.min(...reach) > 0.03, 'and its outline is uneven');

    // no vertical faces: it spreads into the ground
    const ext = (r) => Math.max(...r.map((q) => q.x)) - Math.min(...r.map((q) => q.x));
    assert.ok(ext(top) < ext(bot) * 0.95, `it tapers up from the ground: ${ext(top).toFixed(2)} vs ${ext(bot).toFixed(2)}`);

    // the seat a figure is posed on has not moved
    assert.ok(Math.abs(yTop - opts.height * 0.107) < 1e-6, `the top face is where cases stand things: ${yTop.toFixed(3)}`);
    assert.ok(yBot < 0, 'and it is bedded in the ground');
  });

  test(`the jambs lean over the mouth, each by its own amount (${label})`, () => {
    const cave = makeCave(opts);
    const jambs = [];
    cave.traverse((o) => { if (o.name === 'jamb') jambs.push(o); });
    assert.equal(jambs.length, 2);
    const lean = jambs.map((j) => {
      const v = verts(j);
      // the slope of the lump's x against its y, over every vertex — one
      // extreme corner says more about how the lump was turned than how it leans
      const mx = v.reduce((a, q) => a + q.x, 0) / v.length, my = v.reduce((a, q) => a + q.y, 0) / v.length;
      const slope = v.reduce((a, q) => a + (q.x - mx) * (q.y - my), 0) / v.reduce((a, q) => a + (q.y - my) ** 2, 0);
      // positive = the top sits nearer the centre line than the foot
      return -Math.sign(mx) * slope;
    });
    for (const l of lean) assert.ok(l > 0.1, `a jamb leans in toward its top: ${l.toFixed(3)}`);
    assert.ok(Math.abs(lean[0] - lean[1]) > 0.05, `and the pair do not match: ${lean.map((l) => l.toFixed(3))}`);
  });
}

test('the cave is deterministic, and a different seed is a different mouth', () => {
  const sig = (seed) => JSON.stringify(mouth(makeCave({ seed })).map((q) => [q.x, q.y]));
  assert.equal(sig(2), sig(2));
  assert.notEqual(sig(2), sig(41));
});

test('the rebuild added no meshes and kept every name a case or test reaches for', () => {
  const cave = makeCave({});
  const names = [];
  cave.traverse((o) => { if (o.isMesh) names.push(o.name); });
  assert.deepEqual(names.sort(), ['apron', 'bank', 'boulder', 'boulder', 'brow', 'crown', 'jamb', 'jamb', 'shoulder', 'shoulder', 'throat']);
  const throat = cave.getObjectByName('throat');
  assert.ok(throat.material.isMeshBasicMaterial, 'the dark stays unlit');
});
