import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';

import k39, { nextRed } from '../src/koans/k39.js';
import { ACCENT } from '../src/palette.js';

// Case 39's three rulings from Frank, pinned:
//
//   1. "Make that pond less square-shaped — more organically shaped, kinda
//      roundish." The water is a seeded blob now; what this file owns is that
//      every stepping stone still stands IN that water at this seed.
//   2. "When you push one under, the next one turns red, since that one
//      disappears — so there's always exactly one red." The selection is the
//      pure function `nextRed`; the scene tests hold the invariant through
//      real taps, the full sinking, and the resurfacing reset.
//   3. "Make it so you can only push the red stone." A grey stone holds — a
//      knock, no sink — so the crossing dismantles point by point from the
//      far end in. (nextRed keeps its general nearest-survivor form; taps
//      simply can no longer reach the cases where it matters.)

// ---- the pure red walk -----------------------------------------------------

test('nextRed: sinking a stone that is not red moves nothing', () => {
  const sunk = [false, false, true, false, false, false, false];
  assert.equal(nextRed(6, 2, sunk), 6);
  assert.equal(nextRed(0, 5, [false, false, false, false, false, true, false]), 0);
});

test('nextRed: sinking the red hands it to the NEAREST survivor, not across the pond', () => {
  // Frank: "the next red one that appears is on the opposite direction, all
  // the way on the other side, and that's wrong — we want the closest one to
  // turn red next, and then they keep coming from the same side."
  // red on the far stone, everything else standing: its own neighbour takes it
  assert.equal(nextRed(6, 6, [false, false, false, false, false, false, true]), 5);
  // mid-line, with the near-side neighbour gone: the far-side one is nearest
  assert.equal(nextRed(1, 1, [false, true, true, false, false, false, false]), 0);
  // both neighbours gone: keep stepping out, near shore first on a tie
  assert.equal(nextRed(3, 3, [false, false, true, true, true, false, false]), 1);
  // only one survivor left, wherever it is
  assert.equal(nextRed(5, 5, [true, false, true, true, true, true, true]), 1);
});

test('nextRed: the red walks DOWN the line it started on, never hopping the pond', () => {
  // sink the red one every time, from the far stone: it should step 6,5,4...
  const n = 7;
  const sunk = Array(n).fill(false);
  let red = n - 1;
  const walk = [red];
  for (let k = 0; k < n - 1; k++) {
    sunk[red] = true;
    red = nextRed(red, red, sunk);
    walk.push(red);
  }
  assert.deepEqual(walk, [6, 5, 4, 3, 2, 1, 0], `the red marches in order, got ${walk}`);
});

test('nextRed: when the last survivor goes down the red vanishes', () => {
  assert.equal(nextRed(3, 3, [true, true, true, true, true, true, true]), -1);
});

test('nextRed: exactly one red among survivors, for every sinking order', () => {
  // seven stones is small enough to try a spread of full sinking orders
  const orders = [
    [0, 1, 2, 3, 4, 5, 6],
    [6, 5, 4, 3, 2, 1, 0],
    [3, 6, 0, 5, 1, 4, 2],
    [6, 0, 2, 4, 1, 3, 5],                       // starts on the red
    [2, 4, 6, 1, 3, 5, 0],
  ];
  for (const order of orders) {
    const sunk = new Array(7).fill(false);
    let red = 6;
    for (const i of order) {
      sunk[i] = true;
      red = nextRed(red, i, sunk);
      const standing = sunk.map((s, j) => !s && j).filter((v) => v !== false);
      if (standing.length) {
        assert.ok(red >= 0 && !sunk[red],
          `red=${red} after sinking ${i} with ${standing.length} standing`);
      } else {
        assert.equal(red, -1, 'no survivors, no red');
      }
    }
  }
});

// ---- the staged scene ------------------------------------------------------

const RED = new THREE.Color(ACCENT).getHexString();

function fakeCtx() {
  const taps = [];
  return {
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: () => {},
      raycastFirst: () => null,
    },
    _taps: taps,
  };
}

function staged() {
  const ctx = fakeCtx();
  const root = k39.build(ctx);
  root.setCamera({});                    // any truthy camera arms the taps
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  const tops = [];
  const hits = [];
  root.scene.traverse((o) => {
    if (o.name === 'stone-top') tops.push(o);
    if (o.name === 'stone-hit') hits.push(o);
  });
  // tap stone i: the case's tap loop probes each stone's own hit mesh in turn
  const tap = (i) => {
    ctx.input.raycastFirst = (cam, objs) => (objs && objs[0] === hits[i]
      ? { object: hits[i], point: new THREE.Vector3(), distance: 1 } : null);
    ctx._taps.forEach((cb) => cb());
  };
  return { root, ctx, tops, hits, tap };
}

const redTops = (tops) =>
  tops.filter((t) => t.material.color.getHexString() === RED).length;

test('case 39: seven stones, and the water under them is the blob', () => {
  const { root, tops, hits } = staged();
  assert.equal(tops.length, 7);
  assert.equal(hits.length, 7);
  let surface = null;
  root.scene.traverse((o) => { if (o.name === 'surface' && !surface) surface = o; });
  assert.ok(surface, 'the water has a surface');
  // every stone stands IN the water: straight down from each pivot, the sheet
  // is there to meet it — this is the pin that keeps the organic outline from
  // ever wobbling out from under the crossing
  for (const t of tops) {
    const p = t.parent.position;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(p.x, 20, p.z), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(surface, false).length > 0,
      `the stone at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) is not over water`);
  }
});

test('case 39: exactly one red stone, starting at the far end of the line', () => {
  const { root, tops } = staged();
  assert.equal(redTops(tops), 1, 'one seal, not zero, not two');
  assert.equal(tops[6].material.color.getHexString(), RED, 'the far stone opens red');
  assert.equal(root.fragment().red, 6);
});

test('case 39: a grey stone holds — it knocks, and nothing sinks', () => {
  // Frank: "make it so you can only push the red stone." Someone else's
  // phrase is perfectly load-bearing.
  const { root, tops, tap } = staged();
  root.update(1 / 60, 1);
  tap(2);
  root.update(1 / 60, 2.8);              // long past SINK
  assert.equal(root.fragment().sunk, 0, 'the grey stone did not go under');
  assert.equal(root.fragment().red, 6);
  assert.equal(tops[2].parent.visible, true, 'it is still standing');
  assert.equal(tops[6].material.color.getHexString(), RED);
  assert.equal(redTops(tops), 1);
});

test('case 39: the grey knock actually reaches the audio engine', () => {
  const calls = [];
  const ctx = fakeCtx();
  ctx.audio = { knock: (o) => calls.push(['knock', o]), drip: (o) => calls.push(['drip', o]) };
  const root = k39.build(ctx);
  root.setCamera({});
  root.update(1 / 60, 0);
  const hits = [];
  root.scene.traverse((o) => { if (o.name === 'stone-hit') hits.push(o); });
  ctx.input.raycastFirst = (cam, objs) => (objs && objs[0] === hits[2]
    ? { object: hits[2], point: new THREE.Vector3(), distance: 1 } : null);
  ctx._taps.forEach((cb) => cb());
  assert.equal(calls.length, 1, 'one answer per tap');
  assert.equal(calls[0][0], 'knock', 'a stone that holds sounds like stone, not water');
  assert.equal(root.fragment().sunk, 0);
});

test('case 39: only the red sinks, so the crossing dismantles from the far end in', () => {
  const { root, tops, tap } = staged();
  let t = 1;
  // THE HANDOVER WAITS FOR THE SINK. The red stays on the stone you touched
  // until it has actually gone under (Frank: "the next one turns red a bit
  // too early — it shouldn't turn red until that one has gone under"), so
  // every tap here is followed by a step past SINK (1.1s) before reading.
  const sink = (i) => { tap(i); t += 1.6; root.update(1 / 60, t); };

  tap(6);                                // the red one, touched...
  assert.equal(root.fragment().red, 6, 'still red while it is on its way down');
  t += 1.6; root.update(1 / 60, t);       // ...and now under
  assert.equal(root.fragment().red, 5, 'its neighbour takes it');
  assert.equal(tops[5].material.color.getHexString(), RED);
  assert.equal(redTops(tops), 1, 'the red MOVED — it did not duplicate');

  sink(3);                               // grey mid-line stone: it holds
  assert.equal(root.fragment().sunk, 1, 'a grey stone cannot be pushed under');
  assert.equal(root.fragment().red, 5);

  // the only way down the line is the red itself, stone by stone
  for (const [i, expect] of [[5, 4], [4, 3], [3, 2], [2, 1], [1, 0]]) {
    sink(i);
    assert.equal(root.fragment().red, expect, `red marches ${i} -> ${expect}`);
    assert.equal(redTops(tops), 1);
  }

  sink(0);                               // the last survivor goes down
  assert.equal(root.fragment().red, -1, 'no survivors, no red');
  assert.equal(root.fragment().sunk, 7);
});

test('case 39: when the stones surface again the red is back on the far one', () => {
  const { root, tops, tap } = staged();
  let t = 1;
  // red order — the only order taps can achieve now
  for (const i of [6, 5, 4, 3, 2, 1, 0]) { tap(i); t += 1.6; root.update(1 / 60, t); }
  assert.equal(root.fragment().red, -1);
  root.update(1 / 60, t + 30);           // long past SURFACE_AFTER
  assert.equal(root.fragment().sunk, 0, 'the crossing came back');
  assert.equal(root.fragment().red, 6, 'reset whole: the far stone is red again');
  assert.equal(redTops(tops), 1);
  for (const s of tops) assert.ok(s.parent.visible, 'every stone is standing again');
});

// ---- the pond is a HOLE ------------------------------------------------------
// Frank: "we've got the water lifted up above the ground to fix the z-fighting...
// we could deform the ground where the water is, so it rapidly slopes down and
// is deep enough that there's no z-fighting, and we wouldn't have this weird
// thing where it's floating above the ground."
//
// Both halves of that have to hold at once, and neither shows up as an error if
// it breaks — a sheet back above the meadow just looks slightly wrong, and a bed
// that rises through the water just flickers. So: measured against the water's
// OWN outline, which is the only thing that knows where the shore is.

function pondParts() {
  const root = k39.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  let ground = null, surface = null, water = null;
  root.scene.traverse((o) => {
    if (o.name === 'ground') ground = o;
    if (o.name === 'water') water = o;
    if (o.name === 'surface') surface = o;
  });
  return { root, ground, water, surface };
}

test('case 39: the water sits BELOW the meadow, not above it', () => {
  const { water } = pondParts();
  assert.ok(water, 'the pond is in the scene');
  assert.ok(water.position.y < 0,
    `the sheet must sit under the bank, got y ${water.position.y}`);
  assert.ok(water.position.y > -0.25,
    `and only just under it — a pond, not a well (y ${water.position.y})`);
});

test('case 39: the bed is dug out under the water and untouched outside it', () => {
  const { ground, water } = pondParts();
  const pos = ground.geometry.attributes.position;
  const wy = water.position.y;
  // shoreDistance lives in the water's local space; the surface mesh shares it
  const cx = water.position.x, cz = water.position.z;

  let insideChecked = 0, worstInside = -Infinity;
  let outsideChecked = 0, worstOutside = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    const r = Math.hypot(x - cx, z - cz);
    if (r > 9) continue;                       // far from the pond either way
    if (r < 4.0) {                             // safely inside the blob's min radius
      insideChecked++;
      worstInside = Math.max(worstInside, y);
    } else if (r > 6.0) {                      // safely outside its max radius
      outsideChecked++;
      worstOutside = Math.min(worstOutside, y);
    }
  }
  assert.ok(insideChecked > 8 && outsideChecked > 8, 'the sample found real ground');
  // The bed became a GRADIENT (shallow crossing, deep koi side), so the old
  // uniform "well below" pin (wy - 0.5 everywhere) now applies only past the
  // stone line; the shallow side merely has to stay submerged.
  assert.ok(worstInside < wy - 0.15,
    `the bed under the water must stay submerged (highest ${worstInside.toFixed(2)} vs water ${wy})`);
  assert.ok(worstOutside > wy,
    `and the bank outside must stay above it (lowest ${worstOutside.toFixed(2)} vs water ${wy})`);

  // the deep zone keeps the original guarantee
  let deepChecked = 0, worstDeep = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i) - cx, lz = pos.getZ(i) - cz;
    if (Math.hypot(lx, lz) > 4.0) continue;
    const s = (lx - 3.2) * 0.62 + (lz - 3.5) * -0.79;   // same axis as the carve
    if (s < 2.4) continue;   // most of the ramp done — carve depth ≥ ~1.1 here
    deepChecked++;
    worstDeep = Math.max(worstDeep, pos.getY(i));
  }
  assert.ok(deepChecked > 3, 'the sample found deep-zone ground');
  assert.ok(worstDeep < wy - 0.5,
    `the koi side must stay a real pool (highest ${worstDeep.toFixed(2)} vs water ${wy})`);
});

test('case 39: the fish are unlit, or they vanish under the sheet', () => {
  // A submerged koi is composited at (1 - opacity) of itself, and the toon ramp
  // then spends most of that on shading: lit, repainting one from mid grey to
  // nearly paper moves the rendered pixel by three levels and the fish reads as
  // nothing but its own depth-ink outline. This is that fix, pinned.
  const { root } = pondParts();
  const bodies = [];
  root.scene.traverse((o) => { if (o.name === 'koi-body') bodies.push(o); });
  assert.ok(bodies.length >= 3, `there are fish in the pond, got ${bodies.length}`);
  for (const b of bodies) {
    assert.ok(b.material.isMeshBasicMaterial, 'unlit — the water eats toon shading');
    assert.equal(b.userData.keepMaterial, true, 'and the workbench must not relight it');
    assert.equal(b.userData.noOutline, true, 'no ink hull on a thing seen through water');
  }
});

// ---- the gradient pond (Frank's second pond ruling) -------------------------
// "The water more shallow where the stones are... deeper farther away where
// the fish are. The stones can be a bit taller, so they're fully touching the
// bottom of the pond. The fish are further back where it can be a bit deeper,
// positioned so they're not overlapping with the stones."

function bedYAt(ground, x, z) {
  const p = ground.geometry.attributes.position;
  let best = Infinity, y = 0;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i) - x, p.getZ(i) - z);
    if (d < best) { best = d; y = p.getY(i); }
  }
  return y;
}

test('case 39: the bed is shallow under the crossing and deep under the koi', () => {
  const { root, ground } = pondParts();
  // mid-line stone (world) vs the koi school's center (world 1.8, -3.6)
  const tops = [];
  root.scene.traverse((o) => { if (o.name === 'stone-top') tops.push(o.parent); });
  const mid = tops[3].position;
  const stoneBed = bedYAt(ground, mid.x, mid.z);
  const koiBed = bedYAt(ground, 1.8, -3.6);
  assert.ok(koiBed < stoneBed - 0.5,
    `deep side must be at least 0.5 deeper: stones ${stoneBed.toFixed(2)}, koi ${koiBed.toFixed(2)}`);
});

test('case 39: every stone stands on the bottom, none floats', () => {
  const { root, ground } = pondParts();
  root.scene.traverse((o) => {
    if (o.name !== 'stone-top') return;
    const pivot = o.parent;
    const bottom = pivot.position.y + o.position.y - 0.55 / 2;
    const bed = bedYAt(ground, pivot.position.x, pivot.position.z);
    assert.ok(bottom <= bed + 0.02,
      `stone at (${pivot.position.x.toFixed(1)},${pivot.position.z.toFixed(1)}) floats: bottom ${bottom.toFixed(2)} over bed ${bed.toFixed(2)}`);
    assert.ok(bottom >= bed - 0.6, `stone sunk absurdly deep: ${bottom.toFixed(2)} vs bed ${bed.toFixed(2)}`);
  });
});

test('case 39: the koi never swim into the crossing', () => {
  const { root } = staged();
  const stones = [];
  const fish = [];
  root.scene.traverse((o) => {
    if (o.name === 'stone-top') stones.push(o.parent);
    if (o.name === 'fish') fish.push(o);
  });
  assert.equal(fish.length, 4);
  // sample a full minute of swimming: no fish center comes within a stone's
  // radius + half a fish of any stone
  for (let t = 0; t < 60; t += 0.25) {
    root.update(0.25, t);
    for (const f of fish) {
      const fx = f.position.x + 0.4, fz = f.position.z - 1.6;   // koi group sits at (0.4,·,-1.6)
      for (const s of stones) {
        const d = Math.hypot(fx - s.position.x, fz - s.position.z);
        assert.ok(d > 0.75, `fish at (${fx.toFixed(1)},${fz.toFixed(1)}) crosses stone at (${s.position.x.toFixed(1)},${s.position.z.toFixed(1)}) t=${t}`);
      }
    }
  }
});
