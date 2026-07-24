import { INK } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// A horse (case 45): the shared quadruped plan run tall and light — long legs, a
// deep chest, a high arched neck and a small head, with pricked ears and a
// hanging tail. The verse says "Do not ride another's horse," so one stands
// tethered by a stall, and it is the case's one red thing.
//
// Stiff tail rather than a verlet strand: this horse only stands there, and a
// single cylinder keeps it inside the draw budget with a market already built.
export function makeHorse({ height = 1.5, color = INK, seed = 45 } = {}) {
  const { group } = makeQuadruped({
    height, color, seed,
    bodyR: 0.22, bodyLen: 0.9, bodyDrop: 0.1,
    // long, slim legs set at the corners of a deep barrel
    legH: 0.62, legR: 0.05, legTaper: 0.82, hipX: 0.14, hipZ: 0.35,
    // a high neck up to a small head carried forward — the line that says horse
    neck: { r: 0.10, len: 0.5 },
    head: { shape: 'sphere', r: 0.145, fwd: 0.78, up: 0.52, tilt: 0.35 },
    ears: { r: 0.028, h: 0.14, x: 0.05, up: 0.74, fwd: 0.66, tilt: 0.35 },
    tail: { kind: 'stiff', r0: 0.055, r1: 0.02, length: 0.62, up: 0.06, back: 0.46, tilt: -0.7 },
  });
  group.name = 'horse';
  return { group };
}
