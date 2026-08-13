import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// Joshu's dog (case 1). A small ink quadruped, featureless by design — the koan
// asks whether it has Buddha-nature, and a face would answer that.
//
// Built on the shared quadruped so the leg-to-belly join is computed rather than
// guessed; see THE LEG RULE in quadruped.js. Faces +z.
//
// He is HALF THE CAST of case 1 — a small red seal beside two ink monks, not a
// showpiece — so this stays humble: the same bare barrel as before, plus just
// enough mass to stop it reading as a table. `haunch` alone carries that (not
// `shoulder`, not `legs.knee`): it sits over the hind legs (`back` matches
// `hipZ` — it seats where the hind pair actually roots, so the dog reads as one
// animal, not a barrel with sticks) and stands only barely proud of the barrel
// line (`up + r*scaleY` clears `bodyR` by ~0.04h) — enough to read as weight at
// k1 scale, not enough to look fed. A `chest` brisket was tried here and CUT:
// hung ahead of the foreleg it never merged with the body line, and at case
// distance it read as "something weird hanging below his chest, like a round
// ball" — the plain barrel beats a bolted-on lump. The existing cocked-up tail
// (`tilt: -1.0`) and the k1 module's own `dog.rotation.y` (which turns the
// whole animal, head included, back up the road toward the monks — the "head
// tilt toward the monk" handle) are untouched by this pass; nothing here
// changes the group's orientation. THE TAIL ROOTS INTO THE BODY. A 'stiff' tail
// is a cylinder centred on its own origin, and the old up/back numbers left its
// root end hovering near the barrel's axis — which put the visible root at the
// top of the rump, perched ON the outline instead of growing out of it, and
// together with the proud haunch it broke the topline as "something weird on
// the top of its butt" Same cure as the fox's brush: pin the ROOT to a stated
// point just under the rump's surface and solve the centre the quadruped wants,
// so the cocked tail emerges from inside the body at any length or angle.
const TAIL_TILT = -1.0;                  // rad: up and back — the cocked tail is the read
const TAIL_LEN = 0.28;
const TAIL_ROOT = [0.13, -0.40];         // [above the barrel axis, z] — 0.07 under the surface
const TAIL_UP = TAIL_ROOT[0] + (TAIL_LEN / 2) * Math.cos(TAIL_TILT);
const TAIL_BACK = -(TAIL_ROOT[1] + (TAIL_LEN / 2) * Math.sin(TAIL_TILT));

export function makeDog({ height = 0.5, color = INK_LIT, seed = 1 } = {}) {
  // Taller legs and a slimmer barrel: the first pass was short-legged and
  // fat-bodied, which read as a pig rather than a dog. The neck lifts the head
  // off the shoulders, which is most of what separates the two silhouettes.
  const { group } = makeQuadruped({
    height, color, seed,
    bodyR: 0.25, bodyLen: 0.50, bodyDrop: 0.18,
    // the legs read as sticks when thinner; the limb profile in the shared plan
    // (broad thigh, slim cannon, small foot) does the shaping now, and legTaper
    // hands it a full-width thigh to start from
    legBury: .2,
    legH: 0.5, legR: 0.09, legTaper: 1.0, hipX: 0.1, hipZ: 0.30,
    neck: { r: 0.15, len: 0.26 },
    head: { shape: 'sphere', r: 0.165, fwd: 0.55, up: 0.30 },
    snout: { r0: 0.06, r1: 0.1, len: 0.2, fwd: 0.7, up: 0.24 },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): r width, h
    // length, x/y/z = base offset from the head's CENTRE (keep the offsets
    // inside the head's own radius, above, to bury the join), tilt = outward lean.
    // These numbers reproduce the old aim-ray placement exactly (45° out on
    // the crown); they are a starting point to tune, not a keeper.
    ears: { r: 0.07, h: 0.16, x: 0.07, y: 0.08, z: -.03, tilt: 1.6 },
    // rump: `back` sits just short of `hipZ` so the mass gathers where the hind
    // legs actually drive into the barrel. LOW AND LONG: an earlier round stood
    // it proud of the barrel line and the bump over the hips was the first
    // thing anyone saw. `up + r*scaleY` now clears `bodyR` by a hair — the
    // haunch thickens the topline without breaking it — and the longer scaleZ
    // lets the extra weight run INTO the back instead of up off it.
    haunch: { r: 0.145, scaleY: 0.75, scaleZ: 1.30, up: 0.10, back: 0.28 },
    tail: {
      kind: 'stiff', r0: 0.024, r1: 0.052, length: TAIL_LEN,
      up: TAIL_UP, back: TAIL_BACK, tilt: TAIL_TILT,
    },
  });
  group.name = 'dog';
  return group;
}
