import * as THREE from '../lib/three.module.js';

export function isTap(down, up, maxDrift = 6) {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxDrift;
}

export function makeInput(el) {
  const tapCbs = [];
  const hoverCbs = [];
  const ndc = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  // THE PRESS IN PROGRESS, and it is armed rather than merely remembered: a
  // release only counts as a tap while one is live, so everything that ends a
  // press has to disarm it. Three ways it used to survive, and each one handed
  // a case a touch the reader never made — worst on case 27, where a tap
  // anywhere empties the page, so the reader arrived to find it already gone:
  //
  //   * a press abandoned off the canvas (released over the text panel, the
  //     toolbar, or outside the window) stayed armed for the rest of the
  //     session, and the next release that happened to land near it fired;
  //   * a press outlived a PAGE TURN, so one begun on the outgoing page
  //     completed as a tap on the incoming one;
  //   * any pointer's release completed any other pointer's press.
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
  const onDown = (e) => {
    toNdc(e.clientX, e.clientY);
    over = true;
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = (e) => {
    toNdc(e.clientX, e.clientY);
    // Same pointer, or it is not this press finishing — a second finger's
    // release must not complete the first one's.
    const mine = down && (down.id === undefined || e.pointerId === undefined || down.id === e.pointerId);
    if (mine && isTap(down, { x: e.clientX, y: e.clientY })) {
      for (const cb of tapCbs) cb(e.clientX, e.clientY);
    }
    if (mine) down = null;
  };
  const onMove = (e) => { toNdc(e.clientX, e.clientY); over = true; for (const cb of hoverCbs) cb(e.clientX, e.clientY); };
  // pointerleave covers the mouse walking off the canvas AND a touch lifting
  // (browsers fire it after pointerup for touch, so a real tap has already
  // fired by the time this runs); pointercancel covers the OS stealing the
  // gesture mid-drag. Either way the press is over as far as this canvas is
  // concerned: whatever happens next, it did not happen here.
  const onLeave = () => { over = false; down = null; };

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
    // Disarms the press as well as emptying the callbacks. This runs on every
    // page turn (main.js's clearInput), and a press is a gesture aimed at the
    // page it began on: carrying it across meant a release after the turn
    // touched the case that had just arrived.
    clear() { tapCbs.length = 0; hoverCbs.length = 0; down = null; },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointercancel', onLeave);
    },
  };
}
