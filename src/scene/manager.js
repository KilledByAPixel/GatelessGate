import * as THREE from '../../lib/three.module.js';

function disposeMaterial(mat, disposed, counts) {
  for (const key of ['map', 'gradientMap', 'alphaMap']) {
    const tex = mat[key];
    if (tex && !tex.userData?.shared && !disposed.has(tex.id)) {
      disposed.add(tex.id); tex.dispose(); counts.textures++;
    }
  }
  if (!disposed.has(mat.id)) { disposed.add(mat.id); mat.dispose(); counts.materials++; }
}

export function disposeRoot(root, disposed = new Set()) {
  const counts = { geometries: 0, materials: 0, textures: 0 };
  root.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && !disposed.has(o.geometry.id)) {
      disposed.add(o.geometry.id); o.geometry.dispose(); counts.geometries++;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) disposeMaterial(m, disposed, counts);
  });
  return counts;
}

export function makeSceneManager(renderer, dissolve) {
  const dissolveScene = new THREE.Scene();
  dissolveScene.add(dissolve.mesh);
  let current = null;

  function render(camera) {
    if (current) renderer.render(current.scene, camera);
    if (dissolve.t < 1) {
      renderer.autoClear = false;
      renderer.render(dissolveScene, camera);
      renderer.autoClear = true;
    }
  }

  return {
    setActive(root) { current = root; },
    active() { return current; },
    render,
    async swapTo(root, { disposePrev = true, dur = 0.8 } = {}) {
      await dissolve.dissolveOut(dur);       // cover with paper
      const prev = current;
      current = root;
      if (prev && disposePrev) { disposeRoot(prev); prev.dispose && prev.dispose(); }
      await dissolve.dissolveIn(dur);        // reveal the new root
    },
  };
}
