import * as THREE from '../../lib/three.module.js';
import { hash1, noise1 } from '../util/noise.js';
import { WASH } from '../palette.js';
import { makeBird } from './bird.js';
import { clamp } from '../util/math.js';

// A flock crossing the sky. Each bird flies a wide, slowly drifting circuit at
// altitude — so it actually travels across the scene rather than circling one
// spot or hovering in place (Frank). They never land; this is birds seen from
// below, the way they are in the two cases that use them.
//
// It is all a closed form over the simTime handed to update() — a bird's path
// is a function of (simTime, seed), nothing is integrated or stored — so the
// flock is identical every run and replays exactly. scatter() layers a decaying
// alarm on top: touched, they climb, quicken and beat harder, then settle.

const TAU_E = 2.6;                 // e-folding of a scatter alarm, seconds

export function makeBirds({
  count = 7,
  seed = 24,
  size = 0.5,
  color = WASH.deep,
  center = [0, 0],
  height = 6.2,
  heightVary = 2.6,                // spread of cruise altitudes about `height`
  spread = 5.0,
  rate = 0.5,                      // angular speed of the circuit, rad/s-ish
} = {}) {
  const g = new THREE.Group();
  g.name = 'birds';

  const flock = [];
  for (let i = 0; i < count; i++) {
    const bird = makeBird({ size, color, seed: seed + i });
    g.add(bird.group);
    const h = (n) => hash1(i * 11 + n, seed);
    flock.push({
      bird,
      // each bird owns a circuit: a centre, a radius, a direction and a speed.
      // Radii run wide so the arc reads as gliding across the sky, not orbiting.
      cx: center[0] + (h(1) - 0.5) * spread,
      cz: center[1] + (h(2) - 0.5) * spread,
      radius: spread * (0.8 + h(3) * 0.9),
      dir: h(4) < 0.4 ? -1 : 1,
      angRate: rate * (0.7 + h(5) * 0.6),
      cruiseY: height + (h(6) - 0.5) * heightVary,
      phase: h(7) * Math.PI * 2,
      beat: 7 + h(8) * 3,
      // a slow wander of the whole circuit, so paths cross the scene instead of
      // retracing one ellipse forever
      driftAmp: spread * (0.5 + h(9) * 0.6),
      driftRate: 0.03 + h(10) * 0.04,
      driftPh: h(11) * Math.PI * 2,
    });
  }

  let clock = 0;
  const bursts = [];
  // HOW FAR THE ALARM HAS CARRIED THEM, in extra seconds of circuit. It has to
  // be integrated, and this is the whole bug it exists to fix.
  //
  // The circuit angle was `phase + t * angRate * dir * (1 + E * 0.9)` — the
  // excitement multiplying ABSOLUTE TIME. E steps from 0 to 1 the instant a
  // scatter lands, so the angle jumped by t * angRate * 0.9 on that one frame:
  // a minute into a page that is twenty-seven radians, four whole laps in a
  // single step. Then, as E decayed back down, the same term SHRANK, and the
  // birds flew round their circuits backwards (Frank: "the birds go really fast
  // for some reason when you click... and they go, like, backwards").
  //
  // An accumulated offset can only ever move forward, at a rate the alarm sets,
  // so the circuit stays continuous through both the arrival and the decay.
  // Same fix, same reason, as the butterflies' wander.
  const HURRY_TURN = 0.9;    // extra circuit-seconds per second, at full alarm
  const HURRY_BEAT = 0.7;    // ...and extra beat-seconds, which had the same flaw
  let hurry = 0;

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
    return clamp(e, 0, 3);
  }

  function poseBird(b, E) {
    const t = clock;
    const a = b.phase + (t + hurry * HURRY_TURN) * b.angRate * b.dir;
    // the circuit, plus a slow drift of its centre across the scene
    const dx = (noise1(t * b.driftRate + b.driftPh, seed + 1) - 0.5) * b.driftAmp;
    const dz = (noise1(t * b.driftRate + b.driftPh + 5, seed + 2) - 0.5) * b.driftAmp;
    const x = b.cx + dx + Math.cos(a) * b.radius;
    const z = b.cz + dz + Math.sin(a) * b.radius * 0.8;
    const y = b.cruiseY + Math.sin(t * 0.6 + b.phase) * 0.4 + E * 2.2;

    // face the way it is going — the tangent of the circuit
    const vx = -Math.sin(a) * b.radius * b.dir;
    const vz = Math.cos(a) * b.radius * 0.8 * b.dir;
    b.bird.group.position.set(x, y, z);
    b.bird.group.rotation.y = Math.atan2(vx, vz);

    // the wingbeat carried the identical fault — a changing multiplier on t
    // skips the phase — so it rides the same accumulator. AMPLITUDE may still
    // read E directly: that is a scale, not a phase, and scaling is continuous.
    const flap = Math.sin((t + hurry * HURRY_BEAT) * b.beat + b.phase) * (0.5 + E * 0.25);
    // bank into the turn, with a little beat-driven wobble
    const roll = -0.22 * b.dir + Math.sin(t * b.beat + b.phase) * 0.08;
    b.bird.pose({ flap, roll, pitch: -0.05 });
  }

  function pose() {
    const E = energy();
    for (const b of flock) poseBird(b, E);
  }
  pose();

  return {
    group: g,
    // something startled them: they climb, quicken and beat harder, then settle
    scatter() {
      bursts.push(clock);
      if (bursts.length > 6) bursts.shift();
      pose();
    },
    energy() { return energy(); },
    count() { return flock.length; },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      hurry += energy() * Math.max(0, dt || 0);
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
