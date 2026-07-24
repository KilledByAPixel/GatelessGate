import * as THREE from '../../lib/three.module.js';
import { hash1, noise1 } from '../util/noise.js';
import { WASH } from '../palette.js';
import { makeBird } from './bird.js';

// A flock that lives a whole small life, not just a loop overhead: each bird
// stands on the ground pecking and looking about, takes off, flies a wandering
// arc, and comes back down to land — then does it again (Frank: "land, move
// around, and then fly off... or even just walking around, picking at the
// ground, looking around"). The old flock only ever flew a fixed ellipse.
//
// Every bird runs the same four-part cycle on its own seeded clock, so at any
// moment some are grounded and some aloft, and no two are in step. It is all a
// closed form over the simTime handed to update() — a bird's whole day is a
// function of (simTime, seed), nothing is integrated or stored, so the flock is
// identical every run and replays exactly. scatter() layers a decaying alarm on
// top: touched, they flush upward and beat hard, then settle back into the day.

const TAU_E = 2.6;                 // e-folding of a scatter alarm, seconds
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

// the cycle, as fractions of a bird's period: grounded, then up, cruise, down
const GROUND_END = 0.36;
const CLIMB_END = 0.46;
const CRUISE_END = 0.84;
// [CRUISE_END, 1) is the descent back to the ground

// how the bird holds itself standing vs pecking, in radians of nose pitch.
// STAND tilts the nose up off the level flight pose; PECK_DOWN dips it to the
// ground. If these read inverted in the scene, swap their signs — the sign
// convention is the one thing here a test can't see.
const STAND = 0.85;
const PECK_DOWN = -0.55;

export function makeBirds({
  count = 7,
  seed = 24,
  size = 0.5,
  color = WASH.deep,
  center = [0, 0],
  height = 6.2,
  spread = 5.0,
  rate = 0.20,
  // where the flock feeds. Defaults under the cruising centre; a scene can put
  // it on open ground clear of the figures and water.
  ground = null,
  groundR = 2.4,
} = {}) {
  const g = new THREE.Group();
  g.name = 'birds';
  const gc = ground || center;

  const flock = [];
  for (let i = 0; i < count; i++) {
    const bird = makeBird({ size, color, seed: seed + i });
    g.add(bird.group);
    const h = (n) => hash1(i * 11 + n, seed);
    flock.push({
      bird,
      period: 15 + h(1) * 13,                       // 15–28 s, all different
      t0: h(2) * 40,                                // phase offset into the day
      dir: h(3) < 0.4 ? -1 : 1,                     // which way round the arc
      // cruise arc
      cx: center[0] + (h(4) - 0.5) * spread * 0.5,
      cz: center[1] + (h(5) - 0.5) * spread * 0.5,
      radius: spread * (0.5 + h(6) * 0.7),
      cruiseY: height + (h(7) - 0.5) * 2.4,
      rate: rate * (0.7 + h(8) * 0.7),
      beat: 8 + h(9) * 4,
      // feeding spot on the ground
      gx: gc[0] + (h(10) - 0.5) * groundR * 2,
      gz: gc[1] + (h(11) - 0.5) * groundR * 2,
      phase: h(12) * Math.PI * 2,
      peckP: 1.4 + h(13) * 1.2,                     // seconds between pecks
      lookP: 2.2 + h(14) * 2.0,                     // seconds between glances
    });
  }

  let clock = 0;
  const bursts = [];

  function energy() {
    let e = 0;
    for (const t0 of bursts) if (clock >= t0) e += Math.exp(-(clock - t0) / TAU_E);
    return clamp(e, 0, 3);
  }

  // where a bird is on its cruise arc at cycle-fraction u (used both for the
  // cruise itself and to know where climbs and descents join it)
  function arc(b, u) {
    const a = b.phase + (u * b.period) * b.rate * b.dir;
    return {
      x: b.cx + Math.cos(a) * b.radius,
      z: b.cz + Math.sin(a) * b.radius * 0.8,
      a,
    };
  }

  function poseBird(b, E) {
    const u = (((clock + b.t0) % b.period) + b.period) % b.period / b.period;
    let x; let y; let z; let heading; let pitch = 0; let roll = 0; let spread = 1; let flap = 0;

    if (u < GROUND_END) {
      // ---- on the ground: peck, look about, drift a step -------------------
      const drift = 0.16 * size;
      x = b.gx + Math.sin(clock * 0.5 + b.phase) * drift;
      z = b.gz + Math.cos(clock * 0.43 + b.phase * 1.3) * drift;
      y = 0;
      // a glance: mostly still, an occasional quick turn of the head/body
      const look = noise1(clock / b.lookP + b.phase, seed + 3) - 0.5;
      heading = look * 2.2;
      // a peck: bow down to the ground and back up
      const pk = peck(clock, b);
      // STAND is nose-up; a peck drops the nose to the earth
      pitch = lerp(STAND, PECK_DOWN, pk);
      // wings folded, with the odd shuffle — a half-open ruffle and settle
      const shuffle = Math.max(0, noise1(clock * 1.3 + b.phase, seed + 7) - 0.72);
      spread = shuffle * 1.2;
      flap = shuffle * 0.6 * Math.sin(clock * 22 + b.phase);
    } else if (u < CLIMB_END) {
      // ---- taking off: rise from the feeding spot onto the arc -------------
      const k = smooth((u - GROUND_END) / (CLIMB_END - GROUND_END));
      const enter = arc(b, CLIMB_END);
      x = lerp(b.gx, enter.x, k);
      z = lerp(b.gz, enter.z, k);
      y = smooth(k) * b.cruiseY;
      heading = Math.atan2(enter.x - b.gx, enter.z - b.gz);
      pitch = lerp(STAND, 0, k);                     // stand up straight into level
      spread = smooth(k * 1.4);
      flap = Math.sin(clock * b.beat) * (0.5 + 0.3 * (1 - k)); // hard beats to climb
    } else if (u < CRUISE_END) {
      // ---- aloft: the wandering arc ----------------------------------------
      const p = arc(b, u);
      x = p.x; z = p.z;
      y = b.cruiseY + Math.sin(clock * 0.7 + b.phase) * 0.35;
      heading = -p.a * b.dir + (b.dir > 0 ? 0 : Math.PI);
      flap = Math.sin(clock * b.beat + b.phase) * 0.4;
      roll = 0.18 * b.dir + Math.sin(clock * b.beat + b.phase) * 0.12;
    } else {
      // ---- landing: drop off the arc back to the feeding spot ---------------
      const k = smooth((u - CRUISE_END) / (1 - CRUISE_END));
      const leave = arc(b, CRUISE_END);
      x = lerp(leave.x, b.gx, k);
      z = lerp(leave.z, b.gz, k);
      y = (1 - smooth(k)) * b.cruiseY;
      heading = Math.atan2(b.gx - leave.x, b.gz - leave.z);
      pitch = lerp(0, STAND, smooth(k));             // flare nose-up to land
      spread = 1;
      flap = Math.sin(clock * b.beat) * 0.5 * (1 - k * 0.4);   // backpedalling
    }

    // ---- the alarm: touched, everyone flushes up and beats hard -----------
    if (E > 0.02) {
      const a = clamp(E, 0, 1);
      y += E * 2.4;                                  // shoved skyward
      spread = Math.max(spread, a);
      pitch = lerp(pitch, 0, a);
      flap = lerp(flap, Math.sin(clock * (b.beat + 6) + b.phase) * 0.7, a);
      roll += Math.sin(clock * 5 + b.phase) * 0.2 * a;
    }

    b.bird.group.position.set(x, y, z);
    b.bird.group.rotation.y = heading;
    b.bird.pose({ spread, flap, pitch, roll });
  }

  // a peck is a quick bow: down in the first fifth of its beat, a breath at the
  // bottom, back up — zero the rest of the time
  function peck(t, b) {
    const f = (((t + b.phase * b.peckP) % b.peckP) + b.peckP) % b.peckP / b.peckP;
    if (f < 0.18) return smooth(f / 0.18);
    if (f < 0.30) return 1;
    if (f < 0.48) return 1 - smooth((f - 0.30) / 0.18);
    return 0;
  }

  function pose() {
    const E = energy();
    for (const b of flock) poseBird(b, E);
  }
  pose();

  return {
    group: g,
    // something startled them: they flush upward, beat hard, and resettle
    scatter() {
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
