import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { hash1, noise1 } from '../util/noise.js';
import { makeQuadruped, earShell, trianglesOf, under, ahead } from './quadruped.js';
import { skullGeometry } from './skull.js';
import { stitch, ringQuads } from './loft.js';

// Hyakujo's fox (case 2): the dog's body plan run slim and low. Three things
// carry the silhouette at distance, and a fox that misses any of them reads as
// a small dog:
//
//   1. LOW and LONG. A fox is a line held just off the ground, not a box on
//      legs. Short legs under a long body.
//   2. A short pointed muzzle under big upright triangular ears. The head is
//      ONE wedge (skull.js): a skull with real depth and cheek to it, drawn
//      out to a point with barely a stop — a ball with a spout on it was a
//      toy's head, the dog's blunt muzzle under a brow is the other animal,
//      and a wedge with no skull behind it is a needle on the end of a neck.
//      The ears are most of the head's outline: taller than the skull is
//      deep, and BROAD at the base from the side as well as the front. Tall
//      and thin they were a hare's, or a pair of horns. The neck under it is
//      slim, with a ruff of hair down its front (THE RUFF), so the head sits
//      over the chest's own mass rather than on a stalk or a column.
//   3. THE BRUSH. A fox is mostly tail, and the brush is the biggest single
//      shape on it. It leaves the rump level with the back and falls away
//      behind in one arc, swelling through its middle to about the depth of
//      the body and drawn to a point not far off the ground. Never above the
//      back — cocked up is the dog's line, and the two animals are told apart
//      by that at any distance. A thin tail reads as a cat, and a straight
//      one as a bar stuck in the animal.
//
// Faces +z like every quadruped in the kit. Built on makeQuadruped so the
// leg-to-belly join is computed rather than guessed (see THE LEG RULE there),
// then the skull and the brush are lifted onto pivots of their own so the koan
// can turn them without touching the shared body plan.

// Proportions in units of `height`. Named, because the tail anchor below is
// DERIVED from them — hand-tuned offsets drift the moment anything changes.
const LEG_H = 0.42, BODY_DROP = 0.17;
const BODY_Y = LEG_H + BODY_DROP;        // height of the body's axis
const BODY_R = 0.16, BODY_LEN = 0.66;

// THE BRUSH, root to tip along its own centre line: [y, z, depth, half-width]
// in heights, y and z measured from the root (the hinge it sweeps about), the
// last row being the tip itself. `depth` is the half-thickness seen from the
// side, laid square to the line, so the two outlines are the line offset
// either way by it; the brush is deeper than it is wide, because seen from
// above a round one of this depth is wider than the animal carrying it.
// The body plan's own stiff tail is a straight loft and cannot bend, so the
// fox builds this one itself.
const BRUSH_ROOT = [0.065, -0.38];      // [above the body's axis, z] — inside the rump
const BRUSH = [
  [0.0, 0.0, 0.085, 0.07],
  [-0.045, -0.15, 0.125, 0.1],
  [-0.15, -0.31, 0.175, 0.125],
  [-0.26, -0.455, 0.17, 0.12],
  [-0.385, -0.61, 0.1, 0.075],
  [-0.49, -0.755, 0, 0],
];

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). Read down the
// `top` column: a flat crown and then one long fall to the nose, with the
// stop no more than a change of slope. The half-widths are the other half of
// it — broad at the cheek and pinched hard just ahead of it, so from the front
// and from above the face is a triangle. BROAD means most of the width of the
// trunk behind it: a skull much narrower than the body is a snout on a neck
// from in front, with the ears standing wider than the head they grow from.
const SKULL = [
  [-0.1, 0.076, -0.066, 0.095],
  [-0.03, 0.106, -0.084, 0.135],
  [0.04, 0.1, -0.078, 0.118],
  [0.1, 0.06, -0.062, 0.062],
  [0.165, 0.034, -0.048, 0.037],
  [0.225, 0.016, -0.038, 0.025],
];
const SKULL_BACK = [0.006, -0.128];     // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.013, 0.246];
const HEAD_NOSE_DOWN = 0.1;             // rad the whole head is carried nose-down
// The skull hinges straight below the point the neck ends on: an offset fore
// or aft swings the cheek off the end of the neck as the head turns.
const HINGE_DOWN = 0.02;                // x height
// AN EAR IS A BROAD SHELL RISING OUT OF A CORNER OF THE SKULL (quadruped.js,
// earShell), each point [x, y, z] in heights from the head's origin, in the
// skull's own frame, for the ear on +x. The base ring is `outer`, `inner`,
// `back` in that order, all buried: `outer` in the widest part of the head, so the ear's
// outer edge comes up out of the cheek and carries the side of the head on
// upward; `inner` under the crown, leaving a flat of crown between the pair;
// `back` behind and between, which is the ear's depth from the side — broad
// from there too, or it is a triangle from the front and a spike in profile,
// and profile is how this animal is usually seen. The second ring bows the
// outer edge a little on the way to the tip. The plan's cone could not make
// this join: its round base, wide enough to read as an ear, hung out past a
// skull that falls away beside its crown, and showed from in front as a flap
// beside the head with paper under it.
//
// `hinge` is the point the flick turns about, and the flick tips the ear
// BACK. It sits forward in the base, so most of the base swings deeper into
// the skull and only what is ahead of it can lift; and not far above `outer`,
// because what hangs below the hinge swings forward, and the skull narrows
// ahead of its cheek. `outer` is set in from the cheek by just the margin
// that swing needs — further in, and the ear's edge steps in from the head's.
const EAR = {
  tip: [0.137, 0.305, -0.055],
  rings: [
    [[0.127, 0.015, -0.03], [0.012, 0.075, 0.03], [0.055, 0.03, -0.098]],
    [[0.146, 0.125, -0.04], [0.05, 0.158, 0.006], [0.088, 0.135, -0.092]],
  ],
  root: [0.08, -0.02, -0.04],
  hinge: [0.07, 0.035, -0.01],
};

// THE RUFF: hair under the throat and down the front of the chest. Drawn as
// the neck's own depth it made a thick neck that came down to a point at the
// chest; so the neck is slim, and the ruff is a curtain of its own laid down
// the front line from under the jaw to the chest ahead of the front legs,
// narrower than the neck it grows from and narrowing again to its outer
// edge, which is a few soft points — the buffalo's beard, smaller and
// gentler. It is hair lying CLOSE on the throat: a few soft tufts that hang
// DOWN the front line, each tip standing only a little off the line where it
// hangs, so the front line still runs from the chin down to the chest in one
// slope. Stood out ahead of the line it was a bib jutting forward off a
// throat that slopes back, ending over the chest in a step; and a tuft that
// falls further than the run to the notch below it folds its own strip of
// faces back over that notch, which from any side is a glitch, not hair.
//
// Its outer edge, chest to jaw: [where along that run (by height), how far
// the edge stands off the front line at the height it hangs to (x height),
// how far it hangs below where it grows (x height)]. A tuft's tip alternates
// with a notch lying nearly on the line; the two ends are drawn into the body.
const RUFF = [
  [0.0, -1, 0], [0.3, 0.018, 0.034], [0.5, 0.004, 0], [0.76, 0.014, 0.028], [1.0, -1, 0],
];
const RUFF_LOW = 0.02;           // how far over the front leg's top it starts, x height
const RUFF_HIGH = 0.04;          // how far under the head's hinge it ends, x height
const RUFF_W = [0.05, 0.04];     // half-width at its foot, on the chest and under the jaw, x height
const RUFF_SINK = 0.012;         // how far its foot is buried behind the front line, x height

const STIR = 2.4;                        // seconds for one whole response

// A deep fold at the hock: a fox stands crouched over its hind legs, and the
// angle is most of what keeps it from reading as a small dog on stilts. The
// hock stands well behind the thigh, so the back of the leg dips forward
// above it, and the cannon under it is near plumb (`rake`) — leaned forward
// to the hip it was a second slope where a fox has an upright pin.
const KNEE = 0.45;                       // rad, hind hock bend

export function makeFox({ height = 0.45, color = INK_LIT, seed = 2 } = {}) {
  const { group, material } = makeQuadruped({
    height, color, seed,
    bodyR: BODY_R, bodyLen: BODY_LEN, bodyDrop: BODY_DROP,
    // deep at the chest and tucked at the flank, with the croup carried as
    // high as the withers: a back that falls to the rump is a dog standing.
    // The section is most of a barrel (`barrel`) — full in the rib and broad
    // over the back, but finer than the dog's — and the shoulder ends at a
    // girth behind the elbow. Its underside is a keel (`keel`), turning under
    // on a curve rather than at a corner onto a floor.
    // Narrow, but not a blade: from the front the chest is a little over a
    // quarter of the animal's height across, and the legs stand under its
    // sides with a gap between them.
    torso: { chest: 1.35, loin: 0.62, withers: 1.0, back: 0.92, croup: 1.0, slab: 1, barrel: 0.7, girth: 0.16, keel: 1, haunch: 1.3, shoulderW: 0.86, barrelW: 0.97, hipW: 0.86 },
    legBury: .16,
    // FINE LIMBS. A fox's front leg is under a fifth of its chest's depth
    // below the knee, and the forearm over it is a slim column (`elbow`) that
    // opens both ways into the chest over a long run (`flare`, `drop`): a
    // fox's forearm edges part gently all the way up rather than flaring at
    // the elbow. `legR` scales the whole leg and `legTaper` the forearm
    // alone, so the shoulder, thigh and paw — stated as multiples of `legR`
    // — are raised to keep the masses they had. The shoulder is the chest's
    // own side come down to the leg (`torso.slab`). The leg stands forward
    // under the breast (`frontSet`): further back, the chest jutted ahead of
    // it as a keel with the leg's front line meeting it in a notch.
    //
    // THE HAUNCH IS THE TRUNK'S (`torso.haunch`): the trunk hangs down over
    // each hind leg toward the stifle, so the thigh is the body's own surface
    // from the croup down and only the gaskin leaves it. A thigh hung under
    // the belly line showed its top as a pale plate under the trunk's dark
    // underside, with a step at the rump; and it is not stood out of the
    // flank (`proud`), or it breaks out through the side of the haunch.
    legH: LEG_H, legR: 0.047, legTaper: 0.76, hipX: 0.08, hipZ: 0.31,
    legs: { knee: KNEE, shoulder: 3.6, thigh: 3.7, proud: 0, foot: 1.5, hindSet: 0.09, frontSet: 0.07, point: 0.5, flare: 0.9, drop: 0.45, elbow: 1.3, rake: 0.15 },
    // A SLIM NECK, with the ruff hung on it as hair (see THE RUFF). The
    // throat leaves the breast well up the chest (`root`) and the neck spends
    // its depth early (`taper`): drawn as a deep neck from a low breast, the
    // ruff was neck, thick all the way up and coming down to a point at the
    // chest, with a short step where the chest met the front leg. Its end
    // still has to fit inside the skull it enters, turned or not. `ease`
    // carries the root's top up the nape, so back, withers and nape are one
    // line: left under the withers it is a dip just where the neck begins.
    neck: { r: 0.066, w: 0.9, root: 0.45, set: 0.05, taper: 1.3, arch: 0.02, ease: 0.4 },
    // The plan's ball only says where the head is carried — forward, and a
    // little above the back — and how far it is nosed down; its geometry is
    // replaced by the loft below. No snout: the muzzle is that loft's front.
    head: { shape: 'sphere', r: 0.1, fwd: 0.56, up: 0.215, tilt: HEAD_NOSE_DOWN },
    // The plan's cones only say that there are two ears; their shape and
    // their hinges are stated against the skull below (see EAR).
    ears: { r: 0.03, h: 0.1, x: EAR.hinge[0], y: EAR.hinge[1], z: EAR.hinge[2], tilt: 0 },
    // no plan tail: the brush is built below, on its own hinge
  });
  group.name = 'fox';

  // ---- the skull, onto its own hinge -----------------------------------
  // makeQuadruped hangs the head and ears straight off the body, which is
  // right for a body plan and useless for a look. Re-parent them onto a pivot
  // under the end of the neck; the neck stays behind, buried, so the head
  // turns against it instead of dragging it along. The pivot is read off the
  // head the plan placed, so it follows the head when the carriage is retuned.
  const headMesh = group.children.find((c) => c.name === 'head');
  headMesh.geometry.dispose();
  headMesh.geometry = skullGeometry(SKULL, { unit: height, back: SKULL_BACK, nose: SKULL_NOSE });
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(0, headMesh.position.y - HINGE_DOWN * height, headMesh.position.z);
  group.add(headPivot);
  for (const part of group.children.slice()) {
    if (part.name === 'head' || part.name === 'ear') {
      part.position.sub(headPivot.position);
      headPivot.add(part);
    }
  }
  // The ears are stated in the skull's frame and the skull is carried nose
  // down, so each shell goes through the head's own transform and is then
  // hung from its hinge, which is all the ear mesh's own transform is: the
  // flick is a plain turn about that point.
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  headMesh.updateMatrix();
  for (const ear of ears) {
    const mirror = ear.position.x < 0;
    const hinge = new THREE.Vector3((mirror ? -1 : 1) * EAR.hinge[0], EAR.hinge[1], EAR.hinge[2])
      .multiplyScalar(height).applyMatrix4(headMesh.matrix);
    ear.position.copy(hinge);
    ear.rotation.set(0, 0, 0);
    ear.geometry.dispose();
    ear.geometry = earShell(EAR, { unit: height, mirror, matrix: headMesh.matrix })
      .translate(-hinge.x, -hinge.y, -hinge.z);
  }

  // ---- the ruff, into the body's own mesh --------------------------------
  // see THE RUFF above. It is laid against the throat as it stands, and the
  // head turns above it: it hangs from the neck, which stays behind.
  {
    const body = group.children.find((c) => c.name === 'body');
    const solid = trianglesOf(body);
    const legTop = group.children.find((c) => c.name === 'leg' && c.position.z > 0).position.y;
    const y0 = legTop + RUFF_LOW * height, y1 = headPivot.position.y - RUFF_HIGH * height;
    const P = body.geometry.getAttribute('position');
    const base = P.count, pos = Array.from(P.array), idx = Array.from(body.geometry.index.array);
    const quads = [], caps = [];
    const at = (x, y, z) => pos.push(x - body.position.x, y - body.position.y, z - body.position.z);
    RUFF.forEach(([u, out, hang], i) => {
      const y = y0 + (y1 - y0) * u;
      const w = (RUFF_W[0] + (RUFF_W[1] - RUFF_W[0]) * u) * height;
      // sunk where its own edges meet the front line, which turns back toward
      // its sides; a foot laid from the middle stands out of it at its corners
      const side = ahead(solid, w, y);
      const foot = (Number.isFinite(side) ? side : ahead(solid, 0, y)) - RUFF_SINK * height;
      const fall = hang * height;
      // off the line where the tip hangs, not where it grows: the throat
      // slopes back going down, so a tip measured from above stands off it by
      // the slope as well
      const edge = out < 0 ? foot : Math.max(foot, ahead(solid, 0, y - fall) + out * height);
      at(-w, y, foot); at(0, y - fall, edge); at(w, y, foot);
      if (i === 0) return;
      ringQuads(quads, base + (i - 1) * 3, base + i * 3, 3);
    });
    const end = base + (RUFF.length - 1) * 3;
    caps.push(base, base + 2, base + 1, end, end + 1, end + 2);
    body.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    // It was wound inside out, every face turned in toward the throat, so
    // what showed of it was its far side seen through the near one: a
    // glitch rather than a ruff. It is its own closed piece, so it is turned
    // to face out by its own volume (tests/symmetry.test.js holds it there).
    body.geometry.setIndex(idx.concat(stitch(pos, quads, caps, { outward: true })));
    body.geometry.computeVertexNormals();
    body.geometry.computeBoundingBox();
    body.geometry.computeBoundingSphere();
  }

  // ---- the brush, on its own hinge --------------------------------------
  // The hinge is the root, buried in the rump, and the mesh hangs from it
  // untransformed: the sweep turns the whole arc about the point it grows
  // from.
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(0, (BODY_Y + BRUSH_ROOT[0]) * height, BRUSH_ROOT[1] * height);
  group.add(tailPivot);
  const tailMesh = new THREE.Mesh(brushGeometry(BRUSH, height), material);
  tailMesh.name = 'tail';
  tailPivot.add(tailMesh);

  let look = 0;          // the head's resting bearing, set by the koan
  let stir = 0;          // 1 -> 0 across one response
  let notices = 0;
  let yaw = 0, sweep = 0;

  // Everything below is a pure function of (simTime, stir). No wall clock, no
  // random: two foxes on the same seed pose identically forever.
  function update(dt, simTime) {
    if (stir > 0) stir = Math.max(0, stir - dt / STIR);
    const p = 1 - stir;                                   // 0 -> 1 across the response
    const swell = Math.sin(Math.PI * p);                  // out and back; 0 at rest
    const flick = Math.sin(Math.PI * Math.min(1, p * 3.4)); // spent in the first third

    // idle: the head drifts. Never still, never busy.
    yaw = look
      + (noise1(simTime * 0.21 + seed * 1.7, seed) - 0.5) * 0.17
      + swell * 0.42;
    headPivot.rotation.y = yaw;
    headPivot.rotation.x = (noise1(simTime * 0.16 + 5.5, seed + 3) - 0.5) * 0.06 - swell * 0.05;

    // ears: each on its own slow cycle, so they never twitch in unison, plus a
    // hard flick when something is noticed
    ears.forEach((ear, i) => {
      const ph = simTime * 0.31 + i * 0.57 + hash1(i + 1, seed);
      const w = ph - Math.floor(ph);
      const twitch = w < 0.14 ? Math.sin(Math.PI * (w / 0.14)) : 0;
      ear.rotation.x = -(twitch * 0.18 + flick * (i === 0 ? 0.44 : 0.28));
    });

    // the brush: a slow sweep that outlasts the ears
    sweep = Math.sin(simTime * 0.37 + seed) * 0.05
      + (noise1(simTime * 0.19 + 2.3, seed + 7) - 0.5) * 0.10
      + swell * 0.34;
    tailPivot.rotation.y = sweep;
    tailPivot.rotation.x = -swell * 0.09;
  }

  update(0, 0);

  return {
    group,
    head: headPivot,
    tail: tailPivot,
    ears,
    // where the fox is looking when nothing has disturbed it, in its own frame
    setLook(a) { look = a; update(0, 0); return this; },
    // an ear, a turn of the head, one sweep of the brush. Then back to nothing.
    notice() { stir = 1; notices++; },
    noticed: () => notices,
    stir: () => stir,
    headYaw: () => yaw,
    tailYaw: () => sweep,
    update,
  };
}

// One closed loft along a curved centre line in the animal's side plane. Each
// ring is an ellipse standing across the brush, square to the line where it
// crosses it, with a vertex at its top and at its bottom — so the side
// outline is exactly the line offset by each row's depth, the same cut as the
// trunk and the skull. The root is fanned shut on a point further inside the
// rump and the far end on the tip, so the mesh is closed.
function brushGeometry(rows, unit, seg = 8) {
  const last = rows.length - 1;                       // the tip: an apex, not a ring
  const pos = [], idx = [];
  for (let i = 0; i < last; i++) {
    const a = rows[Math.max(i - 1, 0)], b = rows[i + 1];
    let dy = b[0] - a[0], dz = b[1] - a[1];
    const n = Math.hypot(dy, dz) || 1; dy /= n; dz /= n;
    const [y, z, r, w] = rows[i];
    for (let j = 0; j < seg; j++) {
      const t = (j / seg) * Math.PI * 2, sn = Math.sin(t);
      pos.push(Math.cos(t) * w * unit, (y + sn * dz * r) * unit, (z - sn * dy * r) * unit);
    }
  }
  const quads = [];
  for (let i = 0; i < last - 1; i++) ringQuads(quads, i * seg, (i + 1) * seg, seg);
  const dy0 = rows[1][0] - rows[0][0], dz0 = rows[1][1] - rows[0][1];
  const p0 = pos.length / 3;
  pos.push(0, (rows[0][0] - 0.4 * dy0) * unit, (rows[0][1] - 0.4 * dz0) * unit);
  for (let j = 0; j < seg; j++) idx.push(p0, (j + 1) % seg, j);
  const p1 = pos.length / 3;
  pos.push(0, rows[last][0] * unit, rows[last][1] * unit);
  const e = (last - 1) * seg;
  for (let j = 0; j < seg; j++) idx.push(p1, e + j, e + (j + 1) % seg);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(stitch(pos, quads, idx));
  geo.computeVertexNormals();
  return geo;
}
