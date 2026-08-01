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
  // whether the pointer is actually OVER the canvas right now — pointerNDC()
  // answers null otherwise, so the breeze never blows from a stale position
  let over = false;
  const overPt = { x: 0, y: 0 };   // reused: pointerNDC is called every tick

  const toNdc = (cx, cy) => {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
  };

  // Taps must set the pointer themselves. A touch tap produces no pointermove
  // first, so without this the raycast would fire at wherever the pointer last
  // was — dead centre on a device that has never moved one.
  const onDown = (e) => { toNdc(e.clientX, e.clientY); over = true; down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    toNdc(e.clientX, e.clientY);
    if (down && isTap(down, { x: e.clientX, y: e.clientY })) {
      for (const cb of tapCbs) cb(e.clientX, e.clientY);
    }
    down = null;
  };
  const onMove = (e) => { toNdc(e.clientX, e.clientY); over = true; for (const cb of hoverCbs) cb(e.clientX, e.clientY); };
  // pointerleave covers the mouse walking off the canvas AND a touch lifting
  // (browsers fire it after pointerup for touch); pointercancel covers the OS
  // stealing the gesture mid-drag
  const onLeave = () => { over = false; };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointercancel', onLeave);

  return {
    onTap(cb) { tapCbs.push(cb); },
    onHover(cb) { hoverCbs.push(cb); },
    pointer() { return { x: ndc.x, y: ndc.y }; },
    // The live pointer for the breeze: last position in NDC while the pointer
    // is over the canvas, null once it leaves (or before it ever arrives).
    // Returns a REUSED object — read it, don't keep it.
    pointerNDC() {
      if (!over) return null;
      overPt.x = ndc.x; overPt.y = ndc.y;
      return overPt;
    },
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
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
    },
  };
}
