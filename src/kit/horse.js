import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { mergeSimple } from './scatter.js';

// A horse (case 45). The first model read as a llama — a neck standing nearly
// vertical off the front of a barrel, with the head perched a full extra
// withers-height in the air. The second read as a deer: right in its lean, but
// a thin wedge of a neck ending in a head no bigger than the neck's own tip.
// What says HORSE in silhouette:
//
//   1. THE NECK IS A THICK ARCHED WEDGE GROWN FROM THE SHOULDERS — deep where
//      it leaves the chest, leaning well forward, and STILL DEEP AT THE THROAT.
//      It is the trunk's own profile carried on (see quadruped.js), so there
//      is no neck part to aim: the LEAN is simply where the head is carried,
//      HEAD_UP against HEAD_FWD. A neck that has spent its taper before the
//      head is a stick with a head on the end, however deep its root — so
//      `neck.taper` is a straight wedge and `neck.r` is most of a jaw. The
//      mane is the CREST: the neck's own upper line stood fuller than the
//      wedge and bowed (see the topline block below), never strands.
//   2. A LONG HEAD, DEEP AT THE JAW, hung off the top of that line. About as
//      long as the neck is deep at its root, and hung steeper than the neck
//      leans, so the two read as two masses meeting at the throat. ONE PIECE:
//      a box skull and a cylinder muzzle read as two parts bolted together, so
//      the head is a single ring loft from poll to nostril. Its depth is in
//      the JAW: the forehead-to-nose line runs nearly straight and the
//      underline climbs to a blunt muzzle. Tapered evenly about its own axis
//      it is a wedge, not a head; made small it is a deer's.
//   3. A TRUNK CARRIED HIGH ON ITS LEGS, with WITHERS OVER A DIPPED BACK and a
//      CROUP THAT ROUNDS — `torso`, and the croup's lift below. Shallower in
//      the barrel than the heavier animals, so more of its height is leg; the
//      chest is still the deep end and the belly rises to the flank. The dip
//      is as much as the plan's own bound on a back line allows
//      (tests/quadruped.test.js). Seen from the front a horse is nearly as
//      broad as it is deep at the shoulder; much narrower and it reads as a
//      cut-out standing on edge.
//   4. LONG SLIM LEGS under real mass, STANDING UNDER THE BODY: a broad forearm
//      and thigh over wire cannons, the hind fold at a LOW hock. The hock goes
//      back only a little — enough for the corner to show. Folded further, the
//      whole hind leg becomes one diagonal propped out behind the rump and the
//      animal stops carrying its own weight.
//   5. THE TAIL IS A FULL HANK FROM THE TOP OF THE CROUP — rooted on the
//      turn of the rump (the plan's own default), leaving it backward before
//      it falls: thin at the dock, FULLEST IN ITS LOWER HALF, drawn in to a
//      blunt point below the hocks, and hanging a little back of plumb,
//      clear of the buttock. Widest just under the dock it is a club.
//
// The rump itself turns over and down in one arc (`torso.round`): the croup
// is the high point behind the back and the dock sits on the turn.
//
// Mesh ledger: body (with its neck), four legs, head, ear pair (merged), the
// tail's one skin. k45 bakes its own horse down to a single mesh with
// `bakeStatic`, but the horse is shared, and an unbaked one still spends what
// it spends.
const HEAD_UP = 0.39;            // head centre above the body's axis, x height
const HEAD_FWD = 0.69;           // ...and ahead of the animal's middle
const HEAD_TILT = 0.9;           // rad the face hangs below level
const KNEE = 0.17;               // rad, hind hock fold
const POLL_LEAN = 0.15;          // rad the neck's last section leans back off upright
const TAIL_LEAN = 0.16;          // rad the whole hank leans back off plumb
// How far the neck's upper line stands above the plan's wedge, x height: the
// ring at the skull, then the two up the neck going back. Fullest through the
// middle of the neck and nearly spent at the poll. The ring at the withers is
// NOT lifted: the front legs hang just ahead of it, so the plan's bound on a
// back line (tests/quadruped.test.js) reads that ring as the back's front end,
// and a crest carried onto it is measured as a deeper sway.
const CREST = [0.012, 0.046, 0.04];
// How far the trunk ring over the hip is lifted: the croup.
const CROUP_LIFT = 0.013;
// [z, halfW, halfH, yOff], x height — see ONE head below
const HEAD_RINGS = [
  [-0.085, 0.040, 0.058, 0.000],    // poll, rounding away behind
  [-0.030, 0.060, 0.105, -0.040],   // jaw: the deep part
  [0.045, 0.057, 0.092, -0.035],    // cheek
  [0.125, 0.046, 0.068, -0.019],    // the underline has climbed
  [0.205, 0.039, 0.050, -0.014],
  [0.270, 0.035, 0.043, -0.015],    // muzzle, blunt
];

export function makeHorse({ height = 1.5, color = INK_LIT, seed = 45 } = {}) {
  // Nosed well down: the face hangs steeper than the neck leans, so the head
  // is a mass hung off the end of the neck, not the neck's taper carried on.
  // The box is only the plan's placeholder — the loft below replaces it.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: HEAD_FWD, up: HEAD_UP, tilt: HEAD_TILT };

  const { group, tail, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.18, bodyLen: 0.59, bodyDrop: 0.055,
    torso: {
      chest: 1.1, loin: 0.74, withers: 1.28, back: 1.05, croup: 1.06, round: 1,
      shoulderW: 1.0, barrelW: 1.14, hipW: 1.06,
    },
    legBury: 0.18,
    legH: 0.62, legR: 0.055, legTaper: 1.3, hipX: 0.105, hipZ: 0.285,
    // `proud` under the plan's default: stood further out, the thigh's cap
    // breaks the flank as a dark dart at the hip. A slim cannon and a short
    // foot under a heavy forearm (`legTaper`) and thigh: a hoof, not a paw.
    legs: { knee: KNEE, shoulder: 2.0, thigh: 3.6, proud: 0.06, cannon: 0.7, foot: 1.05, frontSet: 0.04, hindSet: 0.1 },
    // `set` at nothing: the nape leaves the topline AT the withers, so the
    // withers are the corner where back turns into neck
    neck: { r: 0.068, w: 0.8, root: 0.4, set: 0.0, taper: 1.0, arch: 0.07 },
    head,
    // no snout: the muzzle is the front of the single head loft below.
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): rooted on the
    // poll, just inside the tilted crown of the head loft, and laid a little out.
    ears: { r: 0.025, h: 0.085, x: 0.03, y: 0.075, z: -0.005, tilt: 0.3 },
    // `thickness` is the dock and `swell` the hair, placed low on the strand
    // (`swellAt`) and spread over most of it (`swellSpan`): a thin root that
    // fattens is a hank hanging from a tailbone, where a thick root is a
    // club. The aim leans the dock back so the hank leaves the croup before
    // it falls — only so far: a stub aimed well out and a strand hanging
    // plumb from its end is a visible hinge.
    tail: { kind: 'strand', segments: 7, length: 0.58, thickness: 0.04, swell: 1.8, swellAt: 0.66, swellSpan: 0.6, root: [0, -1, -0.38] },
  });
  group.name = 'horse';

  // ---- the tail hangs just CLEAR of the buttock ---------------------------
  // A verlet strand can only hang plumb, and a plumb line from the croup falls
  // INSIDE the rump's own outline. The strand settles in its group's LOCAL
  // frame, so leaning the whole group back a little carries the hang clear of
  // the buttock, and the idle sway rides along. Only a little: leaned far, the
  // tail stops hanging and sticks out.
  if (tail) tail.group.rotation.x = TAIL_LEAN;

  // ---- the topline: a crest on the neck, a croup that rounds ---------------
  // The plan's trunk and neck are sections stated by a top point and a bottom
  // point, and its neck is a plain wedge between two of them. A horse's neck
  // carries its mane along the crest, and at this size that is not hair but
  // OUTLINE: the upper line of the neck stands fuller than the wedge and bows.
  // So the body's own rings are lifted along their upper half — the crest is
  // the neck's outline, not a part laid on it, and the mesh count is what it
  // was. The same lift over the hip stands the croup above the back, so it is
  // the high point the plan's round rump turns down from.
  //
  // Only ever UP and only the upper half: the legs were solved against the
  // trunk the plan built, and a ring that grows upward still contains
  // everything that was sunk in it. The rings behind the hip are left alone —
  // the plan rounds the rump with them and read the tail's root off them.
  {
    const body = group.children.find((c) => c.name === 'body');
    const P = body.geometry.getAttribute('position');
    const SEG = 8, TOP = 2, BOT = 6;            // the plan's trunk ring: vertex 2 is its top point, 6 its bottom
    const rings = (P.count - 2) / SEG;
    const lift = (ring, by) => {
      const o = ring * SEG;
      const ay = P.getY(o + TOP) - P.getY(o + BOT), az = P.getZ(o + TOP) - P.getZ(o + BOT);
      const n = Math.hypot(ay, az) || 1;
      for (const [j, k] of [[TOP - 1, Math.SQRT1_2], [TOP, 1], [TOP + 1, Math.SQRT1_2]]) {
        P.setY(o + j, P.getY(o + j) + (ay / n) * by * k * height);
        P.setZ(o + j, P.getZ(o + j) + (az / n) * by * k * height);
      }
    };
    // THE NECK MEETS THE HEAD ACROSS THE BACK OF THE SKULL, poll over throat.
    // The plan ends a neck square to its own line, and on a head hung this
    // steeply that line arrives from underneath: the neck swallows the jaw
    // and the face pokes out of the end of a tube. Stood upright, the last
    // ring puts its top in the poll and its bottom behind the jaw, so the
    // crest runs in nearly level, the throat climbs steeply, and the jaw
    // hangs below where they meet.
    {
      const o = (rings - 1) * SEG;
      const cy = (P.getY(o + TOP) + P.getY(o + BOT)) / 2, cz = (P.getZ(o + TOP) + P.getZ(o + BOT)) / 2;
      const m = Math.hypot(P.getY(o + TOP) - P.getY(o + BOT), P.getZ(o + TOP) - P.getZ(o + BOT)) / 2;
      const ay = Math.cos(POLL_LEAN) * m, az = -Math.sin(POLL_LEAN) * m;
      for (let j = 0; j < SEG; j++) {
        const sn = Math.sin((j / SEG) * Math.PI * 2);
        P.setY(o + j, cy + sn * ay);
        P.setZ(o + j, cz + sn * az);
      }
    }
    // counted from the head back, so the crest stays on the neck whatever the
    // trunk behind it is made of
    CREST.forEach((by, i) => lift(rings - 1 - i, by));
    // the croup's ring is the first one ahead of the hip, however many
    // sections the plan spends on the rump behind it
    let croupRing = 0;
    while (croupRing < rings - 1 && P.getZ(croupRing * SEG + TOP) < plan.zHip) croupRing++;
    lift(croupRing, CROUP_LIFT);
    P.needsUpdate = true;
    body.geometry.computeVertexNormals();
    body.geometry.computeBoundingBox();
    body.geometry.computeBoundingSphere();
  }

  // ---- ONE head: poll to nostril in a single loft -------------------------
  // The box skull + cylinder muzzle read as two parts bolted together; this
  // nails the vertices into one continuous form. Rings of
  // [z, halfW, halfH, yOff] in units of height, head-local: +z out the nose,
  // the mesh transform still carrying head.tilt. yOff is what puts the depth
  // in the jaw: the deep rings are dropped and the muzzle rings are not, so
  // the top line stays nearly straight while the underline climbs. Same
  // koi-style loft, same half-step spin so a flat facet (not an edge) faces
  // top and sides. Half-widths only ever narrow forward of the cheek. The
  // loft sits FORWARD of the head's own origin, which is where the neck ends:
  // the neck then arrives behind the jaw, at the throat, and not under the
  // middle of the face. Replacing the box geometry moves nothing: position,
  // tilt, and the ears' roots on the poll all stay where the plan put them.
  const headMesh = group.children.find((c) => c.name === 'head');
  {
    const SEG = 8, pos = [], idx = [];
    for (const [z, w, hh, yo] of HEAD_RINGS) {
      for (let j = 0; j < SEG; j++) {
        const a = ((j + 0.5) / SEG) * Math.PI * 2;
        pos.push(Math.sin(a) * w * height, (Math.cos(a) * hh + yo) * height, z * height);
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
