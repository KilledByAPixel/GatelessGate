import { INK } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// Joshu's dog (case 1). A small ink quadruped, featureless by design — the koan
// asks whether it has Buddha-nature, and a face would answer that.
//
// Built on the shared quadruped so the leg-to-belly join is computed rather than
// guessed; see THE LEG RULE in quadruped.js. Faces +z.
export function makeDog({ height = 0.5, color = INK, seed = 1 } = {}) {
  // Taller legs and a slimmer barrel: the first pass was short-legged and
  // fat-bodied, which read as a pig rather than a dog. The neck lifts the head
  // off the shoulders, which is most of what separates the two silhouettes.
  const { group } = makeQuadruped({
    height, color, seed,
    bodyR: 0.20, bodyLen: 0.70, bodyDrop: 0.18,
    // legs read as sticks at 0.052 — thicker, and a gentler taper so the foot
    // is not a pin (Frank's first-pass note across all the quadrupeds)
    legH: 0.52, legR: 0.078, legTaper: 0.88, hipX: 0.13, hipZ: 0.30,
    neck: { r: 0.085, len: 0.26 },
    head: { shape: 'sphere', r: 0.165, fwd: 0.55, up: 0.30 },
    snout: { r0: 0.05, r1: 0.09, len: 0.20, fwd: 0.74, up: 0.24 },
    ears: { r: 0.07, h: 0.16, x: 0.10, up: 0.44, fwd: 0.50, tilt: 0.28 },
    tail: { kind: 'stiff', r0: 0.022, r1: 0.045, length: 0.38, up: 0.12, back: 0.42, tilt: -1.0 },
  });
  group.name = 'dog';
  return group;
}
