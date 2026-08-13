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
// The circuit is INTEGRATED — `travel` below is how far round the flock has
// actually flown, advanced by dt every tick — while the slow wander of each
// circuit's centre is still a closed form over simTime. Given the same steps
// the flock is identical every run, which is the determinism the book asks for;
// what it is no longer is a function of simTime alone. See `travel` for the bug
// that made the difference matter.
//
// scatter() layers a decaying alarm on top: touched, they climb, quicken and
// beat harder, then settle. pick() is how a case lets the reader aim at them.

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
  // HOW MUCH FASTER A SCATTER MAKES THEM FLY, as extra circuit-seconds per
  // second at full alarm: 0 is a flock that climbs and beats harder without
  // going anywhere quicker, 1 doubles the circuit at the peak. This is THE
  // knob for "make the birds go faster when you click them" (Frank, case 24),
  // and it is per-flock rather than a module constant because case 49's birds
  // are scenery in a scene about a temple bell and have no reason to inherit
  // case 24's answer. `hurryBeat` is the same for the WINGS, kept separate on
  // purpose — Frank asked for exactly this split once already ("move faster,
  // but flap wings less fast"), and a flock that speeds up without beating
  // proportionally harder is the whole difference between hurrying and
  // panicking.
  hurry = 0.9,
  hurryBeat = 0.7,
} = {}) {
  const g = new THREE.Group();
  g.name = 'birds';

  // A bird is three small meshes with a wingspan of about `size`, cruising
  // several units up: aimed at directly it is a target of a degree or two, which
  // is not a tap on a phone and barely one with a mouse. Each carries an
  // invisible sphere three times its own span, parented to the bird so it needs
  // no per-frame bookkeeping. An invisible material draws nothing, so this costs
  // no draw calls — the same trade every hit proxy in the book makes.
  const PROXY_R = size * 3;
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxyGeo = new THREE.SphereGeometry(PROXY_R, 6, 4);
  const proxies = [];

  const flock = [];
  for (let i = 0; i < count; i++) {
    const bird = makeBird({ size, color, seed: seed + i });
    const proxy = new THREE.Mesh(proxyGeo, proxyMat);
    proxy.name = 'bird-hit';
    bird.group.add(proxy);
    proxies.push(proxy);
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
  // HOW FAR ROUND THEY HAVE FLOWN, in circuit-seconds. It has to be integrated,
  // and the bug it exists to fix is the reason nothing here reads `t` any more.
  //
  // The circuit angle was `phase + t * angRate * dir * (1 + E * 0.9)` — the
  // excitement multiplying ABSOLUTE TIME. E steps from 0 to 1 the instant a
  // scatter lands, so the angle jumped by t * angRate * 0.9 on that one frame:
  // a minute into a page that is twenty-seven radians, four whole laps in a
  // single step. Then, as E decayed back down, the same term SHRANK, and the
  // birds flew round their circuits backwards (Frank: "the birds go really fast
  // for some reason when you click... and they go, like, backwards").
  //
  // An accumulated angle moves at whatever rate is asked for on the frame it is
  // asked, so the circuit stays continuous through both the arrival and the
  // decay. Same fix, same reason, as the butterflies' wander.
  //
  // The first version of that fix kept `t` and added an offset beside it
  // (`t + hurry * HURRY_TURN`), which is continuous and correct and still
  // cannot express what reverse() needs: `t` only ever counts up, so the total
  // could only be slowed, never turned around. So the base rate came inside the
  // accumulator too, and `travel` is now the whole angle rather than a
  // correction to one. `beats` is the same story for the wings.
  const HURRY_TURN = Math.max(0, hurry);        // extra circuit-seconds per second, at full alarm
  const HURRY_BEAT = Math.max(0, hurryBeat);    // ...and extra beat-seconds, which had the same flaw
  let travel = 0;
  let beats = 0;

  // FLYING BACKWARDS was built here and then cut, and is worth one note. Frank:
  // "a weird idea... they're gonna slow down and then start flying backwards for
  // a bit and then slow down and then start flying normal again" — a signed rate
  // on the circuit easing down through zero and back, with the heading left as
  // the circuit tangent so they slid tail-first rather than turning round. It
  // worked, and he changed his mind on seeing it described ("let's just have the
  // birds fly faster for a bit"). What it left behind is `travel` itself: the
  // reversal is the one thing the old `t + hurry` form could not express at any
  // value, so it is the reason the base rate came inside the accumulator, and
  // that is a straightforwardly better shape whether or not anything ever flies
  // astern again.

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
    const a = b.phase + travel * b.angRate * b.dir;
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
    // skips the phase — so it rides its own accumulator. AMPLITUDE may still
    // read E directly: that is a scale, not a phase, and scaling is continuous.
    const flap = Math.sin(beats * b.beat + b.phase) * (0.5 + E * 0.25);
    // bank into the turn, with a little beat-driven wobble
    const roll = -0.22 * b.dir + Math.sin(beats * b.beat + b.phase) * 0.08;
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
    // THE FLOCK IS THE TARGET, and a bird is a 0.5-unit mark forty feet up: the
    // meshes themselves are all but untappable on a phone, so each one carries
    // a generous invisible sphere that travels with it (the furin's idiom —
    // pick() belongs to the component, not to the case). Returns the bird's
    // index, or null. Safe before setCamera and with no audio engine.
    pick(camera, input) {
      if (!camera || !input || !input.raycastFirst) return null;
      const hit = input.raycastFirst(camera, proxies);
      if (!hit) return null;
      const i = proxies.indexOf(hit.object);
      return { bird: i < 0 ? 0 : i };
    },
    count() { return flock.length; },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const step = Math.max(0, dt || 0);
      // the circuit's own pace plus whatever the alarm is adding — a rate, so
      // it can change on any frame without the angle jumping
      const E = energy();
      travel += (1 + E * HURRY_TURN) * step;
      beats += (1 + E * HURRY_BEAT) * step;
      while (bursts.length && clock - bursts[0] > 8 * TAU_E) bursts.shift();
      pose();
    },
  };
}
