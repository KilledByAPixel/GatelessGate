import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k11 from '../src/koans/k11.js';

// Case 11 — Joshu examines a monk in meditation. Two staging complaints from
// Frank's pass live here so they cannot come back:
//   1. the hall's hill sat ON the main path — the road ran into the slope and
//      vanished under it;
//   2. the meadow was planted at terrain height, so blades knifed up through
//      the raised plateau instead of riding the hill.

function fakeCtx() {
  return {
    audio: null,
    input: { onTap: () => {}, onHover: () => {}, raycastFirst: () => null },
  };
}

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
      // off the hill but inside the terrain's flat radius: ground level,
      // sunk by the same hair — the surface function IS the terrain out here
      assert.ok(Math.abs(p.y - (0 - 0.02)) < 1e-4,
        `flat-ground grass stays at ground level: y ${p.y.toFixed(4)}`);
    }
  }
  // the point of the whole exercise: the hill actually WEARS grass now
  assert.ok(onPlateau > 30, `the plateau carries a stand of its own: ${onPlateau} tufts`);
});
