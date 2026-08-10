import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k11, { SHORE } from '../src/koans/k11.js';
import { groundHeight } from '../src/kit/ground.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// Case 11 — Joshu examines a monk in meditation. Two staging complaints from
// Frank's pass live here so they cannot come back:
//   1. the hall's hill sat ON the main path — the road ran into the slope and
//      vanished under it;
//   2. the meadow was planted at terrain height, so blades knifed up through
//      the raised plateau instead of riding the hill.

function built() {
  return k11.build(fakeCtx());
}

test('the hill stands clear of the main path', () => {
  const root = built();
  const rise = root.scene.children.find((c) => c.name === 'rise');
  const path = root.scene.children.find((c) => c.name === 'path');
  assert.ok(rise && path, 'rise and path are both staged');

  // the rise is a frustum: its base circumradius is the widest thing it owns
  const base = rise.geometry.parameters.radiusBottom;
  let minD = Infinity;
  for (let i = 0; i <= 60; i++) {
    const p = path.sample(i / 60);
    minD = Math.min(minD, Math.hypot(p.x - rise.position.x, p.z - rise.position.z));
  }
  // half the path's width (1.2, +15% wobble) plus real daylight between them.
  // At the old x -0.4 this measured 2.24 — the road was buried 1.4 deep.
  assert.ok(minD > base + 0.6,
    `the road clears the slope's foot: closest centerline ${minD.toFixed(2)} vs base ${base}`);
});

test('the meadow rides the hill: grass on the plateau stands AT plateau height', () => {
  const root = built();
  const rise = root.scene.children.find((c) => c.name === 'rise');
  const grass = root.scene.children.find((c) => c.name === 'grassfield');
  assert.ok(rise && grass, 'rise and grass are both staged');
  const topY = rise.position.y + rise.geometry.parameters.height / 2;   // the plateau
  const rTop = rise.geometry.parameters.radiusTop;

  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  let onPlateau = 0;
  for (let i = 0; i < grass.count; i++) {
    grass.getMatrixAt(i, m);
    m.decompose(p, q, s);
    const d = Math.hypot(p.x - rise.position.x, p.z - rise.position.z);
    if (d < rTop * Math.cos(Math.PI / 10) - 0.05) {
      // safely inside the top decagon: the root sits a hair under the plateau,
      // never at terrain zero (the old bug — tips knifing up through the top)
      onPlateau++;
      assert.ok(Math.abs(p.y - (topY - 0.02)) < 1e-4,
        `plateau grass at plateau height: y ${p.y.toFixed(4)} vs top ${topY}`);
    } else if (d > rise.geometry.parameters.radiusBottom + 0.1 && Math.hypot(p.x, p.z) < 8) {
      // off the hill but inside the terrain's flat radius: on the SHORED
      // ground, sunk by the same hair. This clause used to pin flat zero, and
      // the coast made that stale by one taper blade at z ≈ -6.5: near the
      // beach the land legitimately eases down toward the sand, so the meadow
      // must follow the surface the case actually plants on — the same SHORE
      // the module exports, not a copy that can drift.
      const want = groundHeight(p.x, p.z, { seed: 21, shore: SHORE }) - 0.02;
      assert.ok(Math.abs(p.y - want) < 1e-4,
        `off-hill grass stands on the shored terrain: y ${p.y.toFixed(4)} vs ${want.toFixed(4)}`);
    }
  }
  // the point of the whole exercise: the hill actually WEARS grass now
  assert.ok(onPlateau > 30, `the plateau carries a stand of its own: ${onPlateau} tufts`);
});

// Joshu's verdict, staged: "ships cannot remain where the water is too
// shallow." The ship exists, stands off past the beach where the bay has
// depth, and RIDES the sea — it must never sit welded to flat sea level while
// the swell moves under it, and it must never drift in toward the sand.
test('the ship stands off in deep water and rides the swell', () => {
  const root = built();
  const boat = root.scene.children.find((c) => c.name === 'boat');
  assert.ok(boat, 'a ship is on the water');

  // standing OFF: well seaward of the waterline (z = -SHORE.dist), out where
  // the shallows have ended rather than beached on the taper
  assert.ok(boat.position.z < -(SHORE.dist + 6),
    `offshore, past the shallows: z ${boat.position.z}`);

  // and it floats: across a few seconds of sea the hull's height moves with
  // the swell, and its trim stays a boat's — rocking, never rolling over
  const ys = new Set();
  for (let t = 0; t <= 6; t += 0.5) {
    root.update(1 / 60, t);
    ys.add(+boat.position.y.toFixed(5));
    assert.ok(Number.isFinite(boat.position.y), 'the hull stays finite');
    assert.ok(Math.abs(boat.rotation.x) < 0.3 && Math.abs(boat.rotation.z) < 0.3,
      `trim, not capsize: pitch ${boat.rotation.x.toFixed(3)} roll ${boat.rotation.z.toFixed(3)}`);
    // near sea level, always — riding the surface, not flying or sinking
    assert.ok(Math.abs(boat.position.y - (-0.35)) < 0.25,
      `on the surface: y ${boat.position.y.toFixed(3)}`);
  }
  assert.ok(ys.size > 8, `the swell actually lifts and lowers it: ${ys.size} distinct heights`);

  // the fist is still the only accent in the scene — the sea did not bring
  // k20's red with it, and the ship is ink like everything else
  assert.equal(root.fragment().visits, 0);
});
