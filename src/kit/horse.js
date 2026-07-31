import { INK } from '../palette.js';
import { makeQuadruped } from './quadruped.js';

// A horse (case 45): THE NECK IS THE ANIMAL. Everything else stays quiet — a
// lean barrel, the slimmest legs of any species in the kit, and a small head
// hung off the end of a long, thick-at-the-base neck. The shared plan only
// offers a STRAIGHT neck cylinder (no curve option — see `neck` in
// quadruped.js), so the "arch" is a two-part illusion rather than a literal
// bend: the neck rises steeply out of the chest, and the head hangs off its
// top at ~45 degrees nose-down, so the silhouette bends hard right at the
// poll, exactly where a real horse's neck crests and drops. The verse says
// "Do not ride another's horse," so one stands tethered by a stall, and it
// is the case's one red thing.
//
// BUDGET, not taste, is why `legs.knee` and `chest` are absent even though
// both are on the shared plan and both would help the neck read. k45's
// market — a road, three stalls, two keepers, a customer, two walkers, a
// crowd, and the man who is always just out of frame — already sits at 146
// of the 150-draw cap with the ORIGINAL horse (measured directly, not
// estimated: every mesh here costs TWO draws, since `addOutlines` adds one
// inverted-hull child per mesh, so the cap really only has room for two more
// meshes than the original 11 gave). A knee'd hind pair alone (+2 meshes) or
// knee+chest together (+3) blows it. For a horse that stands still, tethered,
// the fold at the hock pays far less than it does for buffalo.js's grazing
// animal, so it stayed off; the strand tail (+1 mesh, replacing the old
// stiff cylinder 1-for-1 in kind but not in count) is the one paid addition,
// because "tail as strand" is its own named target, not a technique note for
// the neck. If a future pass frees draw budget elsewhere in the k45 scene,
// `legs: { knee: 0.4 }` and a `chest: { r: 0.15, drop: 0.10, fwd: 0.32 }`
// (the brisket, under the neck's base) are the two options to add back first.
//
// Snout and ears are positioned INDEPENDENTLY of the head box by the shared
// plan (quadruped.js anchors them off `bodyY`, not off the head mesh), so
// their up/fwd are DERIVED from the tilted head box's own faces rather
// than tuned by eye — the lesson buffalo.js's horns learned the hard way
// (see that file's header for the same trick). The snout anchors at the
// box's local front-face centre, rotated by `head.tilt` about x:
//   snout.up  = head.up  - (head.d / 2)  * sin(head.tilt)
//   snout.fwd = head.fwd + (head.d / 2)  * cos(head.tilt)
// and — the fix for "the head is kinda messed up" (Frank) — it carries
// `tilt: head.tilt`, so the muzzle continues the skull's own nose-down line
// instead of jutting off the jaw as a horizontal beak, which is what a
// 45-degree head over the shared plan's level snout used to read as.
// The ears' up/fwd aim at the box's top-face centre (the same face-centre
// numbers as before: up 0.584, fwd 0.664), but since EARS ROOT ON THE SKULL
// (quadruped.js) they are a DIRECTION now, not a position — the shared plan
// intersects that aim ray with the tilted box itself and roots each ear on
// the face it exits, pricked up-and-forward along the poll's own normal.
// With head = { hh: 0.125, d: 0.28, fwd: 0.62, up: 0.54, tilt: 0.785 } that's
// snout (0.441, 0.719) and ears (0.584, 0.664), used below.
export function makeHorse({ height = 1.5, color = INK, seed = 45 } = {}) {
  const { group, tail } = makeQuadruped({
    height, color, seed,
    bodyR: 0.19, bodyLen: 0.86, bodyDrop: 0.08,
    // the slimmest legs of any species in the kit. legTaper > 1 narrows
    // toward the FOOT (legTaper < 1, the old value, is inverted from
    // anatomy — quadruped.js's own note), which reads as a slender cannon
    // bone rather than a post.
    legH: 0.64, legR: 0.040, legTaper: 1.25, hipX: 0.13, hipZ: 0.34,
    // long, thick where it leaves the chest, tapering toward the head (the
    // plan already tapers it: radiusTop is 0.85x radiusBottom)
    neck: { r: 0.085, len: 0.60 },
    // a SMALL head — the neck is what should read, not the skull — nosed
    // down at very close to 45 degrees
    head: { shape: 'box', w: 0.095, hh: 0.125, d: 0.28, fwd: 0.62, up: 0.54, tilt: 0.785 },
    snout: { r0: 0.035, r1: 0.052, len: 0.24, fwd: 0.719, up: 0.441, tilt: 0.785 },
    ears: { r: 0.026, h: 0.095, x: 0.045, up: 0.584, fwd: 0.664, tilt: 0.30 },
    // a hanging strand rather than a stiff rod: it settles with a real joint
    // from the verlet warmup instead of one rigid cylinder. Two segments
    // (one mesh) would be indistinguishable from 'stiff'; three is the
    // fewest that actually shows a bend, and the cheapest that fits budget.
    tail: { kind: 'strand', segments: 3, length: 0.52, thickness: 0.045, up: 0.14, back: 0.62 },
  });
  group.name = 'horse';
  return {
    group,
    tail,
    update(dt, simTime) { tail && tail.update(dt, simTime); },
  };
}
