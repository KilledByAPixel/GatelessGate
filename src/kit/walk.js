import { hash1 } from '../util/noise.js';

// The walk: the souls' gait from case 35, extracted for every walker.
//
// SOURCE: k35's two souls carry the walk Frank likes — "the same kind of walk
// animation for people that are walking." That case remains the reference
// implementation (inline and time-driven, because its figures drift at one
// dreamlike speed forever); a future pass may converge it onto this helper.
// What it does, by the numbers, for its height-1.5 figures:
//
//   bob    position.y  = |sin(gait)| * 0.035     — a lift per FOOTFALL, so the
//                                                  body rises twice per full cycle
//   roll   rotation.z  =  sin(gait) * 0.04       — the weight shift, one full
//                                                  cycle per two footfalls
//   sway   rotation.y +=  sin(gait * 1.1/2.3) * 0.06 — a slow heading wander,
//                                                  slower than the step rhythm
//
// k35 advances `gait` at 2.3 rad/s while covering ~0.38 units/s of road, which
// is ~6 rad per unit — a footfall (π rad) every ~0.52 units, ~0.35 × height.
// Those are the defaults here.
//
// THE ONE DESIGN CHANGE: phase is driven by DISTANCE TRAVELLED, not by time,
// so the footfall rhythm tracks however fast the case actually moves the
// figure — walkers ride makePath routes by parameter, so convert with
// pathLength() and feed apply() the accumulated road distance. Pure logic, no
// THREE, no Math.random (phase offset comes from hash1(seed)): apply() only
// assigns position.y / rotation.y / rotation.z, so a case hands it the monk's
// Group and a test hands it a plain object.

const SWAY_RATIO = 1.1 / 2.3;     // k35's sway rate relative to its gait rate

// One instant of the gait, as pure numbers. `phase` is in radians; a footfall
// is π. Returns { lift, roll, yaw }: add lift to the ground height, set roll
// as rotation.z, add yaw to the travel heading.
export function walkPose(phase, { bob = 0.035, roll = 0.04, sway = 0.06 } = {}) {
  return {
    lift: Math.abs(Math.sin(phase)) * bob,
    roll: Math.sin(phase) * roll,
    yaw: Math.sin(phase * SWAY_RATIO) * sway,
  };
}

// A walker: fixed per-figure parameters plus a seeded phase offset, so two
// figures on the same road never step in lockstep. `stride` is the distance
// one footfall covers; bob scales with height (k35's 0.035 at height 1.5).
export function makeWalk({
  seed = 0, height = 1.6,
  stride = height * 0.35,
  bob = height * (0.035 / 1.5),
  roll = 0.04, sway = 0.06,
} = {}) {
  const amps = { bob, roll, sway };
  const phase0 = hash1(seed, 0x57A1C) * Math.PI * 2;
  const phaseAt = (s) => phase0 + (s / stride) * Math.PI;
  return {
    stride,
    phaseAt,
    pose: (s) => walkPose(phaseAt(s), amps),
    // s = distance travelled along the route; heading = the figure's facing
    // (rotation.y) toward its direction of travel; baseY = ground height.
    apply(group, s, heading = 0, baseY = 0) {
      const p = walkPose(phaseAt(s), amps);
      group.position.y = baseY + p.lift;
      group.rotation.y = heading + p.yaw;
      group.rotation.z = p.roll;
      return p;
    },
  };
}

// The rotation.y that faces the standard figure along a travel direction
// (dx, dz). The figure kit's BODIES front local +z — proved empirically
// (shots wip-monk-axis-*): the arm meshes hang at x = ±0.27, so the shoulder
// line spans x and the robe/hat silhouette is symmetric about x = 0; the k35
// souls Frank approved face travel with exactly this mapping, and k17 learned
// the same lesson case-locally before it lived here. rotation.y maps local +z
// onto the world direction (sin y, 0, cos y), so sin y = dx, cos y = dz.
// (An earlier draft assumed aimMonk's +x — that is the POINTING-ARM axis,
// a different convention, and it read walkers a quarter turn off the road.)
export function walkHeading(dx, dz) {
  return Math.atan2(dx, dz);
}

// Arc length of a path.sample-style centreline (fn(t in 0..1) → {x, z}), so a
// case can convert path-parameter speed into real distance for the gait —
// footfalls must track ground covered, not the parameter.
export function pathLength(sampleFn, samples = 64) {
  let length = 0;
  let prev = sampleFn(0);
  for (let i = 1; i <= samples; i++) {
    const p = sampleFn(i / samples);
    length += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return length;
}
