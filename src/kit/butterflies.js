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
  perch = 0.16,                    // how high a landed one sits — grass-top, not ground
  groundFn = null,                 // (x, z) => terrain height; flat ground without one
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
    // THEY SPREAD OUT. The wander used to be one noise field read straight
    // into ±radius, and noise rarely reaches its own extremes, so the whole
    // flock hovered near the centre (Frank: "I want them to be more around —
    // they're just kinda centred"). Each one now owns a HOME somewhere in the
    // disc (sqrt for even area) and only wanders locally around it.
    const homeA = h(6) * Math.PI * 2;
    const homeR = Math.sqrt(h(7)) * radius * 0.85;
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
      home: [center[0] + Math.cos(homeA) * homeR, center[1] + Math.sin(homeA) * homeR],
      // THE ROUND: fly a while, settle in the grass a while, go again. One
      // seeded cycle per butterfly, so nobody lands in unison and the whole
      // thing stays a pure function of simTime.
      cyc: 11 + h(8) * 9,                  // seconds for one fly-land-fly round
      cycPh: h(9),                         // where in that round it starts
      down: 0.24 + h(10) * 0.16,           // the share of the round spent perched
    });
  }

  let clock = 0;
  const bursts = [];

  function energy() {
    let e = 0;
    for (const t0 of bursts) if (clock >= t0) e += Math.exp(-(clock - t0) / TAU_E);
    return clamp(e, 0, 2);
  }

  const smooth = (v) => { const c = clamp(v, 0, 1); return c * c * (3 - 2 * c); };

  // WHERE IT IS IN ITS ROUND, 0..1 — and how airborne that makes it.
  // `lift` is 1 in flight, 0 perched, easing smoothly through the descent and
  // the take-off, so a butterfly settles into the grass rather than dropping
  // into it. Pure in t, like everything else here.
  const EASE = 0.13;                 // share of the round spent going down / up
  function liftAt(b, t) {
    const u = (t / b.cyc + b.cycPh) % 1;
    const downStart = 0.5;           // it flies the first half of its round
    const downEnd = downStart + b.down;
    if (u < downStart - EASE) return 1;
    if (u < downStart) return smooth(1 - (u - (downStart - EASE)) / EASE);
    if (u < downEnd) return 0;
    if (u < downEnd + EASE) return smooth((u - downEnd) / EASE);
    return 1;
  }

  // the wander path, a pure function of time — sampled twice per frame so the
  // butterfly can face the way it is going. x/z drift around its OWN home;
  // the height rides its round, from the perch in the grass up into the band.
  function pathAt(b, t, out) {
    const wander = radius * 0.42;    // the local excursion, around home
    out.x = b.home[0] + (noise1(t * rate + b.ph, b.chan + 1) - 0.5) * 2 * wander;
    out.z = b.home[1] + (noise1(t * rate + b.ph + 17, b.chan + 2) - 0.5) * 2 * wander;
    const u = clamp(noise1(t * (rate * 1.6) + b.ph + 39, b.chan + 3) * 0.6 + b.yBias * 0.7, 0, 1);
    const g = groundFn ? groundFn(out.x, out.z) : 0;
    const air = g + yLo + (yHi - yLo) * u;
    const sat = g + perch;
    out.y = sat + (air - sat) * liftAt(b, t);
    return out;
  }

  const _p = new THREE.Vector3();
  const _q = new THREE.Vector3();

  function pose() {
    const E = energy();
    for (const b of flock) {
      pathAt(b, clock, _p);
      pathAt(b, clock - HEAD_EPS, _q);

      // THE WINGS ARE A HINGE, AND ONLY A HINGE. The body used to ride the
      // stroke (position.y += 0.05·stroke), which at ten beats a second read
      // as the whole insect juddering up and down rather than flapping
      // (Frank: "it looks like they're just rapidly moving up and down when
      // they flap... their centre of mass won't be affected"). The flap now
      // lives entirely in the wings' own rotation.z about the body line; the
      // body goes where the path says and nowhere else.
      const lift = liftAt(b, clock);
      const beat = b.beat * (1 + E * 0.6);
      const stroke = Math.sin(clock * beat * Math.PI * 2 + b.beatPh);
      // PERCHED, the wings stop beating and stand folded up together, with a
      // slow breath in them — the pause that makes the flight read as flight.
      const rest = 1.02 + 0.05 * Math.sin(clock * 0.9 + b.beatPh);
      const flying = 0.55 + 0.62 * stroke;           // -0.07 .. 1.17 rad
      const flap = rest + (flying - rest) * lift;

      b.node.position.set(_p.x, _p.y + E * 0.5 * lift, _p.z);   // flit: they lift when stirred
      // a landed butterfly sits level and keeps the heading it came in on
      b.node.rotation.set(0.12 * lift, Math.atan2(_p.x - _q.x, _p.z - _q.z), b.roll * lift);
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
    // how airborne each one is right now, 1 flying .. 0 perched in the grass
    lift() { return flock.map((b) => liftAt(b, clock)); },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
