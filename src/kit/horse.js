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
//      1.17x withers (was 1.4x — llama). ONE PIECE now: the box skull +
//      cylinder muzzle pair read as parts ("if there was a way to nail the
//      vertices together to create a smoother shaped head" — Frank), so the
//      head is a single koi-style ring loft from poll to nostril, tapering
//      continuously, tilted down the neck line by the same head.tilt. The
//      snout mesh is GONE (11 meshes now, was 12 — k45's frozen budget only
//      breathes easier).
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
// Mesh ledger (11, was 12 — the snout merged into the head loft):
//   body, front-leg pair (merged), 2 thighs, 2 shins, neck, head,
//   ear pair (merged), 2 tail strand segments.
const NECK_LEAN = Math.PI / 4;   // off vertical, chest anchor -> head centre
const NECK_RISE = 0.28;          // the vertical run of that line, x height
const BODY_PITCH = 0.06;         // rad nose-down: deep chest, belly climbs aft
const KNEE = 0.28;               // rad, hind hock fold (low: THIGH_RUN in the plan)

// The shared plan's proportions this file derives against (quadruped.js).
const LEG_H = 0.62, BODY_DROP = 0.05, BODY_LEN = 0.6, BODY_R = 0.195;

export function makeHorse({ height = 1.5, color = INK, seed = 45 } = {}) {
  // The plan's own neck anchor, in units of height: mid-chest, forward.
  const bodyY = LEG_H + BODY_DROP;
  const cy = bodyY + 0.04;
  const cz = 0.4 * BODY_LEN;
  // Head centre = anchor + the stated rise along the stated lean.
  const headUp = (cy - bodyY) + NECK_RISE;
  const headFwd = cz + NECK_RISE * Math.tan(NECK_LEAN);

  // A SMALL head, nosed down so the muzzle keeps falling along the neck's line.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: headFwd, up: headUp, tilt: 0.58 };

  const { group, tail } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    // the slimmest legs in the kit; legTaper > 1 narrows toward the FOOT
    // (a slender cannon bone, not a post — quadruped.js's own note)
    legBury: .2,
    legH: LEG_H, legR: 0.04, legTaper: 1.5, hipX: 0.1, hipZ: 0.31,
    legs: { knee: KNEE },
    // r/len still size the plan's mesh; the wedge taper is re-cut below
    neck: { r: 0.10, len: 0.50 },
    head,
    // no snout: the muzzle is the front half of the single head loft below.
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): rooted on the
    // poll — just inside the tilted crown of the head loft — and laid well
    // out (1.135 off vertical), the pinned-back read the reference has.
    ears: { r: 0.025, h: 0.085, x: 0.02, y: 0.06, z: -0.04, tilt: .5 },
    // off the CROUP: root on the rump's top-rear, just under the pitched
    // barrel's surface, so the strand falls from the top line — not a stub
    // stuck at rear-centre height (the old read)
    tail: { kind: 'strand', segments: 3, length: 0.4, thickness: 0.04, up: 0.135, back: 0.41 },
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
  if (tail) tail.group.rotation.x = 0.6;

  // ---- ONE head: poll to nostril in a single loft -------------------------
  // The box skull + cylinder muzzle read as two parts bolted together; this
  // nails the vertices into one continuous form (Frank's ask). Rings of
  // [z, halfW, halfH, yOff] in units of height, head-local: +z out the nose,
  // the mesh transform still carrying head.tilt down the neck line. Full at
  // the cheek, one unbroken taper to a blunt nostril — same koi-style loft,
  // same half-step spin so a flat facet (not an edge) faces top and sides.
  // Replacing the box geometry moves nothing: position, tilt, and the ears'
  // solved roots on the poll all stay exactly where the plan put them.
  const HEAD_RINGS = [
    [-0.105, 0.030, 0.042, 0.004],    // poll, rounding away behind
    [-0.070, 0.040, 0.0525, 0.000],   // skull at its fullest (the old box)
    [-0.005, 0.040, 0.050, -0.002],   // cheek and jaw
    [0.060, 0.032, 0.040, -0.006],    // the taper begins
    [0.130, 0.026, 0.031, -0.010],
    [0.205, 0.020, 0.023, -0.012],    // nostril end, blunt — the old snout tip
  ];
  const headMesh = group.children.find((c) => c.name === 'head');
  {
    const SEG = 8, pos = [], idx = [];
    const ringScale = 1.3;
    for (const [z, w, hh, yo] of HEAD_RINGS) {
      for (let j = 0; j < SEG; j++) {
        const a = ((j + 0.5) / SEG) * Math.PI * 2;
        pos.push(ringScale * Math.sin(a) * w * height, ringScale * (Math.cos(a) * hh + yo) * height, z * height);
      }
    }
    for (let i = 0; i < HEAD_RINGS.length - 1; i++) {
      const a = i * SEG, b = a + SEG;
      for (let j = 0; j < SEG; j++) {
        const j2 = (j + 1) % SEG;
        idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
      }
    }
    // caps: a reversed fan at the poll (the start of the loft) and a fan at
    // the nostril plane (its end) — the same pattern the koi's tail cap uses
    const first = HEAD_RINGS[0], back = HEAD_RINGS[HEAD_RINGS.length - 1];
    const poll = pos.length / 3;
    pos.push(0, first[3] * height, first[0] * height);
    for (let j = 0; j < SEG; j++) idx.push(poll, j, (j + 1) % SEG);
    const nose = pos.length / 3;
    pos.push(0, back[3] * height, back[0] * height);
    const l0 = (HEAD_RINGS.length - 1) * SEG;
    for (let j = 0; j < SEG; j++) idx.push(nose, l0 + (j + 1) % SEG, l0 + j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    headMesh.geometry.dispose();
    headMesh.geometry = geo;
  }

  // ---- the neck wedge ---------------------------------------------------
  // The plan cuts every neck at a fixed 0.85x taper — a pipe. Re-cut this one
  // as a wedge: broad at the chest, narrow at the poll. Same length, same
  // transform (the plan already aimed it chest -> head), same name/material.
  const neck = group.children.find((c) => c.name === 'neck');
  neck.geometry.dispose();
  neck.geometry = new THREE.CylinderGeometry(0.043 * height, 0.10 * height, 0.40 * height, 7);
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
