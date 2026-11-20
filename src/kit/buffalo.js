import { WASH } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// A water buffalo (case 37): the shared body plan, run heavy. What carries the
// silhouette, in the order it reads at fog distance:
//
//   1. HEAVY FOREQUARTERS. The withers are the highest point of the animal and
//      the back falls away from them to the croup — one line, part of the
//      trunk's own profile (`torso.withers` over `torso.croup`). The shoulder
//      mass used to be domes riding on a barrel, and two domes on a sausage is
//      a pig with something on its back.
//   2. THE HEAD HANGS LOW. A buffalo carries its skull below the withers on a
//      short thick neck that runs nearly level out of the chest; that is most
//      of what separates it from a hippo. The head's `up` is negative for that
//      reason, and the neck needs no angle of its own — it runs from the
//      shoulders to wherever the head is.
//   3. A DEEP BARREL ON SHORT THICK LEGS, with little tuck: the belly line
//      rises aft, but this is not a greyhound.
//   4. THE HORNS sweep out and back off the SKULL. Their base is stated against
//      the head's own position, so if the head moves, move them with it — a
//      base left behind reads as horns sprouting from the neck.
//
// The tail is a verlet strand, the one part of him that will not pass through
// the enclosure. Returns a handle so the koan can tug it.
export function makeBuffalo({ height = 1.4, color = WASH.deep, tailColor = color, seed = 37 } = {}) {
  const { group, tail } = makeQuadruped({
    height, color, seed,
    bodyR: 0.36, bodyLen: 0.52, bodyDrop: 0.42,
    torso: {
      chest: 1.15, loin: 0.82, withers: 1.16, back: 0.98, croup: 0.92,
      shoulderW: 0.95, barrelW: 1.08, hipW: 0.92,
    },
    legBury: 0.2,
    legH: 0.46, legR: 0.105, legTaper: 1.05, hipX: 0.17, hipZ: 0.40,
    // a shallow hock: this animal plods
    legs: { knee: 0.2, shoulder: 1.8, thigh: 2.1 },
    neck: { r: 0.17, w: 0.85, root: 0.62, set: 0.3, taper: 1.0, arch: 0.02 },
    // small against the body: a head as big as the barrel's own section was
    // most of why this read as a toy
    head: { shape: 'sphere', r: 0.2, fwd: 0.86, up: -0.08, scaleX: 0.9, scaleZ: 1.15 },
    snout: { r0: 0.085, r1: 0.13, len: 0.24, fwd: 1.03, up: -0.2, tilt: 0.5 },
    // SMALL, THICK AND CURVED, leaving the sides of the skull's upper back:
    // long straight cones read as spikes coming up from its ears.
    horns: { r: 0.08, len: 0.5, x: 0.09, up: 0.03, fwd: 0.8, sweep: 0.75, back: 0.25, curve: -0.50 },
    tail: { kind: 'strand', segments: 7, length: 0.62, thickness: 0.045, color: tailColor },
  });
  group.name = 'buffalo';

  return {
    group,
    tail,
    update(dt, simTime) { tail.update(dt, simTime); },
  };
}
