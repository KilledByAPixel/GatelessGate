import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { mergeSimple } from './scatter.js';

// A market stall — the timber frame and cloth awning of a booth on a lane,
// with a counter to stand behind and a few goods heaped on it. Built for case
// 45, where the koan is "as if you met your own father on a busy street," so
// the street has to actually be one.
//
// Cheap by construction: the whole frame (four posts, the counter board, a
// back shelf) bakes into ONE merged mesh, the goods into a second, and the
// awning is a third. Three meshes a stall, so a row of them fits the draw
// budget with a crowd still to come.
//
// Authored facing +z: the counter is at the front (+z), the awning slopes down
// toward it, the back posts are at -z. Rotate the group to face it onto a lane.
export function makeStall({
  width = 1.8,
  depth = 1.2,
  height = 2.0,
  seed = 0,
  wood = WASH.dry,
  cloth = wash(0.34),
  goods = true,
} = {}) {
  const g = new THREE.Group();
  g.name = 'stall';
  const hw = width / 2;
  const hd = depth / 2;
  const post = 0.06 * (width + depth);

  // ---- the frame: posts, counter, shelf — one merged mesh -----------------
  const frame = [];
  const box = (w, h, d, x, y, z) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.translate(x, y, z);
    return b;
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // front posts a touch shorter — the awning slopes forward
      const ph = sz > 0 ? height * 0.86 : height;
      frame.push(box(post, ph, post, sx * (hw - post), ph / 2, sz * (hd - post)));
    }
  }
  // the counter, a board at standing height across the front
  const counterY = height * 0.42;
  frame.push(box(width, 0.10, 0.10, 0, counterY, hd - post));
  frame.push(box(width, 0.5, 0.06, 0, counterY - 0.28, hd - post));   // its front panel
  // a back shelf up under the awning
  frame.push(box(width, 0.07, 0.22, 0, height * 0.72, -hd + post * 1.5));

  // ---- the awning's own eave: fascia + rafter-tip rhythm -------------------
  // The stall's cloth roof had no eave language at all — a flat tilted box
  // with nothing telling the reader it is a ROOF rather than a lid. hut.js's
  // eave is a fascia band with rafter tips poking through it on a regular
  // beat; a market awning cannot afford the full hipped shell, but it can
  // afford the same two moves in timber, baked into the one frame mesh so
  // the rhythm costs nothing extra to draw. eaveY sits just under the cloth
  // (awning is set below); ribs run back under the cloth and their tips
  // poke a hair proud of the fascia, echoing hut.js's RAFTER_OUT.
  const eaveY = height * 0.88;
  const fasciaZ = hd + 0.03;
  frame.push(box(width + 0.20, 0.05, 0.05, 0, eaveY, fasciaZ));       // the fascia band
  const ribN = Math.max(3, Math.round(width / 0.42));
  for (let i = 0; i <= ribN; i++) {
    const rx = -width / 2 + (width * i) / ribN;
    frame.push(box(0.045, 0.045, depth + 0.10, rx, eaveY - 0.01, 0.02));
  }
  const frameMesh = new THREE.Mesh(mergeSimple(frame), toonMaterial({ color: wood, flat: true }));
  frameMesh.name = 'stall-frame';
  g.add(frameMesh);

  // ---- the awning: a cloth sloping down toward the lane -------------------
  const awn = new THREE.BoxGeometry(width + 0.18, 0.04, depth + 0.12);
  const awning = new THREE.Mesh(awn, toonMaterial({ color: cloth, flat: true }));
  awning.name = 'stall-awning';
  awning.position.set(0, height * 0.9, 0.02);
  awning.rotation.x = -0.20;                    // front edge dips
  g.add(awning);

  // ---- the goods heaped on the counter ------------------------------------
  if (goods) {
    const lumps = [];
    const n = 4 + Math.floor(hash1(1, seed) * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.07 + hash1(i * 3 + 2, seed) * 0.06;
      const lx = (hash1(i * 3 + 3, seed) - 0.5) * (width - 0.3);
      const lz = hd - post - 0.02 + (hash1(i * 3 + 4, seed) - 0.5) * 0.12;
      const s = new THREE.SphereGeometry(r, 6, 5);
      s.scale(1, 0.8, 1);
      s.translate(lx, counterY + 0.05 + r * 0.8, lz);
      lumps.push(s);
    }
    const goodsMesh = new THREE.Mesh(mergeSimple(lumps), toonMaterial({ color: WASH.mid, flat: true }));
    goodsMesh.name = 'stall-goods';
    g.add(goodsMesh);
  }

  return g;
}
