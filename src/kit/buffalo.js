import * as THREE from '../../lib/three.module.js';
import { WASH } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { mergeSimple } from './scatter.js';

// A water buffalo (case 38): the shared body plan, run heavy. What carries the
// silhouette, in the order it reads at fog distance:
//
//   1. HEAVY FOREQUARTERS. The withers are the highest point of the animal and
//      the back falls away from them to the croup — one line, part of the
//      trunk's own profile (`torso.withers` over `torso.croup`). The shoulder
//      mass used to be domes riding on a barrel, and two domes on a sausage is
//      a pig with something on its back. The fall is LARGE, and it is spent
//      evenly along the back: a level top with a rise at the front is a long
//      box, however deep the chest under it. The plan's own middle sections
//      hold a back nearly level between two steeper runs, so this one is
//      stated as a single sagging line instead (`torso.sag`).
//   2. THE HEAD HANGS LOW AND NOSES DOWN. The poll is carried well under the
//      withers on a short thick neck, so the nape FALLS from the shoulders to
//      the skull; and the head itself slopes on down from poll to muzzle. Low
//      but level is a drawer pulled out of the chest, and level but high is a
//      dog. The neck needs no angle of its own — it runs from the shoulders to
//      wherever the head is — but the forehead must fall STEEPER than the nape
//      does: at the same slope the two are one cone from shoulder to nose, and
//      the head is not there at all.
//   3. THE HEAD IS A DEEP BLUNT BLOCK: broad flat forehead, deep jaw, and a
//      muzzle that keeps most of the skull's depth and breadth and ends
//      square. Its mass is DEPTH and BREADTH. A head that gets its size from
//      length and narrows to the nose is an anteater's; a ball with a muzzle
//      stuck on it is a toy whatever its size.
//   4. THE HORNS ARE A WIDE CRESCENT LAID BACK. They leave the sides of the
//      poll going straight out, then sweep back along the neck and turn in at
//      the tips, always reaching further sideways than they rise. Horns that
//      stand up are a goat's from the front and a pair of ears from the side;
//      these are stated as a path rather than a spike with a lean so that
//      cannot come back by retuning an angle. But DEAD FLAT IS WRONG TOO: the
//      nape climbs from the low poll to the withers, and a horn lying level
//      runs along inside that line — from any side-on camera the animal was
//      hornless, and a hornless buffalo is a bear. So the path climbs with the
//      nape and a little faster, the tips come clear of it just under the
//      height of the withers, and the neck is bowed DOWN (`neck.arch` below
//      zero) to open the gap they show through.
//   5. SMALL EARS, UNDER THE HORNS, held out and a little down. They are what
//      tells the horns from ears: with both present the big pair cannot be the
//      ears.
//   6. A DEEP BARREL ON SHORT STURDY LEGS, with little tuck: the belly line
//      rises aft, but this is not a greyhound. The trunk is most of his
//      height; the legs are what is left under it, and they are limbs, far
//      slimmer than the trunk is deep. Behind, the rump turns over and down
//      to the buttock (`torso.round`) rather than ending in a corner, and the
//      thin tail comes out of the back of that turn and hangs to a tuft.
//
// Skull, horns and ears are all placed in the HEAD'S OWN FRAME (+z out the
// nose, +y out of the forehead), which the plan positions and tilts. Move or
// re-tilt the head and everything on it follows — a horn base left behind
// reads as horns sprouting from the neck.
//
// The tail is a verlet strand, the one part of him that will not pass through
// the enclosure. Returns a handle so the koan can tug it.

// Where the head is carried: its centre against the body's axis, x height, and
// how far it noses down off level (radians).
const HEAD_UP = 0.04;
const HEAD_FWD = 0.79;
const HEAD_TILT = 1.1;

// How far the back sags under the straight line from croup to withers, at
// its middle (the plan's `torso.sag`, x bodyR): a little, so the shoulder
// stands up out of the back rather than the back being a ramp. Much more and
// the withers are a dome on a barrel again.
const BACK_SAG = 0.04;

// The skull, poll to nostril: [z, half-width, top, bottom] in units of height,
// head-local. The top row is the forehead line and is kept nearly straight —
// that plane is what the horns continue. The bottom row is deepest at the jaw,
// just ahead of the centre, where the neck's throat line arrives, and gives
// up little of that on the way to the nose. The rings sit about evenly either
// side of the origin in depth, because that is where the neck's last ring is
// centred and it has to end inside them.
const HEAD_RINGS = [
  [-0.13, 0.100, 0.120, -0.060],   // poll, closing behind the horn bases
  [-0.06, 0.135, 0.155, -0.140],   // forehead at its broadest
  [0.05, 0.132, 0.150, -0.170],    // cheek and jaw
  [0.17, 0.112, 0.135, -0.135],    // the face narrows a little
  [0.30, 0.104, 0.125, -0.125],    // ...and holds: a broad, deep muzzle
  [0.37, 0.094, 0.112, -0.108],    // blunt end
];

// One horn (the +x one), base to tip, as offsets from its base in the ANIMAL'S
// frame, x height: [out, up, forward, radius]. Out first, then back, then the
// tip turning in and hooking up. `up` stays under `out` all the way, and the
// last of it has to clear the nape seen from the side — see 4 above before
// flattening it.
const HORN_PATH = [
  [0.00, 0.00, 0.00, 0.062],
  [0.15, 0.035, -0.03, 0.056],
  [0.28, 0.09, -0.10, 0.047],
  [0.36, 0.15, -0.19, 0.036],
  [0.39, 0.19, -0.26, 0.023],
  [0.35, 0.235, -0.30, 0.006],
];
// THE HORN STARTS INSIDE THE SKULL, not on it. A tube whose first ring stands
// at its base has that ring's centre on the surface and half its rim in the
// air: the horn touches the head at a point and shows its own end cap from in
// front and above. So one more ring is laid before the base, at full girth, on
// the skull's mid-plane — which both horns reach, and which is inside the head
// whatever its width — drawn this share of the way from the base toward the
// centre of the forehead's section so the ring clears the forehead and the
// poll as well. What breaks the surface is then the side of the horn.
const HORN_SINK = 0.2;
// A horn is broader in its own sweep plane than it is thick: the flat face is
// what shows from above and the thin edge from the side.
const HORN_THICK = 0.68;
// head-local roots, x height: the horn on the corner of the poll, the ear on
// the side of the skull under and a little behind it
const HORN_ROOT = [0.09, 0.09, -0.08];
const EAR_ROOT = [0.105, -0.02, -0.07];
const EAR_PATH = [
  [0.00, 0.00, 0.00, 0.024],
  [0.08, -0.02, -0.02, 0.040],
  [0.17, -0.06, -0.04, 0.004],
];
const EAR_THICK = 0.5;

// A closed tube along a path of [x, y, z, r]. Each ring stands square to the
// path and is an ellipse: `r` across the path in the horizontal, `r * thick`
// in the direction nearest vertical — so a path that never stands upright
// (neither of these does) gets a ribbon lying flat.
function tube(path, seg, thick) {
  const P = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const last = P.length - 1;
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= last; i++) {
    const t = P[Math.min(i + 1, last)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
    const flat = new THREE.Vector3().crossVectors(up, t).normalize();   // horizontal, across the path
    const rise = new THREE.Vector3().crossVectors(t, flat);             // nearest vertical
    const r = path[i][3];
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      const c = Math.cos(a) * r, s = Math.sin(a) * r * thick;
      pos.push(P[i].x + flat.x * c + rise.x * s, P[i].y + flat.y * c + rise.y * s, P[i].z + flat.z * c + rise.z * s);
    }
  }
  for (let i = 0; i < last; i++) {
    const a = i * seg, b = a + seg;
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      idx.push(a + j, a + j2, b + j, a + j2, b + j2, b + j);
    }
  }
  const c0 = pos.length / 3;
  pos.push(P[0].x, P[0].y, P[0].z);
  for (let j = 0; j < seg; j++) idx.push(c0, (j + 1) % seg, j);
  const c1 = pos.length / 3;
  pos.push(P[last].x, P[last].y, P[last].z);
  for (let j = 0; j < seg; j++) idx.push(c1, last * seg + j, last * seg + (j + 1) % seg);
  return closed(pos, idx);
}

// Index a closed surface so it faces OUT whichever way its rings were walked:
// the signed volume says which, and a mirrored copy (the other horn) comes out
// right without a second winding to keep in step.
function closed(pos, idx) {
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
      - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
      + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// THE TAIL'S ROOT. The strand's first segment is a rigid stub (both its nodes
// are pinned) and its first ring is closed on a point at the root node. Rooted
// just under the surface and aimed steeply down a rump that falls away nearly
// as steeply, that ring was cut by the surface: its upper half stood out of
// the rump with the closing fan showing, and under it there was daylight
// between the stub and the buttock. Two things have to hold together, and
// they pull against each other:
//
//   - THE ROOT RING IS WHOLLY UNDER THE SURFACE. The shallower the angle
//     between the stub and the rump, the deeper the root has to go before the
//     far side of its ring is covered — so the stub leaves going mostly BACK
//     and only partly down, and it is a long one (the strand's length over
//     its segments: a longer strand is a longer stub).
//   - WHAT IS LEFT OUTSIDE CARRIES THE ROPE CLEAR. The rope hangs plumb from
//     the stub's free end, and the buttock is still going back below the
//     root. So the stub is slid along its own line — the one through the
//     plan's root — until that free end stands just behind the rump's
//     hindmost point, and the root lands wherever that puts it. More
//     clearance, or a steeper aim, and the root ring comes back out of the
//     top of the rump: tests/buffalo.test.js holds both ends.
//
// The aim is a direction; the clearance is x height.
const TAIL_AIM = [0, -0.5, -0.866];
const TAIL_CLEAR = 0.01;
const TAIL_SEGMENTS = 7;
const TAIL_LENGTH = 0.72;
// The strand is built hanging plumb from its root and then let fall; from a
// stub held this far out that is a long swing, and the strand's own warm-up
// leaves the tuft still hooked forward under the animal. These further steps
// are what it takes to come to rest.
const TAIL_SETTLE = 240;

export function makeBuffalo({ height = 1.4, color = WASH.deep, tailColor = color, seed = 37 } = {}) {
  const h = height;
  const { group, tail, material, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.38, bodyLen: 0.48, bodyDrop: 0.40,
    torso: {
      chest: 1.26, loin: 0.98, withers: 1.22, croup: 0.745, sag: BACK_SAG, round: 1,
      shoulderW: 0.95, barrelW: 1.08, hipW: 0.92,
    },
    legBury: 0.2,
    // LIMBS UNDER A MASS, NOT POSTS. Side-on, the cannon is a small fraction
    // of the chest's depth: thick enough to be near the forearm's own width
    // all the way down, the four of them are table legs and the trunk is a
    // box set on them. The bulk that makes him heavy is stated where it
    // belongs, on the masses that join the trunk — `shoulder` and `thigh` are
    // in units of the leg's radius, so slimming the leg means raising them to
    // keep the haunch — and in the taper from elbow to knee (`legTaper`).
    // The hoof is a block wider than the cannon over it.
    legH: 0.46, legR: 0.07, legTaper: 1.3, hipX: 0.17, hipZ: 0.40,
    // a shallow hock: this animal plods. The shoulder mass is kept short
    // fore-and-aft: the breast closes into the neck just ahead of the front
    // legs, and a broad one stands out past it as a ledge on the brisket.
    legs: { knee: 0.2, shoulder: 1.7, thigh: 3.4, cannon: 0.72, foot: 1.3, hindSet: 0.08 },
    // Short, deep and nearly as wide as the skull it enters. Its end ring is
    // centred on the head's own centre and must stay INSIDE the skull there,
    // so `r` is bounded by the skull's section at its origin — fatten the
    // skull before the neck. It does not slim early (`taper`) and its throat
    // starts low on the chest (`root`): a neck that thins toward the head
    // makes one cone of neck and skull. The arch is negative: a buffalo's
    // nape sags between the withers and the poll, and that sag is where the
    // horns show — which is also why the nape leaves the topline close to the
    // withers' own peak (`set`) rather than carrying their height forward.
    neck: { r: 0.13, w: 0.88, root: 0.8, set: 0.12, taper: 1.0, arch: -0.1 },
    // a placeholder the loft below replaces: the plan only has to put the head
    // where it is carried and turn it down
    head: { shape: 'box', w: 0.2, hh: 0.2, d: 0.4, fwd: HEAD_FWD, up: HEAD_UP, tilt: HEAD_TILT },
    // A thin rope with a tuft on its end: the fullness is placed near the tip
    // and kept narrow (`swellAt`, `swellSpan`). Where it roots and how it is
    // aimed: see THE TAIL'S ROOT below.
    tail: {
      kind: 'strand', segments: TAIL_SEGMENTS, length: TAIL_LENGTH, thickness: 0.045, color: tailColor,
      swell: 0.8, swellAt: 0.86, swellSpan: 0.2,
      root: TAIL_AIM,
    },
  });
  group.name = 'buffalo';

  // ---- the tail's root ----------------------------------------------------------
  // see THE TAIL'S ROOT above
  {
    const body = group.children.find((c) => c.name === 'body');
    body.geometry.computeBoundingBox();
    const zFree = body.position.z + body.geometry.boundingBox.min.z - TAIL_CLEAR * h;
    const aim = new THREE.Vector3(...TAIL_AIM).normalize();
    const stub = TAIL_LENGTH * h / (TAIL_SEGMENTS - 1);
    tail.group.position.addScaledVector(aim, (zFree - tail.group.position.z) / aim.z - stub);
    for (let i = 0; i < TAIL_SETTLE; i++) tail.update(1 / 60, i / 60);
  }

  // ---- ONE head: poll to nostril in a single loft ---------------------------
  // An 8-gon turned half a step, so a flat facet faces up (the forehead), down
  // and to each side rather than an edge; the stated half-widths and heights
  // are those facets' own distances.
  const headMesh = group.children.find((c) => c.name === 'head');
  {
    const SEG = 8, pos = [], idx = [];
    const k = 1 / Math.cos(Math.PI / SEG);
    for (const [z, w, top, bot] of HEAD_RINGS) {
      const cy = (top + bot) / 2, ry = (top - bot) / 2;
      for (let j = 0; j < SEG; j++) {
        const a = ((j + 0.5) / SEG) * Math.PI * 2;
        const sx = Math.max(-1, Math.min(1, Math.sin(a) * k)), sy = Math.max(-1, Math.min(1, Math.cos(a) * k));
        pos.push(sx * w * h, (cy + sy * ry) * h, z * h);
      }
    }
    const last = HEAD_RINGS.length - 1;
    for (let i = 0; i < last; i++) {
      const a = i * SEG, b = a + SEG;
      for (let j = 0; j < SEG; j++) {
        const j2 = (j + 1) % SEG;
        idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
      }
    }
    for (const [ring, i0] of [[HEAD_RINGS[0], 0], [HEAD_RINGS[last], last * SEG]]) {
      const c = pos.length / 3;
      pos.push(0, (ring[2] + ring[3]) / 2 * h, ring[0] * h);
      for (let j = 0; j < SEG; j++) idx.push(c, i0 + j, i0 + (j + 1) % SEG);
    }
    // the caps were wound alike and one of them faces in; `closed` only flips
    // the whole surface, so turn the nose cap to agree with the rest here
    for (let i = idx.length - 3 * SEG; i < idx.length; i += 3) {
      const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t;
    }
    headMesh.geometry.dispose();
    headMesh.geometry = closed(pos, idx);
  }

  // a head-local point, in the animal's frame (the plan's tilt noses +z down)
  const cs = Math.cos(HEAD_TILT), sn = Math.sin(HEAD_TILT);
  const onHead = ([x, y, z], sx) => new THREE.Vector3(
    sx * x * h,
    headMesh.position.y + (y * cs - z * sn) * h,
    headMesh.position.z + (y * sn + z * cs) * h);
  const side = (path, sx) => path.map(([x, y, z, r]) => [sx * x * h, y * h, z * h, r * h]);

  // ---- the horns --------------------------------------------------------------
  // Two meshes, each standing at its own base, so `horn.position` is where it
  // leaves the skull.
  // The buried ring is stated in the head's frame like the base, and carried
  // into the path's (the animal's) as an offset from that base.
  const [fz, , ftop, fbot] = HEAD_RINGS[1];
  const core = [0,
    HORN_ROOT[1] + ((ftop + fbot) / 2 - HORN_ROOT[1]) * HORN_SINK,
    HORN_ROOT[2] + (fz - HORN_ROOT[2]) * HORN_SINK];
  for (const sx of [-1, 1]) {
    const base = onHead(HORN_ROOT, sx);
    const sunk = onHead(core, sx).sub(base);
    const path = [[sunk.x, sunk.y, sunk.z, HORN_PATH[0][3] * h], ...side(HORN_PATH, sx)];
    const m = new THREE.Mesh(tube(path, 6, HORN_THICK), material);
    m.name = 'horn';
    m.position.copy(base);
    group.add(m);
  }

  // ---- the ears: one mesh for the pair ----------------------------------------
  // Nothing animates them, so the pair is a single draw. They are a part the
  // older buffalo did not have, added on purpose (rule 5 above) and paid for by
  // the pieces the single-loft head removed.
  {
    const geos = [-1, 1].map((sx) => {
      const g = tube(side(EAR_PATH, sx), 5, EAR_THICK);
      const at = onHead(EAR_ROOT, sx);
      return g.translate(at.x, at.y, at.z);
    });
    const ears = new THREE.Mesh(mergeSimple(geos), material);
    ears.name = 'ear';
    group.add(ears);
  }

  return {
    group,
    tail,
    plan,
    update(dt, simTime) { tail.update(dt, simTime); },
  };
}
