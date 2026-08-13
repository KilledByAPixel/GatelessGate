import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { disposeRoot } from '../src/scene/manager.js';

test('disposeRoot frees geometry + own textures', () => {
  const scene = new THREE.Scene();
  // any mesh carrying a geometry and a material of its own — this was the
  // retired makeIsland, which was only ever standing in for "a kit prop"
  scene.add(new THREE.Mesh(
    new THREE.CylinderGeometry(4, 3.7, 0.55, 32),
    new THREE.MeshBasicMaterial()));
  // a mesh with its own DataTexture map (the role the retired blob shadows
  // used to play here): disposeRoot must free it
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  scene.add(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: tex })));
  const disposed = new Set();
  const counts = disposeRoot({ scene }, disposed);
  assert.ok(counts.geometries >= 2, `geometries ${counts.geometries}`);
  assert.ok(counts.textures >= 1, `expected the blob texture disposed, got ${counts.textures}`);
  assert.ok(counts.materials >= 2, 'both non-shared materials disposed (id-collision regression)');
});

test('disposeRoot does not double-dispose shared geometry', () => {
  // two meshes sharing one geometry, the way a builder reuses a single
  // BufferGeometry across instances
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  const scene = new THREE.Scene(); scene.add(a, b);
  const counts = disposeRoot({ scene });
  assert.equal(counts.geometries, 1, 'shared geometry disposed once');
});
