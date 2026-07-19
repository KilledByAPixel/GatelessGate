import * as THREE from '../lib/three.module.js';

export function isTap(down, up, maxDrift = 6) {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxDrift;
}

export function makeInput(el) {
  const tapCbs = [];
  const hoverCbs = [];
  const ndc = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  let down = null;

  const toNdc = (cx, cy) => {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
  };

  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (down && isTap(down, { x: e.clientX, y: e.clientY })) {
      for (const cb of tapCbs) cb(e.clientX, e.clientY);
    }
    down = null;
  };
  const onMove = (e) => { toNdc(e.clientX, e.clientY); for (const cb of hoverCbs) cb(e.clientX, e.clientY); };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointermove', onMove);

  return {
    onTap(cb) { tapCbs.push(cb); },
    onHover(cb) { hoverCbs.push(cb); },
    pointer() { return { x: ndc.x, y: ndc.y }; },
    raycastFirst(camera, objects) {
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(objects, false);
      return hits.length ? hits[0] : null;
    },
    clear() { tapCbs.length = 0; hoverCbs.length = 0; },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
    },
  };
}
