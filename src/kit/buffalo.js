import { WASH } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// A water buffalo (case 37): the dog's body plan, run heavy. Bulky barrel, the
// shoulder hump that makes a buffalo a buffalo, a blunt box head with swept
// horns, and a verlet strand for the tail — the one part of him that will not
// pass through the enclosure.
//
// Returns a handle so the koan can tug the tail.
export function makeBuffalo({ height = 1.4, color = WASH.deep, tailColor = color, seed = 37 } = {}) {
  // Three things carry the silhouette, and the first pass had none of them: the
  // shoulder hump must stand CLEAR of the back line (not sit flush in it), the
  // head must hang LOW — a buffalo carries its skull below the shoulder, which
  // is most of what separates it from a hippo — and the horns must sweep wide
  // enough to be read at distance. The back then slopes hump-down-to-rump on its
  // own, because the hump is set forward.
  const { group, tail } = makeQuadruped({
    height, color, seed,
    // few segments so flatShading facets it — a smooth capsule reads as a lozenge
    bodyR: 0.40, bodyLen: 0.86, bodyDrop: 0.36,
    legH: 0.46, legR: 0.125, hipX: 0.24, hipZ: 0.34,
    hump: { r: 0.40, scaleY: 0.86, scaleZ: 1.00, up: 0.24, fwd: 0.24 },
    // a compact wedge rather than a long slab: the head sat so far forward it
    // read as a snout on a crocodile
    head: { shape: 'box', w: 0.36, hh: 0.32, d: 0.52, fwd: 0.74, up: -0.18, tilt: 0.42 },
    horns: { r: 0.05, len: 0.42, x: 0.18, up: 0.02, fwd: 0.62, sweep: 1.05, back: 0.22 },
    tail: { kind: 'strand', segments: 7, length: 0.74, thickness: 0.05, up: 0.16, back: 0.62, color: tailColor },
  });
  group.name = 'buffalo';

  return {
    group,
    tail,
    update(dt, simTime) { tail.update(dt, simTime); },
  };
}
