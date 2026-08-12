import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT, WASH } from '../palette.js';
import { clamp01 } from '../util/math.js';

// Keichu's wheel (case 8) on a wheelwright's stand.
//
// The koan asks what becomes of the wheel when you remove the NAVE — the hub
// that unites the spokes. So that is the object's one behaviour: take the nave
// out and the spokes, having nothing to hold them together, let go one after
// another, leaving a bare rim. Which keeps turning. It was never the hub doing
// the turning.
//
// The wheel lies in the local XY plane and turns about local +Z; the stand's
// axle runs along Z. Origin sits on the ground under the axle.
//
// Motion is a closed form over the simTime handed to update() — the turn is
// just clock × rate, and every dissolve is an eased ramp from a recorded
// start time, so the same call sequence always gives the same pose.

const easeInOut = (k) => k * k * (3 - 2 * k);

const FADE = 0.42;        // seconds for one part to go
const SPOKE_STAGGER = 0.05;   // they let go in a ripple, not a blink

export function makeWheel({
  radius = 1.1,
  spokes = 12,
  color = WASH.dark,       // the STAND — posts, axle, pad timber
  wheelColor = ACCENT,     // everything that TURNS — rim, spokes, nave
  rate = 0.22,
} = {}) {
  const R = radius;
  const g = new THREE.Group();
  g.name = 'wheel';

  const timber = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });
  const stone = toonMaterial({ color: WASH.stone, flat: true });
  // the wheel is the accent: the case is about what keeps turning when you
  // pull the hub, so the whole turning assembly is red and only the stand
  // holding it up stays neutral ink
  const wheelMat = toonMaterial({ color: wheelColor, flat: true });

  const CY = R * 1.14;              // axle height: the rim hangs just clear of the ground

  // the stand: a stone pad and two posts carrying the axle, one either side
  const padH = 0.09 * R;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * R, 0.70 * R, padH, 9), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * R, 0.075 * R, CY, 7), timber);
    post.name = 'post';
    post.position.set(0, CY / 2, sz * 0.34 * R);
    g.add(post);
  }
  const axleGeo = new THREE.CylinderGeometry(0.045 * R, 0.045 * R, 0.86 * R, 7);
  axleGeo.rotateX(Math.PI / 2);
  const axle = new THREE.Mesh(axleGeo, flat);
  axle.name = 'axle';
  axle.position.y = CY;
  g.add(axle);

  // everything that turns
  const spin = new THREE.Group();
  spin.name = 'spin';
  spin.position.y = CY;
  g.add(spin);

  // THE RIM — the felloe, the wooden band the spokes actually drive. The first
  // pass drew it as a wire (0.062R tube on a 30-facet torus): thin enough that
  // at scene distance it read as a hoop of string, not the timber a wheel-
  // wright would have bent and jointed. Thickened, and the facet count eased
  // back since the extra tube radius makes the segments themselves more
  // visible — the same silhouette wants fewer, cleaner facets at this size.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.088 * R, 8, 24), wheelMat);
  rim.name = 'rim';
  spin.add(rim);

  // THE NAVE — the hub uniting the spokes; what the case reaches in and
  // removes. A shade bigger than the first pass so it reads as the thing
  // twelve spokes actually root into, not a bead threaded onto the axle.
  const naveGeo = new THREE.CylinderGeometry(0.20 * R, 0.20 * R, 0.36 * R, 9);
  naveGeo.rotateX(Math.PI / 2);
  const nave = new THREE.Mesh(naveGeo, wheelMat);
  nave.name = 'nave';
  spin.add(nave);

  const spokeMeshes = [];
  const inner = 0.15 * R, outer = R - 0.05 * R;
  const len = outer - inner;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 0.048 * R, 0.048 * R), wheelMat);
    s.name = 'spoke';
    s.position.set(Math.cos(a) * (inner + len / 2), Math.sin(a) * (inner + len / 2), 0);
    s.rotation.z = a;
    spin.add(s);
    spokeMeshes.push(s);
  }

  // a forgiving target: the nave has its own small drum (tapping the middle is
  // the gesture the koan describes), and the wheel a large one behind it
  const naveHit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34 * R, 0.34 * R, 0.5 * R, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  naveHit.name = 'nave-hit';
  naveHit.geometry.rotateX(Math.PI / 2);
  spin.add(naveHit);

  const wheelHit = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.42 * R, 10),
    new THREE.MeshBasicMaterial({ visible: false }));
  wheelHit.name = 'wheel-hit';
  wheelHit.geometry.rotateX(Math.PI / 2);
  spin.add(wheelHit);

  // ---- assembly state ---------------------------------------------------
  // Each dissolving part carries where it is going and when it set off. The
  // nave leads; the spokes follow in a ripple, because they are only there
  // because of it.
  const parts = [
    { mesh: nave, delay: 0, from: 1, to: 1, t0: -99 },
    ...spokeMeshes.map((mesh, i) => ({
      mesh, delay: 0.14 + i * SPOKE_STAGGER, from: 1, to: 1, t0: -99,
    })),
  ];

  let clock = 0;
  let whole = true;

  function pose() {
    for (const p of parts) {
      const k = clamp01((clock - p.t0 - p.delay) / FADE);
      const s = p.from + (p.to - p.from) * easeInOut(k);
      p.mesh.visible = s > 0.001;
      if (p.mesh.visible) p.mesh.scale.setScalar(s);
    }
    spin.rotation.z = -clock * rate;
  }

  return {
    group: g,
    // the nave first: tapping the middle is the koan's own gesture, and its
    // drum sits inside the wheel's
    pickTargets() { return [naveHit, wheelHit]; },
    naveTargets() { return [naveHit]; },

    // remove the nave, or put it back. Returns the new state.
    toggle() {
      whole = !whole;
      for (const p of parts) { p.from = p.mesh.scale.x; p.to = whole ? 1 : 0; p.t0 = clock; }
      pose();
      return whole;
    },
    hubbed() { return whole; },
    // how much of the wheel is still assembled, 0..1 — the rim is not counted,
    // because the rim is never in question
    assembled() {
      let s = 0;
      for (const p of parts) s += p.mesh.visible ? p.mesh.scale.x : 0;
      return s / parts.length;
    },
    turn() { return spin.rotation.z; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      pose();
    },
  };
}
