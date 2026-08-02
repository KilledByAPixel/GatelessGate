import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';

import k39, { nextRed } from '../src/koans/k39.js';
import { ACCENT } from '../src/palette.js';

// Case 39's two rulings from Frank, pinned:
//
//   1. "Make that pond less square-shaped — more organically shaped, kinda
//      roundish." The water is a seeded blob now; what this file owns is that
//      every stepping stone still stands IN that water at this seed.
//   2. "When you push one under, the next one turns red, since that one
//      disappears — so there's always exactly one red." The selection is the
//      pure function `nextRed`; the scene tests hold the invariant through
//      real taps, the full sinking, and the resurfacing reset.

// ---- the pure red walk -----------------------------------------------------

test('nextRed: sinking a stone that is not red moves nothing', () => {
  const sunk = [false, false, true, false, false, false, false];
  assert.equal(nextRed(6, 2, sunk), 6);
  assert.equal(nextRed(0, 5, [false, false, false, false, false, true, false]), 0);
});

test('nextRed: sinking the red hands it to the next survivor in build order, wrapping', () => {
  // red on the far stone, everything else standing: wraps to the near shore
  assert.equal(nextRed(6, 6, [false, false, false, false, false, false, true]), 0);
  // mid-line, with the immediate neighbour already gone: skips to the survivor
  assert.equal(nextRed(1, 1, [false, true, true, false, false, false, false]), 3);
  // wrap over the end past sunk stones
  assert.equal(nextRed(5, 5, [true, false, true, true, true, true, true]), 1);
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

test('case 39: sinking a plain stone leaves the red where it was', () => {
  const { root, tops, tap } = staged();
  root.update(1 / 60, 1);
  tap(2);
  assert.equal(root.fragment().red, 6);
  assert.equal(tops[6].material.color.getHexString(), RED);
  assert.equal(redTops(tops), 1);
});

test('case 39: sinking the red hands it to the next survivor — one red all the way down', () => {
  const { root, tops, tap } = staged();
  let t = 1;
  const step = () => { t += 0.5; root.update(1 / 60, t); };

  step(); tap(2);                        // plain stone first: red stays on 6
  step(); tap(6);                        // the red goes under: wraps to 0
  assert.equal(root.fragment().red, 0);
  assert.equal(tops[0].material.color.getHexString(), RED);
  assert.equal(redTops(tops), 1, 'the red MOVED — it did not duplicate');

  step(); tap(0);                        // red again: 1 survives, takes it
  assert.equal(root.fragment().red, 1);
  step(); tap(1);                        // red again: 2 is sunk, so 3 takes it
  assert.equal(root.fragment().red, 3);
  assert.equal(redTops(tops), 1);

  step(); tap(4);                        // plain: red stays on 3
  assert.equal(root.fragment().red, 3);
  step(); tap(3);                        // red: 4 is sunk, 5 takes it
  assert.equal(root.fragment().red, 5);
  assert.equal(redTops(tops), 1);

  step(); tap(5);                        // the last survivor goes down
  assert.equal(root.fragment().red, -1, 'no survivors, no red');
  assert.equal(root.fragment().sunk, 7);
});

test('case 39: when the stones surface again the red is back on the far one', () => {
  const { root, tops, tap } = staged();
  let t = 1;
  for (const i of [0, 1, 2, 3, 4, 5, 6]) { t += 0.5; root.update(1 / 60, t); tap(i); }
  assert.equal(root.fragment().red, -1);
  root.update(1 / 60, t + 30);           // long past SURFACE_AFTER
  assert.equal(root.fragment().sunk, 0, 'the crossing came back');
  assert.equal(root.fragment().red, 6, 'reset whole: the far stone is red again');
  assert.equal(redTops(tops), 1);
  for (const s of tops) assert.ok(s.parent.visible, 'every stone is standing again');
});
