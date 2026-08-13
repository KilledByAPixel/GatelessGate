import * as THREE from '../../lib/three.module.js';
import { hash1, noise2 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { groundHeight } from './ground.js';
import { wash, WASH } from '../palette.js';
import {
  breezeState, breezeFalloff, makePokeSpring, pokeSpringStep, GRASS_POKE_RADIUS,
} from './breeze.js';

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
//
// THEY ALSO ANSWER THE MEADOW'S WIND AND THE READER'S HAND, because a bloom
// standing dead still in grass that is visibly leaning reads as a plastic
// flower stuck in a moving field (Frank: "make the flowers also move with the
// wind and when the mouse is moved over them like the grass does"). Both are
// the GRASS's models, re-read on the CPU rather than reinvented:
//
//   THE WIND is the same drifting gust noise tuftfield.js samples in GLSL —
//   the noise field slides downwind, so a gust arrives, crosses and passes,
//   and blooms in the same patch of meadow lean with the blades around them
//   instead of on a private clock. `wind` / `gustScale` / `gustSpeed` are the
//   same three numbers the grass takes and the same three the workbench's
//   sliders read, so a case's pinned weather reaches the flowers too (the
//   panel writes them through mesh.userData.wind, exactly as it writes the
//   grass's uniforms). The noise here is util/noise.js rather than the
//   shader's own hash, so a bloom and the blade beside it are not bit-for-bit
//   in step — same weather, not the same random stream, which is what you
//   want anyway.
//
//   THE POINTER is breeze.js, the module the grass fields already share: one
//   damped spring per field driven by the smoothed drag vector, and a
//   smoothstep falloff around the stroke. A stationary pointer does nothing —
//   that is breeze.js's own dead zone, not a rule this file invents — so
//   "moved over them" means a stroke, the same gesture the grass answers.
//
// EVERY LEAN IS ONE BEND VECTOR. Nod, gust front, wind and pointer all add
// into a single world-XZ vector; its length is the angle and its perpendicular
// is the axis. That is what lets the pointer push a bloom ACROSS the wind
// instead of only harder along it — the previous code leaned about one fixed
// axis, which could only ever say "more" or "less".

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

// How much of the grass's own wind angle a stem takes. The grass runs
// thetaWind = wind * (0.12 + 0.40 * gust) * stiff and bends most of the way
// over at the shipped slider (1.5); a flower is a stiff stalk with a head on
// it, not a blade, so it takes a fraction of that — enough that the meadow and
// the blooms are visibly answering the same gust, not so much that the field
// reads as a lawn with petals. At wind 1.5 and a middling gust this is ~6°,
// riding on top of the bloom's own nod.
const WIND_LEAN = 0.22;
// The pointer's push, in the same units. Below the grass's own gain: a bloom
// is heavier than a blade, and a stem that folded flat under the cursor read
// as knocked over rather than brushed.
const POKE_LEAN = 0.55;

// One bloom, in TWO geometries: a hair-thin stem and a small faceted head
// sitting on top of it. They are separate because head and stalk never share a
// tone — "by default the petals should be whitish, kind of the same colour
// family as the ground, and the stalk the same kind of colour as the grass"
// (Frank) — and when a case DOES put its accent on the heads (pass `color`),
// the seal-glow emissive on accent materials (toon.js) could not be split
// per-vertex inside one mesh anyway. The two instanced meshes share every
// instance matrix, so they stay one bloom in motion.
// The stem's base is at the local origin, so an instance plants exactly on
// the terrain and leans from its own foot.
function stemGeometry() {
  const stem = new THREE.ConeGeometry(0.008, 0.185, 3, 1, true);  // open: no base cap
  stem.translate(0, 0.0925, 0);
  return stem;
}

function headGeometry(seed = 1) {
  const parts = [];
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
  color = wash(0.10),    // whitish petals, a shade off the paper — pale enough to
                         // stay OUT of the seal set, so default blooms never glow.
                         // A case that owns the meadow as its seal overrides this.
  stemColor = WASH.dry,  // the stalks read as more grass, not inked wire
  scale = 1,             // multiplies every instance's base size (k24 runs ~2)
  keepout = [],
  along = null,          // [{x, z}] — cluster into drifts around these instead
  spread = 2.2,          // how far from a centre a bloom may stray
  windDir = [1, 0.35],   // matches the meadow's default, so they lean together
  sway = 0.17,           // the bloom's OWN nod, radians of lean — never zero, so a
                         // windless field is still a meadow rather than a bed of nails
  // The meadow's weather, in the SAME three numbers the grass field takes and
  // the workbench's "Grass wind" / "Gust patch" / "Gust drift" sliders read.
  // wind: 0 leaves only the nod above, which is exactly how this field
  // behaved before it answered the wind at all.
  wind = 1,
  gustScale = 0.055,
  gustSpeed = 2.4,
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

  // the HEADS carry the petal tone; the mesh carrying them stays the handle's `mesh`
  const mesh = new THREE.InstancedMesh(
    headGeometry(seed), toonMaterial({ color, flat: true }), Math.max(1, pts.length));
  mesh.count = pts.length;
  mesh.name = 'wildflowers';
  mesh.castShadow = false;

  // the STEMS ride as a child of the heads mesh — one scene.add carries both —
  // in the grass tone, one extra draw call for the whole field
  const stems = new THREE.InstancedMesh(
    stemGeometry(), toonMaterial({ color: stemColor, flat: true }), Math.max(1, pts.length));
  stems.count = pts.length;
  stems.name = 'wildflower-stems';
  stems.castShadow = false;
  mesh.add(stems);

  // The wind, live: one mutable record so the workbench can reach a standing
  // field the way it reaches the grass's uniforms (mesh.userData.wind, below),
  // and so a case can retune it without rebuilding the meadow. dirX/dirZ are
  // kept normalised here, once, rather than at 200 blooms a frame.
  const wd = new THREE.Vector2(windDir[0], windDir[1]);
  if (wd.lengthSq() < 1e-9) wd.set(1, 0);
  wd.normalize();
  const weather = { wind, gustScale, gustSpeed, dirX: wd.x, dirZ: wd.y };
  mesh.userData.wind = weather;   // so the debug panel can reach it live

  // The pointer's response spring — one per field, integrated once a tick,
  // exactly as the grass field does it. Its state IS the push: length is how
  // hard, direction is which way, and it carries its own sign through zero so
  // a released stroke swings back rather than fading.
  const poke = makePokeSpring();

  // The axis a bend of (bx, bz) turns about: perpendicular to it in the ground
  // plane. Rotating +y about (bz, 0, -bx) tips the stem TOWARD (bx, 0, bz),
  // which is the whole convention — every contribution below is written as a
  // world-space push and this is what turns the sum into a lean.
  const _bendAxis = new THREE.Vector3();

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
    const sc = (big ? 1.05 + 0.35 * pt.u : 0.52 + 0.30 * pt.u) * scale;

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

    // The pointer, once for the whole field rather than per bloom: integrate
    // the spring toward the smoothed drag vector, then read its length and
    // direction back out. Zero strength costs one spring step and nothing
    // else — an untouched field is bit-identical to one built before this.
    const b0 = breezeState();
    pokeSpringStep(poke, b0.strength * b0.dirX, b0.strength * b0.dirZ, dt || 0);
    const pokeAmt = Math.hypot(poke.px, poke.pz);
    const pokeDirX = pokeAmt > 1e-6 ? poke.px / pokeAmt : 0;
    const pokeDirZ = pokeAmt > 1e-6 ? poke.pz / pokeAmt : 0;

    // the whole noise field slides downwind, so gusts arrive and pass — the
    // same flow tuftfield.js's shader builds, in the same units
    const drift = simTime * weather.gustSpeed * weather.gustScale;

    let sum = 0;
    for (let i = 0; i < blooms.length; i++) {
      const b = blooms[i];
      // ---- everything that pushes ALONG the wind ------------------------
      // never negative — a stem does not lean into the wind
      let along = sway * b.stiff * (
        0.55
        + 0.45 * Math.sin(simTime * 1.05 + b.phase)
        + 0.22 * Math.sin(simTime * 2.31 + b.phase * 1.7)
      );
      for (const g of gusts) {
        const front = Math.hypot(b.x - g.x, b.z - g.z) - GUST_SPEED * g.age;
        const env = Math.exp(-(front * front) / (GUST_WIDTH * GUST_WIDTH));
        along += env * (1 - g.age / GUST_LIFE) * g.amp * b.stiff;
      }
      if (weather.wind > 0) {
        const fx = b.x * weather.gustScale - weather.dirX * drift;
        const fz = b.z * weather.gustScale - weather.dirZ * drift;
        const gust = noise2(fx, fz, seed) * 0.70
          + noise2(fx * 2.7 + 19.3, fz * 2.7 + 19.3, seed + 7) * 0.30;
        along += weather.wind * WIND_LEAN * (0.12 + 0.40 * gust) * b.stiff;
      }
      let bx = along * weather.dirX;
      let bz = along * weather.dirZ;

      // ---- and the pointer, which pushes whichever way the hand went ----
      if (pokeAmt > 1e-6) {
        const dx = b.x - b0.x, dz = b.z - b0.z;
        const dist = Math.hypot(dx, dz);
        const fall = breezeFalloff(dist, GRASS_POKE_RADIUS);
        if (fall > 0) {
          // mostly along the stroke, with a small radial share for volume —
          // the same 0.18 mix the grass shader uses, so a stroke through
          // grass and blooms together reads as one gesture
          const rx = dist > 1e-4 ? dx / dist : 0;
          const rz = dist > 1e-4 ? dz / dist : 0;
          const push = pokeAmt * fall * b.stiff * POKE_LEAN;
          bx += (pokeDirX + rx * 0.18) * push;
          bz += (pokeDirZ + rz * 0.18) * push;
        }
      }

      // ---- one bend vector -> one axis and one angle ---------------------
      const lean = Math.hypot(bx, bz);
      sum += lean;
      if (lean > 1e-6) {
        _bendAxis.set(bz / lean, 0, -bx / lean);
        _qLean.setFromAxisAngle(_bendAxis, lean);
      } else {
        _qLean.identity();
      }
      _q.multiplyQuaternions(_qLean, b.rest);       // yaw and rest first, then lean in world space
      _p.set(b.x, b.y, b.z);
      _s.set(b.sc, b.sc * b.tall, b.sc);
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m4);
      stems.setMatrixAt(i, _m4);      // the same transform: one bloom, two draws
    }
    mesh.instanceMatrix.needsUpdate = true;
    stems.instanceMatrix.needsUpdate = true;
    meanLean = blooms.length ? sum / blooms.length : 0;
  }

  update(0, 0);           // plant them, so the first frame is not a heap at the origin
  mesh.computeBoundingSphere();
  stems.computeBoundingSphere();

  return {
    mesh,
    get blooms() { return mesh.count; },
    points: pts.map((p) => ({ x: p.x, z: p.z })),
    // the same three setters the grass field exposes, taking the same numbers
    setWind(w) { weather.wind = w; },
    setWindDir(x, z) {
      const m = Math.hypot(x, z);
      if (m > 1e-9) { weather.dirX = x / m; weather.dirZ = z / m; }
    },
    setGust(scale, speed) {
      if (scale !== undefined) weather.gustScale = scale;
      if (speed !== undefined) weather.gustSpeed = speed;
    },
    wind() { return weather.wind; },
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
