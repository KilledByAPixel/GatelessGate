import { WASH } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// A water buffalo (case 37): the dog's body plan, run heavy. Bulky barrel, the
// shoulder hump that makes a buffalo a buffalo, a blunt box head with swept
// horns, and a verlet strand for the tail — the one part of him that will not
// pass through the enclosure.
//
// Returns a handle so the koan can tug the tail.
export function makeBuffalo({ height = 1.4, color = WASH.deep, tailColor = color, seed = 37 } = {}) {
  // Four things carry the silhouette: the shoulder hump must stand CLEAR of the
  // back line (not sit flush in it); haunch/shoulder/chest put weight ON the
  // barrel so it reads as a heavy body instead of a bare capsule, with the
  // chest hanging the belly line low; the head must hang LOW — a buffalo
  // carries its skull below the withers, which is most of what separates it
  // from a hippo; and the horns must sweep long and back, clearing the skull
  // line, to read as a crescent at fog distance rather than two bumps. The back
  // then slopes hump-down-to-rump on its own, because the hump is set forward
  // of the haunch.
  const { group, tail } = makeQuadruped({
    height, color, seed,
    // few segments so flatShading facets it — a smooth capsule reads as a lozenge
    bodyR: 0.40, bodyLen: 0.86, bodyDrop: 0.36,
    legH: 0.46, legR: 0.125, hipX: 0.24, hipZ: 0.34,
    hump: { r: 0.40, scaleY: 0.86, scaleZ: 1.00, up: 0.24, fwd: 0.18 },
    // up + r*scaleY must clear bodyR (0.40) for these to stand PROUD of the
    // barrel line rather than sit flush inside it — the same trap the hump
    // avoided by construction. Haunch runs a touch taller than shoulder so the
    // back still slopes hump-down-to-rump instead of reading level.
    haunch: { r: 0.30, scaleY: 0.82, scaleZ: 1.05, up: 0.22, back: 0.32 },
    // close to the hump's own fwd so the two masses MERGE into one wide crown
    // rather than reading as two separate peaks (a camel, not a buffalo).
    shoulder: { r: 0.30, scaleY: 0.82, up: 0.20, fwd: 0.22 },
    chest: { r: 0.24, drop: 0.36, fwd: 0.42 },
    // a compact wedge rather than a long slab: the head sat so far forward it
    // read as a snout on a crocodile. Lower and more nose-down than the first
    // pass so the muzzle drops below the withers — the grazing line.
    head: { shape: 'box', w: 0.36, hh: 0.32, d: 0.52, fwd: 0.68, up: -0.34, tilt: 0.55 },
    // THE BASE SITS ON THE SKULL, NOT THE HUMP. horns.up/fwd are NOT free
    // parameters — they are the poll (the top-back corner of the tilted head
    // box, where a real buffalo's horns actually emerge), solved the same way
    // fox.js solves NECK_TOP: rotate the box's local top-back corner
    // (0, +hh/2, -d/2) by head.tilt about x, then add head.up/head.fwd.
    //   up  = head.up + (hh/2)*cos(tilt) + (d/2)*sin(tilt)
    //       = -0.34    + 0.16*cos(0.55)   + 0.26*sin(0.55)   ≈ -0.07
    //   fwd = head.fwd + (hh/2)*sin(tilt) - (d/2)*cos(tilt)
    //       =  0.68    + 0.16*sin(0.55)   - 0.26*cos(0.55)   ≈  0.54
    // A first pass set `up` from taste (0.02, then 0.30 chasing the k37
    // crescent) without re-deriving it against head.up, which fell to -0.34 in
    // the same round — the base drifted half a height clear of the skull and
    // read as sprouting from the hump instead. Everything ABOVE the base is
    // still free: tip height above the base is len*cos(back)*cos(sweep) (both
    // rotations shorten the vertical reach, since each tips the cone away from
    // straight-up), and back/sweep alone steer the crescent's direction.
    horns: { r: 0.055, len: 1.10, x: 0.14, up: -0.07, fwd: 0.54, sweep: 0.55, back: 0.66 },
    tail: { kind: 'strand', segments: 7, length: 0.74, thickness: 0.05, up: 0.16, back: 0.62, color: tailColor },
  });
  group.name = 'buffalo';

  return {
    group,
    tail,
    update(dt, simTime) { tail.update(dt, simTime); },
  };
}
