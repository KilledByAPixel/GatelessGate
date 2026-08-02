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

// One wing, in the local xz plane, hinged at the body line x = 0 so
// rotation.z alone is the flap.
//
// A REAL WING OUTLINE, not a quad. The first pass was two triangles making a
// swept rectangle, which reads as a bow-tie once you can see it at all
// (Frank: "could we make the butterfly wings a little more shaped like a
// butterfly wing?"). This is the actual silhouette in the fewest points that
// can carry it: a long forewing sweeping up and out to a squared tip, a NOTCH
// where the two wings meet, and a rounder hindwing lobe trailing behind it.
// Eight boundary points, fanned from the root — six triangles, still nothing.
const WING = [
  [0.00, 0.11],    // root, at the head end
  [0.22, 0.20],    // forewing leading edge, sweeping up and out
  [0.38, 0.15],    // the squared forewing tip
  [0.42, 0.01],    // and its outer trailing corner
  [0.27, -0.05],   // THE NOTCH between forewing and hindwing
  [0.32, -0.17],   // the hindwing lobe, rounder and further back
  [0.17, -0.24],   // its trailing point
  [0.00, -0.13],   // root, at the tail end
];
function wingGeometry(s, side) {
  const g = new THREE.BufferGeometry();
  const v = [];
  // fan from the root's head-end corner: the outline is star-shaped about it,
  // so a fan triangulates the whole wing without an ear-clipping pass
  const [ax, az] = WING[0];
  for (let i = 1; i < WING.length - 1; i++) {
    const [bx, bz] = WING[i];
    const [cx, cz] = WING[i + 1];
    v.push(ax * s * side, 0, az * s,
      bx * s * side, 0, bz * s,
      cx * s * side, 0, cz * s);
  }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
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
  // How high a landed one sits. GRASS-TIP, not ground: grassfield's blade is
  // 0.34 tall, and at 0.16 a butterfly settled halfway down inside the field and
  // read as landing in the dirt between the blades (Frank: "put them a little
  // bit above the ground — or have them land on a grass puff, since there's
  // grass all over"). At the tip height it perches ON the meadow wherever it
  // comes down, which is the same effect without picking a blade to sit on.
  perch = 0.32,
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
      // Wingbeats per second-ish, seeded. HALVED from 7.5-12 (Frank: "the wings
      // are flapping a bit fast — about half as fast"): a real butterfly does
      // beat this quickly, but at diorama scale the wings blur into a flicker,
      // and the whole point of the piece is that you can see the shape opening
      // and closing.
      beat: 3.75 + h(2) * 2.25,
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

  // A LANDED BUTTERFLY IS LANDED. The wander is a function of time, so while one
  // was perched its x/z kept drifting and it slid across the grass with its
  // wings shut (Frank: "they still kinda slide along the ground — they need to
  // actually stop in place, like they've landed on top of one of the grass").
  //
  // Fixed by stopping the PATH'S OWN CLOCK for the duration of the perch, rather
  // than by clamping the position: subtract every second this butterfly has
  // spent on the ground, completed rounds included. dt/dt is 0 while it sits, so
  // it holds its spot exactly; it is monotonic and continuous everywhere else,
  // so there is no jump on take-off and it resumes precisely where it stopped.
  // Still a pure function of t, which is what keeps the whole flight replayable.
  function pathTime(b, t) {
    const w = t / b.cyc + b.cycPh;
    const rounds = Math.floor(w);
    const u = w - rounds;
    const perched = rounds * b.down + clamp(u - 0.5, 0, b.down);   // downStart = 0.5
    return t - perched * b.cyc;
  }

  // where it is over the ground, from the path's clock — its own local drift
  // around its own home
  function xzAt(b, tp, out) {
    const wander = radius * 0.42;    // the local excursion, around home
    out.x = b.home[0] + (noise1(tp * rate + b.ph, b.chan + 1) - 0.5) * 2 * wander;
    out.z = b.home[1] + (noise1(tp * rate + b.ph + 17, b.chan + 2) - 0.5) * 2 * wander;
    return out;
  }

  // the whole path: x/z on the path clock, height on the ROUND's clock, since
  // the descent and the take-off are the round and must keep running while the
  // wander is stopped.
  function pathAt(b, t, out) {
    const tp = pathTime(b, t);
    xzAt(b, tp, out);
    const u = clamp(noise1(tp * (rate * 1.6) + b.ph + 39, b.chan + 3) * 0.6 + b.yBias * 0.7, 0, 1);
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
      // The heading is sampled back along the PATH clock, not wall time: while
      // it is perched those two are the same point, atan2(0, 0) collapses to
      // zero, and the butterfly would spin to face north the moment it landed.
      // Stepping back in path time gives the heading it came in on and holds it.
      xzAt(b, pathTime(b, clock) - HEAD_EPS, _q);

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
      // PERCHED, the wings stop BEATING but they do not stop moving: they stand
      // folded up together and open and close very slowly, about a sixth of a
      // radian either way once every ten seconds or so (Frank: "when they're
      // stationary they can still move their wings a little — really slowly, so
      // they're not fully not moving"). Each one breathes on its own phase, so a
      // row of perched butterflies never pulses in unison.
      const rest = 1.02 + 0.17 * Math.sin(clock * 0.55 + b.beatPh);
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
