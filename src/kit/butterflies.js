import * as THREE from '../../lib/three.module.js';
import { hash1, noise1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT } from '../palette.js';

// A handful of butterflies playing over a meadow. Each one is two small quads
// hinged at the body line — nothing else; at any case's camera distance a
// butterfly IS its wings — flapping on a seeded beat and fluttering along a
// seeded wander path. "Simple: two quads basically stuck together, flapping
// and flying, playing around" (Frank).
//
// Like birds.js, the whole flight is a closed form over the simTime handed to
// update(): a butterfly's position is a function of (simTime, seed), nothing is
// integrated or stored, so the flutter is identical every run and replays
// exactly. flit() layers a decaying excitement on top — touched, they lift and
// beat quicker, then settle.
//
// Draw calls: two meshes per butterfly, sharing ONE material. Six butterflies
// is twelve draws; they take no outline (an inverted hull on a paper-thin quad
// is a blot).

const TAU_E = 2.2;                 // e-folding of a flit, seconds
const HEAD_EPS = 0.12;             // seconds between the two path samples a heading needs
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// One wing: a quad (two triangles) in the local xz plane, hinged at the body
// line x = 0 so rotation.z alone is the flap. Forewing corner leads, hindwing
// corner trails — enough asymmetry that the silhouette reads butterfly rather
// than bow-tie, and nothing more.
function wingGeometry(s, side) {
  const g = new THREE.BufferGeometry();
  const t = side;
  const v = new Float32Array([
    // hindwing triangle
    0, 0, 0.10 * s,               // root, at the head end
    0, 0, -0.11 * s,              // root, at the tail end
    0.30 * s * t, 0, -0.16 * s,   // outer trailing corner
    // forewing triangle
    0, 0, 0.10 * s,
    0.30 * s * t, 0, -0.16 * s,
    0.36 * s * t, 0, 0.10 * s,    // outer leading corner — the long forewing
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function makeButterflies({
  count = 6,
  seed = 19,
  size = 0.34,
  color = ACCENT,                  // red ones — the accent family glows (toon.js)
  center = [0, 0],
  radius = 3.2,                    // how far the wander may stray from the centre
  height = [0.7, 2.4],             // the band they play in, above the ground
  rate = 0.16,                     // wander speed — a flutter, not a bee-line
} = {}) {
  const g = new THREE.Group();
  g.name = 'butterflies';

  const mat = toonMaterial({ color, flat: true, side: THREE.DoubleSide });
  const [yLo, yHi] = height;

  const flock = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    b.name = 'butterfly';
    const wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wingGeometry(size, side), mat);
      w.name = 'butterfly-wing';
      w.userData.noOutline = true;
      w.castShadow = false;
      b.add(w);
      wings.push({ mesh: w, side });
    }
    g.add(b);

    const h = (n) => hash1(i * 13 + n, seed);
    flock.push({
      node: b,
      wings,
      // each butterfly owns a lane of the noise field and a beat of its own
      ph: h(1) * 64,                       // where in the field its path starts
      chan: seed + i * 3,                  // its private noise channels
      beat: 7.5 + h(2) * 4.5,              // wingbeats per second-ish, seeded
      beatPh: h(3) * Math.PI * 2,
      yBias: 0.25 + h(4) * 0.5,            // some play low, some high
      roll: (h(5) - 0.5) * 0.5,            // a lazy constant bank, each its own
    });
  }

  let clock = 0;
  const bursts = [];

  function energy() {
    let e = 0;
    for (const t0 of bursts) if (clock >= t0) e += Math.exp(-(clock - t0) / TAU_E);
    return clamp(e, 0, 2);
  }

  // the wander path, a pure function of time — sampled twice per frame so the
  // butterfly can face the way it is going
  function pathAt(b, t, out) {
    out.x = center[0] + (noise1(t * rate + b.ph, b.chan + 1) - 0.5) * 2 * radius;
    out.z = center[1] + (noise1(t * rate + b.ph + 17, b.chan + 2) - 0.5) * 2 * radius;
    const u = clamp(noise1(t * (rate * 1.6) + b.ph + 39, b.chan + 3) * 0.6 + b.yBias * 0.7, 0, 1);
    out.y = yLo + (yHi - yLo) * u;
    return out;
  }

  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();

  function pose() {
    const E = energy();
    for (const b of flock) {
      pathAt(b, clock, _p);
      pathAt(b, clock - HEAD_EPS, _q);

      // the flap: a deep stroke, wings sweeping from near-flat up toward a
      // high V — plus the bob it causes; a butterfly's body rides its own beat
      const beat = b.beat * (1 + E * 0.6);
      const stroke = Math.sin(clock * beat * Math.PI * 2 + b.beatPh);
      const flap = 0.55 + 0.62 * stroke;             // -0.07 .. 1.17 rad

      b.node.position.set(
        _p.x,
        _p.y + 0.05 * stroke + E * 0.5,              // flit: they lift when stirred
        _p.z,
      );
      b.node.rotation.set(0.12, Math.atan2(_p.x - _q.x, _p.z - _q.z), b.roll);
      for (const { mesh, side } of b.wings) mesh.rotation.z = side * flap;
    }
  }
  pose();

  return {
    group: g,
    // something stirred them: they lift and beat quicker, then settle back to play
    flit() {
      bursts.push(clock);
      if (bursts.length > 6) bursts.shift();
      pose();
    },
    energy() { return energy(); },
    count() { return flock.length; },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
