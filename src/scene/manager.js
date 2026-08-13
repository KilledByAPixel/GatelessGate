import * as THREE from '../../lib/three.module.js';

function disposeMaterial(mat, disposed, counts) {
  for (const key of ['map', 'alphaMap']) {
    const tex = mat[key];
    if (tex && !tex.userData?.shared && !disposed.has('t' + tex.id)) {
      disposed.add('t' + tex.id); tex.dispose(); counts.textures++;
    }
  }
  if (!disposed.has('m' + mat.id)) { disposed.add('m' + mat.id); mat.dispose(); counts.materials++; }
}

export function disposeRoot(root, disposed = new Set()) {
  const counts = { geometries: 0, materials: 0, textures: 0 };
  root.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && !disposed.has('g' + o.geometry.id)) {
      disposed.add('g' + o.geometry.id); o.geometry.dispose(); counts.geometries++;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) disposeMaterial(m, disposed, counts);
  });
  return counts;
}

export function makeSceneManager(renderer, dissolve, post = null, freeze = null) {
  const dissolveScene = new THREE.Scene();
  dissolveScene.add(dissolve.mesh);
  let current = null;

  function render(camera) {
    // the dissolve is UI, not part of the picture: post runs on the scene, then
    // the ink curtain draws over the finished frame
    if (current) {
      if (post && post.active) post.render(current.scene, camera);
      else renderer.render(current.scene, camera);
    }
    if (dissolve.t < 1) {
      renderer.autoClear = false;
      try { renderer.render(dissolveScene, camera); }
      finally { renderer.autoClear = true; }
    }
    // A held frame from the outgoing scene sits above everything, curtain
    // included — while it is up, the new world is being built underneath it.
    if (freeze) freeze.draw();
  }

  // The app orchestrates transitions (ink cover → setActive+disposeRoot → reveal);
  // the manager just holds the active root and renders it under the dissolve.
  return {
    setActive(root) { current = root; },
    active() { return current; },
    render,
  };
}
