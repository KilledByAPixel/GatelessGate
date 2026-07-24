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
    // a high neck up to the head — the line that says horse
    neck: { r: 0.10, len: 0.5 },
    // a LONG, THIN head rather than a ball (Frank): a narrow box for the skull,
    // nosed down, with a tapering muzzle cylinder out front for the mouth
    head: { shape: 'box', w: 0.13, hh: 0.17, d: 0.42, fwd: 0.6, up: 0.44, tilt: 0.42 },
    snout: { r0: 0.05, r1: 0.075, len: 0.34, fwd: 0.84, up: 0.33 },
    // ears sitting ON the skull, not floating above it
    ears: { r: 0.028, h: 0.15, x: 0.055, up: 0.5, fwd: 0.48, tilt: 0.35 },
    tail: { kind: 'stiff', r0: 0.055, r1: 0.02, length: 0.62, up: 0.06, back: 0.46, tilt: -0.7 },
  });
  group.name = 'horse';
  return { group };
}
