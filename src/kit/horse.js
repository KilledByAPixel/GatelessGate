import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { mergeSimple } from './scatter.js';

// A horse (case 45). The first model read as a llama — a neck standing nearly
// vertical off the front of a barrel, with the head perched a full extra
// withers-height in the air. What says HORSE in silhouette:
//
//   1. THE NECK IS A WEDGE GROWN FROM THE SHOULDERS — deep where it leaves the
//      chest, slim at the poll, leaning well forward, crest bowed a little. It
//      is the trunk's own profile carried on (see quadruped.js), so there is
//      no neck part to aim: the LEAN is simply where the head is carried,
//      HEAD_UP against HEAD_FWD, and the wedge is `neck.taper`.
//   2. A SMALL HEAD, carried forward off the top of that line. ONE PIECE: a box
//      skull and a cylinder muzzle read as two parts bolted together, so the
//      head is a single ring loft from poll to nostril, tapering continuously,
//      tilted down the neck line by head.tilt.
//   3. DEEP CHEST, RISING BELLY, HIGH WITHERS — all `torso`: the brisket hangs
//      well below the axis at the shoulder and the flank is tucked up ahead of
//      the hind legs.
//   4. LONG SLIM LEGS under real mass: a broad forearm and thigh over wire
//      cannons, the hind fold at a LOW hock.
//   5. TAIL OFF THE CROUP — the strand roots on the topline behind the hip (the
//      plan's own default) and is carried swept back, not hung plumb.
//
// Mesh ledger: body (with its neck), four legs, head, ear pair (merged), the
// tail's strand segments. k45 bakes its own horse down to a single mesh with
// `bakeStatic`, but the horse is shared, and an unbaked one still spends what
// it spends.
const HEAD_UP = 0.37;            // head centre above the body's axis, x height
const HEAD_FWD = 0.70;           // ...and ahead of the animal's middle
const KNEE = 0.28;               // rad, hind hock fold

export function makeHorse({ height = 1.5, color = INK_LIT, seed = 45 } = {}) {
  // A SMALL head, nosed down so the muzzle keeps falling along the neck's line.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: HEAD_FWD, up: HEAD_UP, tilt: 0.58 };

  const { group, tail, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.195, bodyLen: 0.52, bodyDrop: 0.05,
    torso: {
      chest: 1.18, loin: 0.76, withers: 1.1, back: 0.9, croup: 1.0,
      shoulderW: 0.78, barrelW: 0.95, hipW: 0.88,
    },
    // the slimmest lower legs in the kit under the broadest forearm for its
    // size: legTaper is the front leg's top-heaviness
    legBury: 0.18,
    legH: 0.62, legR: 0.055, legTaper: 1.2, hipX: 0.09, hipZ: 0.31,
    legs: { knee: KNEE, shoulder: 2.0, thigh: 2.6 },
    // narrow across, deep fore-and-aft, and slim well before the poll
    neck: { r: 0.068, w: 0.62, root: 0.5, set: 0.15, taper: 1.7, arch: 0.05 },
    head,
    // no snout: the muzzle is the front half of the single head loft below.
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): rooted on the
    // poll — just inside the tilted crown of the head loft — and laid well
    // out, the pinned-back read.
    ears: { r: 0.025, h: 0.085, x: 0.02, y: 0.06, z: -0.04, tilt: .5 },
    // full through the middle (`swell`), and leaving the dock aimed back
    // before it falls: a hank of hair, not a hinged stick
    tail: { kind: 'strand', segments: 5, length: 0.5, thickness: 0.04, swell: 1.1, root: [0, -0.8, -0.6] },
  });
  group.name = 'horse';

  // ---- the tail FLOWS off the croup --------------------------------------
  // A verlet strand can only hang plumb, and a plumb line from the croup falls
  // INSIDE the rump's own outline — the tail vanished from every angle that
  // matters (k45 sees the horse rear-three-quarter). The strand settles in its
  // group's LOCAL frame, so sweeping the whole group back turns "hanging
  // string" into "tail carried off the buttock", and the idle sway rides along.
  if (tail) tail.group.rotation.x = 0.3;

  // ---- ONE head: poll to nostril in a single loft -------------------------
  // The box skull + cylinder muzzle read as two parts bolted together; this
  // nails the vertices into one continuous form. Rings of
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
    const ringScale = 1.5;
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

  // ---- one mesh for the ears ---------------------------------------------
  // Nothing on a horse animates its ears (the fox's flick belongs to another
  // species), so the static pair bakes its transforms and merges to a single
  // mesh. The name survives ('ear') — species and cases reach in by name.
  const bakePair = (name) => {
    const pair = group.children.filter((c) => c.name === name);
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
  bakePair('ear');

  return {
    group,
    tail,
    plan,
    update(dt, simTime) { tail && tail.update(dt, simTime); },
  };
}
