import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { groundHeight } from './ground.js';
import { ACCENT } from '../palette.js';

// "In spring, hundreds of flowers." Tiny blooms scattered through the meadow as
// ONE InstancedMesh — a single draw call, seeded, conforming to the terrain and
// respecting keepout circles, exactly like makeRocks/makeBushes in scatter.js.
//
// This is NOT makeFlower: that is a big held lotus for case 6, twelve petals and
// a seed pod, meant to be looked at from a metre away. At this scale a bloom is
// five pixels, so it is a stem and a head and nothing else.
//
// Placement has two modes. Even scatter through an annulus is the scatter.js
// default; pass `along` — a list of {x, z} centres — and the blooms cluster into
// drifts around them instead. Wildflowers grow in drifts along a verge, not on a
// uniform grid, and a road with an even sprinkling either side looks planted.
//
// They nod. The sway is deterministic from simTime, and `gustAt(x, z)` sends a
// front travelling out from a point so a breeze crosses the field rather than
// every bloom bobbing in place. Rewriting ~120 instance matrices a frame is
// nothing; this does not need to be a shader.

const UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qLean = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

const GUST_SPEED = 7.5;   // units/second the front travels outward
const GUST_WIDTH = 3.4;   // how broad the front is, so it passes rather than snaps
const GUST_LIFE = 2.8;    // seconds before it has crossed the meadow and gone
const MAX_GUSTS = 4;

// one bloom: a hair-thin stem and a small faceted head sitting on top of it.
// The stem's base is at the local origin, so an instance plants exactly on the
// terrain and leans from its own foot.
function bloomGeometry(seed = 1) {
  const parts = [];
  const stem = new THREE.ConeGeometry(0.008, 0.185, 3, 1, true);  // open: no base cap
  stem.translate(0, 0.0925, 0);
  parts.push(stem);
  for (let i = 0; i < 3; i++) {
    const petal = new THREE.OctahedronGeometry(0.040, 0);
    petal.scale(1, 0.5, 1);                                        // flattened: a bloom, not a bead
    const a = (i / 3) * Math.PI * 2 + 0.4;
    petal.translate(
      Math.cos(a) * 0.020,
      0.188 + 0.014 * hash1(i + 1, seed),
      Math.sin(a) * 0.020,
    );
    parts.push(petal);
  }
  return mergeSimple(parts);
}

export function makeWildflowers({
  count = 90,
  radius = 18,           // nothing grows past here, in either placement mode
  rMin = 2,              // even-scatter mode only: the bare middle
  seed = 71,
  groundSeed = 21,
  color = ACCENT,        // each bloom is tiny, so full accent is right here
  keepout = [],
  along = null,          // [{x, z}] — cluster into drifts around these instead
  spread = 2.2,          // how far from a centre a bloom may stray
  windDir = [1, 0.35],   // matches the meadow's default, so they lean together
  sway = 0.17,           // resting breeze, radians of lean
} = {}) {
  const centres = along && along.length ? along : null;
  const pts = [];
  const budget = count * 16;
  let tries = 0;
  while (pts.length < count && tries < budget) {
    tries++;
    let x, z;
    if (centres) {
      const c = centres[Math.floor(hash1(tries * 5 + 1, seed) * centres.length) % centres.length];
      const a = hash1(tries * 5 + 2, seed) * Math.PI * 2;
      const rr = Math.sqrt(hash1(tries * 5 + 3, seed)) * spread;   // even area density in the drift
      x = c.x + Math.cos(a) * rr;
      z = c.z + Math.sin(a) * rr;
      if (Math.hypot(x, z) > radius) continue;
    } else {
      const a = hash1(tries * 5 + 1, seed) * Math.PI * 2;
      const rr = rMin + Math.sqrt(hash1(tries * 5 + 2, seed)) * (radius - rMin);
      x = Math.cos(a) * rr;
      z = Math.sin(a) * rr;
    }
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    pts.push({ x, z, u: hash1(tries * 5 + 4, seed) });
  }

  const geo = bloomGeometry(seed);
  const mat = toonMaterial({ color, flat: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, pts.length));
  mesh.count = pts.length;
  mesh.name = 'wildflowers';
  mesh.userData.noOutline = true;   // an inverted hull on a five-pixel bloom is a smudge
  mesh.castShadow = false;

  // the axis that tips a stem toward the wind: perpendicular to it, in the
  // ground plane, so every bloom leans the same way in WORLD space whatever its
  // own yaw happens to be
  const wd = new THREE.Vector2(windDir[0], windDir[1]);
  if (wd.lengthSq() < 1e-9) wd.set(1, 0);
  wd.normalize();
  const leanAxis = new THREE.Vector3(wd.y, 0, -wd.x);

  const baseColor = new THREE.Color(color);
  const blooms = pts.map((pt, i) => {
    // a resting tilt in its OWN direction, so a windless field is a meadow
    // rather than a bed of nails — widened from the original 0.05-0.20 rad so
    // the lean actually reads at a case's real viewing distance, not just in
    // a workbench close-up
    const tiltA = hash1(i * 9 + 2, seed) * Math.PI * 2;
    _axis.set(Math.cos(tiltA), 0, Math.sin(tiltA));
    const rest = new THREE.Quaternion()
      .setFromAxisAngle(_axis, 0.08 + 0.24 * hash1(i * 9 + 3, seed))
      .multiply(new THREE.Quaternion().setFromAxisAngle(UP, hash1(i * 9 + 1, seed) * Math.PI * 2));

    _c.copy(baseColor).offsetHSL(
      (hash1(i * 9 + 11, seed) - 0.5) * 0.02,
      (hash1(i * 9 + 13, seed) - 0.5) * 0.10,
      (hash1(i * 9 + 15, seed) - 0.5) * 0.16,
    );
    mesh.setColorAt(i, _c);

    // Two sizes, not one continuous range: about a third of the field is
    // openly BIG blooms, the rest small buds still tightening — a meadow has
    // flowers at different stages, not one species scaled up and down. The
    // old single `0.72 + 0.62*u` range read as texture noise rather than
    // variety; two clusters with a visible gap between them read as bud vs
    // bloom even at a case's real distance.
    const big = hash1(i * 9 + 21, seed) < 0.32;
    const sc = big ? 1.05 + 0.35 * pt.u : 0.52 + 0.30 * pt.u;

    return {
      x: pt.x,
      z: pt.z,
      y: groundHeight(pt.x, pt.z, { seed: groundSeed }),
      sc,
      tall: 0.85 + 0.35 * hash1(i * 9 + 9, seed),
      rest,
      phase: hash1(i * 9 + 5, seed) * Math.PI * 2,
      stiff: 0.7 + 0.6 * hash1(i * 9 + 7, seed),   // neighbours must not move in lockstep
    };
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const gusts = [];
  let meanLean = 0;

  function update(dt, simTime) {
    for (const g of gusts) g.age += dt;
    while (gusts.length && gusts[0].age > GUST_LIFE) gusts.shift();

    let sum = 0;
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i];
      // never negative — a stem does not lean into the wind
      let lean = sway * b.stiff * (
        0.55
        + 0.45 * Math.sin(simTime * 1.05 + b.phase)
        + 0.22 * Math.sin(simTime * 2.31 + b.phase * 1.7)
      );
      for (const g of gusts) {
        const front = Math.hypot(b.x - g.x, b.z - g.z) - GUST_SPEED * g.age;
        const env = Math.exp(-(front * front) / (GUST_WIDTH * GUST_WIDTH));
        lean += env * (1 - g.age / GUST_LIFE) * g.amp * b.stiff;
      }
      sum += lean;
      _qLean.setFromAxisAngle(leanAxis, lean);
      _q.multiplyQuaternions(_qLean, b.rest);       // yaw and rest first, then lean in world space
      _p.set(b.x, b.y, b.z);
      _s.set(b.sc, b.sc * b.tall, b.sc);
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    meanLean = blooms.length ? sum / blooms.length : 0;
  }

  update(0, 0);           // plant them, so the first frame is not a heap at the origin
  mesh.computeBoundingSphere();

  return {
    mesh,
    get blooms() { return mesh.count; },
    points: pts.map((p) => ({ x: p.x, z: p.z })),
    // a breath crosses the field from here, outward
    gustAt(x, z, amp = 0.42) {
      gusts.push({ x, z, age: 0, amp });
      if (gusts.length > MAX_GUSTS) gusts.shift();
      return gusts.length;
    },
    gustCount() { return gusts.length; },
    lean() { return meanLean; },
    update,
  };
}
