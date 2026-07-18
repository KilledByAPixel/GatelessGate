import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { disposeRoot } from '../src/scene/manager.js';
import { makeIsland } from '../src/kit/island.js';
import { makeBlobShadow } from '../src/render/blobshadow.js';
import { toonRamp } from '../src/render/toon.js';

test('shared ramp is flagged', () => {
  assert.equal(toonRamp().userData.shared, true);
});

test('disposeRoot frees geometry + own textures but not the shared ramp', () => {
  const scene = new THREE.Scene();
  scene.add(makeIsland({ radius: 4, seed: 1 }));      // toon material -> shared gradientMap
  scene.add(makeBlobShadow({ radiusX: 1, radiusZ: 1 })); // own DataTexture (map)
  const disposed = new Set();
  const counts = disposeRoot({ scene }, disposed);
  assert.ok(counts.geometries >= 2, `geometries ${counts.geometries}`);
  assert.ok(counts.textures >= 1, `expected the blob texture disposed, got ${counts.textures}`);
  assert.equal(disposed.has(toonRamp().id), false, 'shared ramp must not be disposed');
});

test('disposeRoot does not double-dispose shared geometry', () => {
  // two meshes sharing one geometry (like an outline shell)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  const scene = new THREE.Scene(); scene.add(a, b);
  const counts = disposeRoot({ scene });
  assert.equal(counts.geometries, 1, 'shared geometry disposed once');
});
