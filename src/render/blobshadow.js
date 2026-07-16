import * as THREE from '../../lib/three.module.js';

// Painted wash blobs instead of shadow maps: soft ink ellipses on the ground.

export function blobPixels(size = 64) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const d = Math.hypot(nx, ny);
      let a = Math.max(0, 1 - d);
      a = a * a * (3 - 2 * a); // smooth falloff
      const i = (y * size + x) * 4;
      data[i] = 30; data[i + 1] = 30; data[i + 2] = 36; // ink RGB
      data[i + 3] = Math.round(a * 255);
    }
  }
  return data;
}

export function makeBlobShadow({ radiusX = 0.6, radiusZ = 0.45, opacity = 0.28 } = {}) {
  const size = 64;
  const tex = new THREE.DataTexture(blobPixels(size), size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2), mat);
  mesh.name = 'blobshadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.01;
  mesh.userData.noOutline = true;
  return mesh;
}
