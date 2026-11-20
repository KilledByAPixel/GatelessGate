import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { mergeSimple } from './scatter.js';

// A horse (case 45). The first model read as a llama — a neck standing nearly
// vertical off the front of a barrel, with the head perched a full extra
// withers-height in the air. What says HORSE in silhouette:
//
//   1. THE NECK IS A WEDGE GROWN FROM THE SHOULDERS — deep where it leaves the
//      chest, slim at the throat, leaning well forward, crest bowed a little.
//      It is the trunk's own profile carried on (see quadruped.js), so there
//      is no neck part to aim: the LEAN is simply where the head is carried,
//      HEAD_UP against HEAD_FWD. The depth has to LAST: a neck that has spent
//      its taper by a third of the way up is a stick with a head on the end,
//      however deep its root — so `neck.taper` stays near a straight wedge
//      and `neck.root` starts the throat low on the breast.
//   2. A SMALL HEAD, carried forward off the top of that line. ONE PIECE: a box
//      skull and a cylinder muzzle read as two parts bolted together, so the
//      head is a single ring loft from poll to nostril, tilted down the neck
//      line by head.tilt. Its depth is in the JAW: the forehead-to-nose line
//      runs nearly straight and the underline climbs to the muzzle. Tapered
//      evenly about its own axis it is a wedge, not a head.
//   3. DEEP BROAD CHEST, RISING BELLY, WITHERS OVER A DIPPED BACK — all
//      `torso`. The dip is as much as the plan's own bound on a back line
//      allows (tests/quadruped.test.js); the croup stands over it as well, and
//      the rump's overhang (`bodyLen` against `hipZ`) is what rounds it. Seen
//      from the front a horse is nearly as broad as it is deep at the
//      shoulder; much narrower and it reads as a cut-out standing on edge.
//   4. LONG SLIM LEGS under real mass, STANDING UNDER THE BODY: a broad forearm
//      and thigh over wire cannons, the hind fold at a LOW hock. The hock goes
//      back only a little — enough for the corner to show. Folded further, the
//      whole hind leg becomes one diagonal propped out behind the rump and the
//      animal stops carrying its own weight.
//   5. THE TAIL HANGS FROM THE CROUP AS ONE MASS — rooted on the topline behind
//      the hip (the plan's own default), thin at the dock, full through the
//      middle, closing to a point, and falling nearly plumb just clear of the
//      buttock.
//
// Mesh ledger: body (with its neck), four legs, head, ear pair (merged), the
// tail's strand segments. k45 bakes its own horse down to a single mesh with
// `bakeStatic`, but the horse is shared, and an unbaked one still spends what
// it spends.
const HEAD_UP = 0.39;            // head centre above the body's axis, x height
const HEAD_FWD = 0.69;           // ...and ahead of the animal's middle
const KNEE = 0.17;               // rad, hind hock fold

export function makeHorse({ height = 1.5, color = INK_LIT, seed = 45 } = {}) {
  // A SMALL head, nosed down so the muzzle keeps falling along the neck's line.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: HEAD_FWD, up: HEAD_UP, tilt: 0.62 };

  const { group, tail, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.195, bodyLen: 0.59, bodyDrop: 0.05,
    torso: {
      chest: 1.25, loin: 0.76, withers: 1.2, back: 0.965, croup: 1.05,
      shoulderW: 0.92, barrelW: 1.06, hipW: 0.98,
    },
    legBury: 0.18,
    legH: 0.62, legR: 0.055, legTaper: 1.2, hipX: 0.105, hipZ: 0.285,
    // `proud` under the plan's default: stood further out, the thigh's cap
    // breaks the flank as a dark dart at the hip
    legs: { knee: KNEE, shoulder: 2.0, thigh: 2.6, proud: 0.06, frontSet: 0.04, hindSet: 0.07 },
    // `set` at nothing: the nape leaves the topline AT the withers, so the
    // withers are the corner where back turns into neck
    neck: { r: 0.072, w: 0.7, root: 0.68, set: 0.0, taper: 1.25, arch: 0.04 },
    head,
    // no snout: the muzzle is the front of the single head loft below.
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): rooted on the
    // poll, just inside the tilted crown of the head loft, and laid well out.
    ears: { r: 0.025, h: 0.085, x: 0.022, y: 0.06, z: -0.04, tilt: .5 },
    // `thickness` is the dock and `swell` the hair: a thin root that fattens
    // is a hank hanging from a tailbone, where a thick root is a club. The aim
    // leans the dock only a little back — a stub aimed well out and a strand
    // hanging plumb from its end is a visible hinge.
    tail: { kind: 'strand', segments: 5, length: 0.5, thickness: 0.045, swell: 1.9, root: [0, -1, -0.26] },
  });
  group.name = 'horse';

  // ---- the tail hangs just CLEAR of the buttock ---------------------------
  // A verlet strand can only hang plumb, and a plumb line from the croup falls
  // INSIDE the rump's own outline. The strand settles in its group's LOCAL
  // frame, so leaning the whole group back a little carries the hang clear of
  // the buttock, and the idle sway rides along. Only a little: leaned far, the
  // tail stops hanging and sticks out.
  if (tail) tail.group.rotation.x = 0.1;

  // ---- ONE head: poll to nostril in a single loft -------------------------
  // The box skull + cylinder muzzle read as two parts bolted together; this
  // nails the vertices into one continuous form. Rings of
  // [z, halfW, halfH, yOff] in units of height, head-local: +z out the nose,
  // the mesh transform still carrying head.tilt down the neck line. yOff is
  // what puts the depth in the jaw: the deep rings are dropped and the muzzle
  // rings are not, so the top line stays nearly straight while the underline
  // climbs. Same koi-style loft, same half-step spin so a flat facet (not an
  // edge) faces top and sides. Half-widths only ever narrow forward of the
  // cheek. Replacing the box geometry moves nothing: position, tilt, and the
  // ears' roots on the poll all stay exactly where the plan put them.
  const HEAD_RINGS = [
    [-0.105, 0.028, 0.036, 0.008],    // poll, rounding away behind
    [-0.060, 0.040, 0.056, -0.006],   // jaw: the deep part
    [0.000, 0.039, 0.050, -0.006],    // cheek
    [0.070, 0.030, 0.034, 0.000],     // the underline has climbed
    [0.140, 0.024, 0.026, 0.002],
    [0.200, 0.021, 0.023, 0.000],     // muzzle, blunt
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
