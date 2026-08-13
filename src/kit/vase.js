import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';

// A water vase (case 40) — the jing, the pitcher form: a small foot, a full
// belly, a narrow neck, a lip that flares just enough to pour. One lathe, so
// the silhouette stays a single unbroken curve — this must NOT read as the
// bowl (wide, open, squat) or as a lantern (a stack of separate stones).
//
// THE ROCK. Tap it and it tips a few degrees, then wobbles back upright on a
// decaying swing, pivoting on the rim of its base the way a real vessel does —
// tipping on one edge, crossing vertical, catching itself on the opposite edge.
// IT NEVER FALLS: the tilt is hard-capped far short of the tipping point
// (atan(baseR / comHeight) ≈ 0.46 rad for these proportions; the cap is a
// third of that). Case 40 stages the moment BEFORE Isan's foot — the wobble
// that rights itself is the koan's tension made touchable, not its answer.

const TILT_CAP = 0.15;   // rad — the hard ceiling, ~a third of the tipping angle
const KICK = 0.085;      // rad — what one nudge adds to the swing
const TAU = 0.55;        // s — envelope decay; back to rest in ~2.5 s
const OMEGA = 14.0;      // rad/s — wobble frequency, a rock every ~0.45 s
const REST = 0.002;      // rad — below this it is standing still again

export function makeVase({ height = 0.55, color = WASH.mid, seed = 0 } = {}) {
  const g = new THREE.Group();
  g.name = 'vase';
  const H = height;
  const BASE_R = 0.150 * H;   // the rim it rocks on

  // profile in fractions of height: up the outside, over the lip, a little way
  // back down inside so the mouth reads as an opening rather than a plug
  //
  // NECK/SHOULDER. The old belly->neck run was one smooth, near-linear cone
  // (0.290 -> 0.270 -> 0.160 -> 0.085 across a third of the height) — legible,
  // but it read as a single taper rather than two features. A real shoulder
  // is a shelf: it holds close to the belly's own width a while longer, THEN
  // pulls in over a short, steep run, so the eye catches a distinct kink
  // before the neck — which then holds a near-constant narrow radius for a
  // real stretch, instead of continuing to taper, so it reads as a neck and
  // not just the tail end of the same cone.
  const prof = [
    [0.020, 0.000],
    [0.150, 0.000],   // base edge — the pivot circle
    [0.185, 0.045],   // foot swell
    [0.300, 0.220],   // the belly, widest point
    [0.290, 0.320],   // the shoulder's shelf — still broad, barely drawn in
    [0.175, 0.420],   // the shoulder's own steep pull-in toward the neck
    [0.082, 0.480],   // the neck begins, already narrow
    [0.078, 0.660],   // and holds narrow — a cylinder, not a continued cone
    [0.100, 0.930],   // flare
    [0.120, 0.980],   // lip edge
    [0.088, 1.000],   // rim, open
    [0.060, 0.900],   // down inside the mouth
  ].map(([r, y]) => new THREE.Vector2(r * H, y * H));

  const body = new THREE.Mesh(
    new THREE.LatheGeometry(prof, 12),
    washMaterial({ color, flat: true, side: THREE.DoubleSide }));
  body.name = 'body';

  // the pivot rig: `rock` sits at the base-rim edge currently doing the
  // rocking, `body` is offset back by the same amount, so rotating `rock`
  // turns the vase about that edge and the planted edge never leaves the
  // ground. At rest both offsets are zero and the rig is invisible.
  const rock = new THREE.Group();
  rock.name = 'rock';
  rock.add(body);
  g.add(rock);

  // ---- rocking state, deterministic from simTime ------------------------
  // A nudge records the last simTime seen by update() and the swing is a pure
  // function of (now - t0): amp * e^(-u/TAU) * cos(OMEGA * u). No RNG, no
  // clocks — same taps at the same times, same wobble.
  let amp = 0;        // current swing amplitude (the envelope's start value)
  let t0 = 0;         // when the last nudge happened
  let n = 0;          // how many nudges, ever (also seeds the direction)
  let now = 0;        // last simTime seen by update()
  let tilt = 0;       // |angle| right now, for fragments
  const dir = new THREE.Vector2(1, 0);   // horizontal rock direction
  const axis = new THREE.Vector3();

  const envelope = () => amp * Math.exp(-(now - t0) / TAU);

  function nudge() {
    // re-exciting an existing wobble adds to what is left of it, and the sum
    // is capped: however hard and however often it is kicked, the swing can
    // never reach an angle it cannot recover from
    amp = Math.min(TILT_CAP, envelope() + KICK);
    t0 = now;
    n++;
    const az = hash1(n, seed * 7 + 3) * Math.PI * 2;
    dir.set(Math.cos(az), Math.sin(az));
  }

  function update(dt, simTime) {
    now = simTime;
    const env = envelope();
    if (env < REST) {
      if (tilt !== 0) {
        tilt = 0;
        rock.position.set(0, 0, 0);
        body.position.set(0, 0, 0);
        rock.quaternion.identity();
      }
      return;
    }
    const ang = env * Math.cos(OMEGA * (now - t0));
    // the pivot alternates: tipped one way it stands on that side's base edge,
    // through vertical it catches on the opposite edge — sign picks the edge
    const s = ang >= 0 ? 1 : -1;
    const dx = dir.x * s, dz = dir.y * s;
    tilt = Math.abs(ang);
    rock.position.set(dx * BASE_R, 0, dz * BASE_R);
    body.position.set(-dx * BASE_R, 0, -dz * BASE_R);
    axis.set(dz, 0, -dx);                       // tips the top toward (dx, dz)
    rock.quaternion.setFromAxisAngle(axis, tilt);
  }

  return {
    group: g,
    nudge,
    update,
    rocking: () => envelope() >= REST,
    tilt: () => tilt,
    nudges: () => n,
  };
}
