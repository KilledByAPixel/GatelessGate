import * as THREE from '../../lib/three.module.js';
import { INK } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { mergeSimple } from './scatter.js';

// A horse (case 45): THE NECK IS THE WEDGE. Rebuilt against local/refs/horse.png
// after the first model read as a llama — the old neck stood nearly vertical
// (29 degrees off plumb) with the head perched 1.4 withers-heights in the air.
// What says HORSE in silhouette, counted off the reference:
//
//   1. THE NECK WEDGE — a tapered slab leaning ~45 degrees forward from deep
//      chest to poll, broad where it leaves the body, narrow at the head. The
//      shared plan aims the neck from chest anchor to head centre, so the LEAN
//      is not tuned by eye: head.up/fwd are DERIVED below from the anchor the
//      plan uses (cy = bodyY + 0.04, cz = 0.4 * bodyLen) plus a stated rise
//      and NECK_LEAN. The plan's fixed 0.85x taper is nowhere near a wedge,
//      so the neck's GEOMETRY is re-cut locally (0.043/0.10 top/base radius);
//      transform, name and material stay the plan's.
//   2. A SMALL HEAD, carried forward off the top of that line, poll around
//      1.17x withers (was 1.4x — llama). Muzzle continues the skull's own
//      nose-down line (snout.tilt = head.tilt), face-centre maths as before.
//   3. DEEP CHEST, RISING BELLY — the barrel is pitched nose-down a few
//      degrees (body.rotation.x past PI/2), so the underline climbs toward
//      the hind legs while the broad neck base fills the withers. Costs zero
//      meshes; the leg-top bury (0.06h) swallows the tilt at both axles.
//   4. SLIM LEGS with the hind fold at a LOW hock — legs.knee at last. The
//      old header left the knee off for budget; this pass PAYS for it by
//      merging the two front posts into one mesh and the two ears into one
//      (mergeSimple, transforms baked — nothing here animates them), so the
//      count holds at 12 meshes / 24 hull draws, k45's frozen 148 untouched.
//   5. TAIL OFF THE CROUP — the strand root moves up onto the rump's top-rear
//      (up 0.185, back 0.44, solved against the pitched barrel surface so the
//      join is buried, not floating), instead of a stub at rear-centre height.
//
// Mesh ledger (12, same as before the rework):
//   body, front-leg pair (merged), 2 thighs, 2 shins, neck, head, snout,
//   ear pair (merged), 2 tail strand segments.
const NECK_LEAN = Math.PI / 4;   // off vertical, chest anchor -> head centre
const NECK_RISE = 0.28;          // the vertical run of that line, x height
const BODY_PITCH = 0.06;         // rad nose-down: deep chest, belly climbs aft
const KNEE = 0.28;               // rad, hind hock fold (low: THIGH_RUN in the plan)

// The shared plan's proportions this file derives against (quadruped.js).
const LEG_H = 0.62, BODY_DROP = 0.05, BODY_LEN = 0.64, BODY_R = 0.195;

export function makeHorse({ height = 1.5, color = INK, seed = 45 } = {}) {
  // The plan's own neck anchor, in units of height: mid-chest, forward.
  const bodyY = LEG_H + BODY_DROP;
  const cy = bodyY + 0.04;
  const cz = 0.4 * BODY_LEN;
  // Head centre = anchor + the stated rise along the stated lean.
  const headUp = (cy - bodyY) + NECK_RISE;
  const headFwd = cz + NECK_RISE * Math.tan(NECK_LEAN);

  // A SMALL head, nosed down so the muzzle keeps falling along the neck's line.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: headFwd, up: headUp, tilt: 0.88 };
  const sinT = Math.sin(head.tilt), cosT = Math.cos(head.tilt);

  const { group, tail } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    // the slimmest legs in the kit; legTaper > 1 narrows toward the FOOT
    // (a slender cannon bone, not a post — quadruped.js's own note)
    legH: LEG_H, legR: 0.034, legTaper: 1.3, hipX: 0.115, hipZ: 0.31,
    legs: { knee: KNEE },
    // r/len still size the plan's mesh; the wedge taper is re-cut below
    neck: { r: 0.10, len: 0.50 },
    head,
    // the muzzle anchors at the tilted box's front-face centre and carries the
    // same tilt — DERIVED from the head, never tuned (see buffalo.js's horns)
    snout: {
      r0: 0.030, r1: 0.048, len: 0.20,
      fwd: head.fwd + (head.d / 2) * cosT,
      up: head.up - (head.d / 2) * sinT,
      tilt: head.tilt,
    },
    // aim at the tilted box's top-face centre; EARS ROOT ON THE SKULL
    // (quadruped.js) intersects the ray and roots them on the poll
    ears: {
      r: 0.022, h: 0.085, x: 0.04,
      up: head.up + (head.hh / 2) * cosT,
      fwd: head.fwd + (head.hh / 2) * sinT,
      tilt: 0.35,
    },
    // off the CROUP: root on the rump's top-rear, just under the pitched
    // barrel's surface, so the strand falls from the top line — not a stub
    // stuck at rear-centre height (the old read)
    tail: { kind: 'strand', segments: 3, length: 0.62, thickness: 0.07, up: 0.135, back: 0.46 },
  });
  group.name = 'horse';

  // ---- deep chest, rising belly ----------------------------------------
  // Pitch the barrel nose-down about its own centre. The capsule lies along z
  // (rotation.x = PI/2), so a little MORE x-rotation dips the +z (chest) end
  // and lifts the rump: the underline climbs toward the hind legs.
  const body = group.children.find((c) => c.name === 'body');
  body.rotation.x = Math.PI / 2 + BODY_PITCH;

  // ---- the tail FLOWS off the croup --------------------------------------
  // A verlet strand can only hang plumb, and a plumb line from the croup falls
  // INSIDE the rump's own outline — the tail vanished from every angle that
  // matters (k45 sees the horse rear-three-quarter). The strand settles in its
  // group's LOCAL frame, so sweeping the whole group back turns "hanging
  // string" into "tail carried off the buttock", and the idle sway rides along.
  if (tail) tail.group.rotation.x = 0.4;

  // ---- the neck wedge ---------------------------------------------------
  // The plan cuts every neck at a fixed 0.85x taper — a pipe. Re-cut this one
  // as a wedge: broad at the chest, narrow at the poll. Same length, same
  // transform (the plan already aimed it chest -> head), same name/material.
  const neck = group.children.find((c) => c.name === 'neck');
  neck.geometry.dispose();
  neck.geometry = new THREE.CylinderGeometry(0.043 * height, 0.10 * height, 0.50 * height, 7);
  // a horse's neck is deep fore-aft but narrow across — thin it laterally
  neck.scale.x = 0.8;

  // ---- pay for the hocks: two pair-merges, zero silhouette change --------
  // Nothing on a horse animates its ears or front legs (the fox's flick and
  // the walk cycles belong to other species), so each static pair can bake
  // its transforms and merge to a single mesh: -2 meshes, which is exactly
  // what legs.knee added. Names survive ('leg', 'ear') — species and cases
  // reach in by name.
  const bakePair = (name, keep) => {
    const pair = group.children.filter((c) => c.name === name && keep(c));
    if (pair.length !== 2) return;
    const geos = pair.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = new THREE.Mesh(mergeSimple(geos), pair[0].material);
    merged.name = name;
    for (const m of pair) { group.remove(m); m.geometry.dispose(); }
    group.add(merged);
  };
  bakePair('leg', (c) => c.position.z > 0);   // the FRONT posts (hinds are thighs)
  bakePair('ear', () => true);

  return {
    group,
    tail,
    update(dt, simTime) { tail && tail.update(dt, simTime); },
  };
}
