import * as THREE from '../../lib/three.module.js';
import { hash1, noise1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { ACCENT } from '../palette.js';
import { clamp } from '../util/math.js';

// A handful of butterflies playing over a meadow. Each one is two small quads
// hinged at the body line — nothing else; at any case's camera distance a
// butterfly IS its wings — flapping on a seeded beat and fluttering along a
// seeded wander path. Simple: two quads stuck together, flapping and flying.
//
// Like birds.js, the whole flight is a closed form over the simTime handed to
// update(): a butterfly's position is a function of (simTime, seed), nothing is
// integrated or stored, so the flutter is identical every run and replays
// exactly. flit() layers a decaying excitement on top — touched, they lift and
// beat quicker, then settle.
//
// Draw calls: two meshes per butterfly, sharing ONE material. Six butterflies
// is twelve draws.

// E-folding of a flit, in seconds. Lengthened with the startle envelope: the
// excitement drives both the wingbeat and the path speed, and at 2.2 it was
// three-quarters gone before a butterfly had finished climbing out of the grass
// — up, and then cruising again while still plainly in the air.
const TAU_E = 3.4;
const HEAD_EPS = 0.12;             // seconds between the two path samples a heading needs

// One wing, in the local xz plane, hinged at the body line x = 0 so
// rotation.z alone is the flap.
//
// A REAL WING OUTLINE, not a quad. The first pass was two triangles making a
// swept rectangle, which reads as a bow-tie once you can see it at all
// once you can see it at all. This is the actual silhouette in the fewest points that
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
  color = ACCENT,                  // red ones — the accent family glows (material.js)
  center = [0, 0],
  radius = 3.2,                    // how far the wander may stray from the centre
  height = [0.7, 2.4],             // the band they play in, above the ground
  rate = 0.16,                     // wander speed — a flutter, not a bee-line
  // How high a landed one sits. GRASS-TIP, not ground: grassfield's blade is
  // 0.34 tall, and at 0.16 a butterfly settled halfway down inside the field and
  // read as landing in the dirt between the blades. At the tip height it
  // perches ON the meadow wherever it
  // comes down, which is the same effect without picking a blade to sit on.
  perch = 0.32,
  // Whether they ever settle. The fly-land-fly round is most of what makes
  // these read as BUTTERFLIES; k21's flies pass false — flies over dung
  // circle without resting, and a landed one read badly there. With land off, perch and
  // the round's timings are simply never consulted.
  land = true,
  groundFn = null,                 // (x, z) => terrain height; flat ground without one
} = {}) {
  const g = new THREE.Group();
  g.name = 'butterflies';

  const mat = washMaterial({ color, flat: true, side: THREE.DoubleSide });
  const [yLo, yHi] = height;

  const flock = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    b.name = 'butterfly';
    const wings = [];
    for (const side of [-1, 1]) {
      const w = new THREE.Mesh(wingGeometry(size, side), mat);
      w.name = 'butterfly-wing';
      w.castShadow = false;
      b.add(w);
      wings.push({ mesh: w, side });
    }
    g.add(b);

    const h = (n) => hash1(i * 13 + n, seed);
    // THEY SPREAD OUT. The wander used to be one noise field read straight
    // into ±radius, and noise rarely reaches its own extremes, so the whole
    // flock hovered near the centre rather than spreading over the disc. Each
    // one now owns a HOME somewhere in the
    // disc (sqrt for even area) and only wanders locally around it.
    const homeA = h(6) * Math.PI * 2;
    const homeR = Math.sqrt(h(7)) * radius * 0.85;
    flock.push({
      node: b,
      wings,
      // each butterfly owns a lane of the noise field and a beat of its own
      ph: h(1) * 64,                       // where in the field its path starts
      chan: seed + i * 3,                  // its private noise channels
      // Wingbeats per second-ish, seeded, and HALVED from what a real butterfly
      // does: it genuinely beats that quickly, but at diorama scale the wings
      // blur into a flicker,
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
      // the share of the round spent perched — zero when landing is off,
      // which liftAt reads as "always airborne"
      down: land ? 0.24 + h(10) * 0.16 : 0,
      scared: -99,          // WALL time it was last startled — see startleAt
      wander: 0,            // extra path-seconds this one has been hurried along
    });
  }

  let clock = 0;
  const bursts = [];
  // EXCITEMENT IS SPEED. What a scare should look like is a flock that gets on
  // with what it was already doing, faster — "if they are flying, just move a
  // bit faster than normal... move around more... like they would normally fly,
  // but just faster in that direction. So the flight is not redirected
  // and nothing is thrown anywhere: the PATH CLOCK simply runs ahead while the
  // excitement lasts, which carries every butterfly further along the wander it
  // was already on, in the direction it was already going.
  //
  // This is the one piece of state in this file that is integrated rather than
  // read from simTime, so the strict "pure function of t" claim in the header
  // now has this exception. It is still deterministic — the same taps over the
  // same steps give the same flight — and it is monotonic and continuous, so
  // the path never jumps; it only ever gets ahead of itself.
  // Extra path-seconds per second at full excitement. A modest multiplier
  // bought only about 1.3x the ground covered — inside the noise of a wander,
  // and invisible. The wander is a noise field sampled at
  // `rate`, so running its clock faster does not scale distance linearly; it
  // takes a much bigger multiplier before the flock reads as hurrying.
  const BOOST_RATE = 9.5;
  // The wingbeat's own accumulator. It has to be separate from the per-butterfly
  // wander (which is gated on being airborne — a perched one must not slide
  // through the grass) because wings beat whether or not the insect is going
  // anywhere. BEAT_SHARE buys about a third again at full excitement rather
  // than the double it had: doubling was more than the eye can follow at this
  // scale — faster movement with less frantic flapping reads better — and the
  // movement is where the excitement should show.
  const BEAT_SHARE = 0.35;
  let beatBoost = 0;

// AN ALARM HAS AN ATTACK. This was a bare decaying exponential, and exp(-0) is
// 1 — so on the frame a burst landed the energy went from 0 to 1 in one step,
// and every term that reads it directly went with it. The birds' climb is
// `E * 2.2`, so a scatter teleported the whole flock 2.2 units into the air
// between two frames; the wing amplitude snapped open the same way. Giving the
// envelope a short rise fixes all of them at once, which is the right place for
// it — the alternative is remembering to smooth every reader of E forever.
const ATTACK = 0.30;               // seconds for an alarm to come up
  function energy() {
    let e = 0;
    for (const t0 of bursts) {
      const u = clock - t0;
      if (u < 0) continue;
      e += (1 - Math.exp(-u / ATTACK)) * Math.exp(-u / TAU_E);
    }
    return clamp(e, 0, 2);
  }

  const smooth = (v) => { const c = clamp(v, 0, 1); return c * c * (3 - 2 * c); };

  // WHERE IT IS IN ITS ROUND, 0..1 — and how airborne that makes it.
  // `lift` is 1 in flight, 0 perched, easing smoothly through the descent and
  // the take-off, so a butterfly settles into the grass rather than dropping
  // into it. Pure in t, like everything else here.
  const EASE = 0.13;                 // share of the round spent going down / up

  // A SCARE ENDS THE PERCH. That is all it does to the height — it does not
  // throw anything anywhere.
  //
  // flit() used to raise the flock by `E * 0.5 * lift`, multiplied by the very
  // term that is ZERO while a butterfly sits in the grass, so the ones a reader
  // would most expect to startle were the only ones that could not move at all.
  // The first fix over-corrected into the opposite failure: forcing lift to 1
  // shot them up their whole flying band in a fraction of a second, plus a
  // sideways dart, and the flock read as being launched rather than as simply
  // resuming flight.
  //
  // So the envelope is now paced to the round's OWN take-off — EASE of a cycle,
  // the same climb it makes when it leaves a perch unprompted — and there is no
  // dart at all. A scared butterfly simply gets up, on the schedule's own
  // terms, and everything else the scare does is speed (see `boost` below).
  // TIMED ON THE WALL CLOCK, NOT THE PATH CLOCK — this is the bug that made a
  // scare look broken. `scared` was stamped in path time and compared against
  // the BOOSTED clock, and boost is exactly what a scare turns on: the flock
  // flew faster, which ran the path clock ahead, which aged the startle
  // envelope faster, which cancelled the scare early. The harder they were
  // startled the sooner they gave up — they went up and came straight back
  // down, which read as a glitch.
  //
  // It also never reached full height, for a second reason: the rise ramped
  // over b.cyc * EASE (1.4-2.6s) while the decay was already falling from the
  // first frame, so the MIN of the two peaked around 0.5 and came straight back
  // down. The envelope holds at 1 now — up, a couple of seconds of actually
  // flying around, then a slow release into whatever the round says next.
  const STARTLE_UP = 1.1;            // seconds to climb out of the grass
  const STARTLE_HOLD = 2.6;          // and to stay up there, flying
  const STARTLE_OUT = 2.2;           // before the round takes over again
  const STARTLE = STARTLE_UP + STARTLE_HOLD + STARTLE_OUT;
  function startleAt(b) {
    const u = clock - b.scared;
    if (!(u >= 0) || u >= STARTLE) return 0;
    if (u < STARTLE_UP) return smooth(u / STARTLE_UP);
    if (u < STARTLE_UP + STARTLE_HOLD) return 1;
    return 1 - smooth((u - STARTLE_UP - STARTLE_HOLD) / STARTLE_OUT);
  }

  function liftAt(b, t) {
    const scared = startleAt(b);
    if (!b.down) return 1;           // land:false — always airborne, no ease dip
    return Math.max(scared, scheduledLift(b, t));
  }
  function scheduledLift(b, t) {
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
  // wings shut, instead of stopping in place on top of the grass where it
  // came down.
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

  // The whole path: x/z on the path clock, height on the ROUND's clock, since
  // the descent and the take-off are the round and must keep running while the
  // wander is stopped.
  //
  // THE HEIGHT BAND IS NOT BOOSTED, and that took a measurement to find. The
  // excitement runs the path clock ahead so a stirred flock covers more ground
  // — but the altitude a flying butterfly picks is another noise channel read
  // off that same clock, so speeding it up sent them racing up and down their
  // whole 0.7-2.4 band as well: a startled one climbed at 10.5 units a second,
  // which is not "flying faster", it is thrashing. ht is the honest clock for
  // that channel. Horizontal speed is the response; altitude keeps its own
  // unhurried pace, which is what a butterfly actually looks like.
  // THE BOOST REACHES THE WANDER AND NOTHING ELSE. It began as one offset added
  // to the whole path clock, which is wrong twice over and both were measured:
  //
  //   - the HEIGHT is another noise channel on that clock, so a stirred flock
  //     raced up and down its whole 0.7-2.4 band;
  //   - the ROUND — fly a while, settle a while — is on that clock too, so the
  //     take-off ease (0.13 of an 11-20s cycle, normally 1.4-2.6 seconds) ran in
  //     about a fifth of a second. A perched butterfly did not climb out of the
  //     grass, it was fired out of it, at 10 units a second.
  //
  // So the round, the height and the startle are all on the WALL clock, exactly
  // as they were before any of this existed, and the only thing the excitement
  // touches is how far along its own wander each butterfly has got. b.wander is
  // that offset, integrated per butterfly in update() and only while it is
  // actually flying — a scare cannot slide one that is sitting in the grass.
  function pathAt(b, t, out) {
    xzAt(b, pathTime(b, t) + b.wander, out);
    const u = clamp(noise1(pathTime(b, t) * (rate * 1.6) + b.ph + 39, b.chan + 3) * 0.6 + b.yBias * 0.7, 0, 1);
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
      xzAt(b, pathTime(b, clock) + b.wander - HEAD_EPS, _q);

      // THE WINGS ARE A HINGE, AND ONLY A HINGE. The body used to ride the
      // stroke (position.y += 0.05·stroke), which at ten beats a second read
      // as the whole insect juddering up and down rather than flapping
      // rather than flapping — a real butterfly's centre of mass barely moves
      // with the stroke. The flap now
      // lives entirely in the wings' own rotation.z about the body line; the
      // body goes where the path says and nowhere else.
      const lift = liftAt(b, clock);
      // QUICKER, NOT FRANTIC — and phase-continuous. Two things were wrong.
      // `b.beat * (1 + E)` multiplied ABSOLUTE TIME by a changing number, which
      // skips the wing's phase every time E moves (the birds had the identical
      // fault in their circuit, where it was visible as flying backwards). And
      // doubling the rate was simply too much to look at — faster movement with
      // less frantic flapping is the read that works. So the extra rides an
      // accumulator like everything else
      // here, and it buys about a third again rather than double.
      const stroke = Math.sin((clock + beatBoost * BEAT_SHARE) * b.beat * Math.PI * 2 + b.beatPh);
      // PERCHED, the wings stop BEATING but they do not stop moving: they stand
      // folded up together and open and close very slowly, about a sixth of a
      // radian either way once every ten seconds or so — stationary, but never
      // fully still. Each one breathes on its own phase, so a
      // row of perched butterflies never pulses in unison.
      const rest = 1.02 + 0.17 * Math.sin(clock * 0.55 + b.beatPh);
      const flying = 0.55 + 0.62 * stroke;           // -0.07 .. 1.17 rad
      const flap = rest + (flying - rest) * lift;

      // Straight onto the path, with nothing added. `+ E * 0.5 * lift` used to
      // hoist the whole flock half a unit whenever they were stirred, which is
      // the same "shoved upward" read the forced lift had — the excitement is
      // in how fast they are going now, not in how high they are held.
      b.node.position.set(_p.x, _p.y, _p.z);
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
      // and any of them sitting in the grass gets up — on the round's own
      // take-off pacing, not thrown
      for (const b of flock) b.scared = clock;
      pose();
    },
    energy() { return energy(); },
    count() { return flock.length; },
    // how airborne each one is right now, 1 flying .. 0 perched in the grass
    lift() { return flock.map((b) => liftAt(b, clock)); },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      // the excitement hurries each FLYING butterfly along its own wander —
      // see BOOST_RATE. Gated on lift so a scare never slides a perched one
      // sideways through the grass, which is the bug pathTime exists to prevent.
      beatBoost += energy() * Math.max(0, dt || 0);
      const push = energy() * BOOST_RATE * Math.max(0, dt || 0);
      if (push > 0) for (const b of flock) b.wander += push * liftAt(b, clock);
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
