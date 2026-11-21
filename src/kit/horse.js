import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped, earShell } from './quadruped.js';
import { mergeSimple } from './scatter.js';
import { stitch, ringQuads } from './loft.js';

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
//      `neck.taper` is a straight wedge and `neck.r` is most of a jaw. But
//      it is a NECK: its fullness along the crest is the MANE, a narrower
//      thing standing on it (see the mane block below), and the neck under
//      it stays the plain wedge.
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
//   4. LONG SLIM LEGS under real mass, STANDING UNDER THE BODY: a full thigh
//      over a lean gaskin, a forearm broad at the elbow and spent by the
//      knee, wire cannons, the hind fold at a LOW hock. The slimness is the
//      CANNON's: thickened all the way down to give the legs substance, the
//      animal is a draught horse on table legs, and slimmed all the way up
//      the forearm is a stick pushed into the chest. The hock goes
//      back only a little — enough for the corner to show. Folded further, the
//      whole hind leg becomes one diagonal propped out behind the rump and the
//      animal stops carrying its own weight.
//   5. THE TAIL IS A FULL HANK FLOWING OUT OF THE CROUP — it comes out of
//      the turn of the rump as the back line carried on, runs back in an arc
//      and falls: slimmest at the dock, FULLEST IN ITS LOWER HALF, drawn in
//      to a blunt point below the hocks, and hanging a little back of plumb,
//      clear of the buttock. Widest just under the dock it is a club; and a
//      dock far narrower than the rump's own facets, closed where it is
//      pinned, is a rod pushed into the middle of one — so the dock is a
//      band across the rump (`rootWide`) and its skin starts deep inside it
//      (`rootSink`). See the tail's own options for how it leaves the hide.
//
// The rump itself turns over and down in one arc (`torso.round`): the croup
// is the high point behind the back and the dock sits on the turn.
//
// Mesh ledger: body (with its neck), four legs, head, ear pair (merged, and
// carrying the mane and forelock), the tail's one skin. k45 bakes its own horse down to a single mesh with
// `bakeStatic`, but the horse is shared, and an unbaked one still spends what
// it spends.
const HEAD_UP = 0.45;            // head centre above the body's axis, x height
const HEAD_FWD = 0.77;           // ...and ahead of the animal's middle
const HEAD_TILT = 0.9;           // rad the face hangs below level
const KNEE = 0.25;               // rad, hind hock fold
const POLL_LEAN = 0.15;          // rad the neck's last section leans back off upright
const TAIL_LEAN = 0.16;          // rad the whole hank leans back off plumb
// Where the dock is pinned, against the plan's own croup point: [down, forward]
// x height — deep enough under the croup that the dock's whole first section,
// upper side included, is inside the rump. See the tail's options.
const DOCK_SET = [0.005, 0.039];
// How far the neck's last ring, at the skull, is lifted along its upper half,
// x height: enough to seat its top in the poll. No other neck ring is lifted —
// see the mane block for why the crest is not the neck's own outline.
const POLL_LIFT = 0.012;
// THE MANE, as locks laid end to end down the crest from the poll onto the
// withers: [where it starts, where it ends (fractions of the crest's length,
// poll to withers), how high it stands at its front, and at its back (x
// height)]. Each rises to its own back end and the next starts lower, so the
// outline is stepped; they overlap a little so no daylight shows between.
// They stand low on the crest: taller, the mane rode high off the neck as a
// fin rather than lying along it.
// THE LAST ONE FALLS INSTEAD, and runs out to nothing on the withers: a mane
// that stops short of them at full height ends in a step, and that step, on
// top of the corner where the neck leaves the back, is a notch in the
// topline.
const MANE = [
  [0.02, 0.19, 0.016, 0.024],
  [0.17, 0.37, 0.022, 0.031],
  [0.35, 0.55, 0.026, 0.034],
  [0.53, 0.73, 0.024, 0.030],
  [0.71, 1.0, 0.021, 0.002],
];
const MANE_W = 0.4;              // half-width at its foot, x the neck's own there
const MANE_TOP = 0.5;            // ...and how much of that is left along its top edge
const MANE_SINK = 0.04;          // how far its foot is buried under the crest, x height
// The forelock, head-local and x height: [z, how high it stands off the
// forehead, half-width] from between the ears forward to its point.
const FORELOCK = [[-0.085, 0.026, 0.026], [-0.02, 0.03, 0.024], [0.055, 0.006, 0.01]];
// How much of its breadth each neck ring keeps at the throat, from the poll
// back toward the root (see THE THROAT IS NARROW).
const THROAT = [0.8, 0.6, 0.6];
// How far the trunk ring over the hip is lifted: the croup.
const CROUP_LIFT = 0.013;
// [z, halfW, halfH, yOff], x height — see ONE head below
const HEAD_RINGS = [
  [-0.085, 0.048, 0.058, 0.000],    // poll, rounding away behind
  [-0.030, 0.066, 0.105, -0.040],   // jaw: the deep part, and the breadth of the forehead
  [0.045, 0.062, 0.092, -0.035],    // cheek
  [0.125, 0.048, 0.068, -0.019],    // the underline has climbed
  [0.205, 0.039, 0.050, -0.014],
  [0.270, 0.035, 0.043, -0.015],    // muzzle, blunt
];

// AN EAR IS A SMALL UPRIGHT LEAF EITHER SIDE OF THE POLL (quadruped.js,
// earShell), each point [x, y, z] x height in the head loft's own frame — so
// it rides the face's hang — for the ear on +x. The base ring is buried in
// the back corner of the skull: its outer point just under the poll's widest
// corner, so the ear's outer edge leaves the head where the head's own
// outline turns over, and its inner point under the crown, leaving the
// forelock's width between the pair. The second ring is the leaf: a little
// broader than where the ear leaves the skull, bowed outward. The plan's cone
// stood a round base on a poll narrower than itself, and from in front each
// ear hung out past the side of the head with paper under it.
const EAR = {
  tip: [0.05, 0.08, -0.14],
  rings: [
    [[0.042, 0.023, -0.048], [0.016, 0.046, -0.058], [0.028, -0.005, -0.074]],
    [[0.06, 0.056, -0.089], [0.02, 0.067, -0.084], [0.04, 0.023, -0.109]],
  ],
  root: [0.028, 0.003, -0.036],
};

const HEAD_RINGS_SEG = 8;        // sides to a head ring, spun half a step: a flat facet up the face

export function makeHorse({ height = 1.5, color = INK_LIT, seed = 45 } = {}) {
  // Nosed well down: the face hangs steeper than the neck leans, so the head
  // is a mass hung off the end of the neck, not the neck's taper carried on.
  // The box is only the plan's placeholder — the loft below replaces it.
  const head = { shape: 'box', w: 0.08, hh: 0.105, d: 0.21, fwd: HEAD_FWD, up: HEAD_UP, tilt: HEAD_TILT };

  // THE TRUNK IS A BARREL (`barrel`), about as deep at the chest as the leg
  // under it is long, deepest just behind the elbow: with the plan's round
  // section it was a diamond from the front and a ridge down the flank. The
  // shoulder ends at a girth (`girth`), so it is a plane against the ribs.
  // Its underside is a keel (`keel`): the brisket a rounded keel between the
  // forelegs and the belly turning under on a curve, where one corner a side
  // made a floor under a hard edge the length of the belly.
  // THE NECK IS LONG AND DEEP AT ITS BASE, and the head is carried far enough
  // out and up that the neck is well over half the height of the withers
  // long. Shorter and shallower, it was a pony's head on a foal's neck. It
  // rises at about half a right angle, and a third of the way up it is still
  // about as deep as the head is long: the throat leaves the breast about
  // halfway down the chest (`root`) and runs to a full throatlatch (`r`)
  // as near one straight line (`taper`, close to a plain wedge). Leaving
  // the breast high, the neck was thin and the head hung forward off it;
  // leaving it lower and spending its depth late, the underside of the
  // neck sloped out to the breast as a fat mass, where a horse's throat
  // line runs fairly straight from the jaw down to the chest — the neck's
  // depth at its base is the crest rising, not the throat bulging. The front leg stands forward under
  // that low breast (`frontSet`): behind it, the chest ran on ahead of the
  // leg as a level keel and the leg's front line met it in a notch.
  const { group, tail, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.18, bodyLen: 0.59, bodyDrop: 0.055,
    torso: {
      chest: 1.18, loin: 0.8, withers: 1.28, back: 1.05, croup: 1.06, round: 1, slab: 1, barrel: 1, girth: 0.16, keel: 1, haunch: 0.8, arm: 0.2,
      shoulderW: 1.0, barrelW: 1.14, hipW: 1.06,
    },
    legBury: 0.18,
    legH: 0.62, legR: 0.048, legTaper: 0.97, hipX: 0.105, hipZ: 0.285,
    // `legR` is the whole leg's gauge and it is small: `thigh` then asks for
    // a full haunch in those units, `gaskin` spends nearly all of it before
    // the hock so the back of the leg dips forward above the hock, and the
    // forearm's own breadth is stated at the elbow (below). The hock stands a
    // quarter of the height up (`hock`) over a cannon that is close to
    // plumb (`rake`); the fold behind it (`KNEE`) puts it under the
    // buttock. Lower, it was a fetlock-high joint over a stub of cannon;
    // folded further, the hock stood out behind the buttock.
    // `shoulder` and `proud` are both low because what they build shows on a
    // slim leg as a box cap standing on the forearm, in front of the chest;
    // stood further out, the thigh's cap also breaks the flank as a dark dart
    // at the hip. A foot longer than the cannon is thick: a hoof, not a paw,
    // but a definite block.
    //
    // THE HAUNCH IS THE TRUNK'S (`torso.haunch`): the trunk hangs down over
    // each hind leg toward the stifle, so the thigh is the body's own surface
    // from the croup down and only the gaskin leaves it. A thigh hung under
    // the belly line showed its top as a pale plate under the trunk's dark
    // underside, with a step at the rump; and it is not stood out of the
    // flank (`proud`), or it breaks out through the side of the haunch.
    //
    // THE FOREARM IS AN ARM, NOT A THIGH: a slim column, a little broader
    // than the cannon and near one width from the knee to the elbow, both
    // edges close to plumb (`elbow`), over a knee carried high (`wrist`).
    // Getting on for three times the cannon at the elbow and tapering to the
    // knee, it sloped its back line into the belly like a hind leg and was
    // fat. At its top it opens both ways into the trunk (`flare`, `drop`):
    // forward into the breast, back into the girth, over enough of its run
    // that the leg visibly widens up into the shoulder it hangs from. Opened
    // only over a short run at the very top, the column stayed one width
    // right up into the chest and read as thin there.
    //
    // THE SHOULDER is not a mass on the leg at all. It is the chest's own
    // side carried straight down to the elbow (`torso.slab`), with the leg
    // standing forward under the breast (`frontSet`) and the breast still
    // standing out ahead of it — and carried out over the forearm there and
    // hung a little lower round its top (`torso.arm`): standing forward of
    // the shoulder section, the leg's outer face was flush with a chest
    // already narrowing to the breast, and its top showed as a lit tab with
    // a dark notch beside it.
    legs: { knee: KNEE, shoulder: 2.2, thigh: 4.12, proud: 0.0, cannon: 0.72, foot: 1.2, gaskin: 0.95, frontSet: 0.075, hindSet: 0.1, point: 0.55, flare: 1.1, drop: 0.3, elbow: 1.15, wrist: 0.35, hock: 0.58, rake: 0.06 },
    // `set` at nothing: the nape leaves the topline AT the withers, so the
    // withers are the corner where back turns into neck — but not the only
    // one. `ease` carries the root's top a way up the nape, so the line
    // climbs from the withers at once and turns again at the root; left where
    // the plan puts it, the root stands under the withers and the crest
    // starts from a step down.
    neck: { r: 0.075, w: 0.8, root: 0.5, set: 0.0, taper: 0.85, arch: 0.05, ease: 0.4 },
    head,
    // no snout: the muzzle is the front of the single head loft below.
    // The plan's cones only say that there are two ears: each is restated
    // against the head loft below (see EAR).
    ears: { r: 0.025, h: 0.085, x: 0.03, y: 0.075, z: -0.005, tilt: 0 },
    // `thickness` is the dock and `swell` the hair, placed low on the strand
    // (`swellAt`) and spread over most of it (`swellSpan`): a slimmer root
    // that fattens is a hank hanging from a tailbone, where a root as thick
    // as the hank is a club.
    //
    // HOW IT LEAVES THE HIDE. The rump turns over and falls away ever more
    // steeply, and a dock that leaves it more steeply than the rump is
    // falling at that point has its upper side OUTSIDE the hide ahead of
    // where it dives back in: a pale facet standing proud at the croup turn,
    // with the tail seeming to start again below it. So the dock starts
    // wholly under the croup (DOCK_SET) and its first segment is aimed well
    // back (`root`), shallower than the slope it comes out through — its
    // upper side then breaks the hide once, going outward, and reads as the
    // croup's own line continued. One such stub with the strand plumb off
    // its end is a visible hinge, so a second aimed segment (`rootBend`)
    // takes half the turn and the hank falls from an arc. The section has a
    // ridge up its back (`spin`), because the rump has one and a flat face
    // comes out through a ridge corners first, as a notch seen from behind.
    // `rootSink` runs the skin on from the dock FORWARD AND DOWN into the
    // rump, where no view reaches its end.
    tail: { kind: 'strand', segments: 7, length: 0.62, thickness: 0.05, swell: 1.5, swellAt: 0.66, swellSpan: 0.6, root: [0, -1, -1.04], rootBend: [0, -1, -0.34], rootSink: [0, -0.05, 0.1], rootWide: 1.5, spin: Math.PI / 6 },
  });
  group.name = 'horse';

  // ---- the tail hangs just CLEAR of the buttock ---------------------------
  // A verlet strand can only hang plumb, and a plumb line from the croup falls
  // INSIDE the rump's own outline. The strand settles in its group's LOCAL
  // frame, so leaning the whole group back a little carries the hang clear of
  // the buttock, and the idle sway rides along. Only a little: leaned far, the
  // tail stops hanging and sticks out.
  if (tail) {
    tail.group.rotation.x = TAIL_LEAN;
    tail.group.position.y -= DOCK_SET[0] * height;
    tail.group.position.z += DOCK_SET[1] * height;
  }

  // ---- the topline: a poll that meets the skull, a croup that rounds -------
  // The plan's trunk and neck are sections stated by a top point and a bottom
  // point. Two of the body's own rings are lifted along their upper half: the
  // last one into the poll, and the one over the hip, which stands the croup
  // above the back so it is the high point the plan's round rump turns down
  // from. The neck between is left the plan's plain wedge.
  //
  // Only ever UP and only the upper half: the legs were solved against the
  // trunk the plan built, and a ring that grows upward still contains
  // everything that was sunk in it. The rings behind the hip are left alone —
  // the plan rounds the rump with them and read the tail's root off them.
  let crest;                       // the neck's upper line, poll to root and on to the withers: [{ y, z, w }]
  {
    const body = group.children.find((c) => c.name === 'body');
    const P = body.geometry.getAttribute('position');
    const { seg: SEG, top: TOP, bot: BOT } = plan.ring;
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
      // how far along the section's own half-axis each vertex stands
      const ty = P.getY(o + TOP) - cy, tz = P.getZ(o + TOP) - cz;
      const along = [];
      for (let j = 0; j < SEG; j++) along.push(((P.getY(o + j) - cy) * ty + (P.getZ(o + j) - cz) * tz) / (m * m));
      for (let j = 0; j < SEG; j++) {
        const sn = along[j];
        P.setY(o + j, cy + sn * ay);
        P.setZ(o + j, cz + sn * az);
      }
    }
    lift(rings - 1, POLL_LIFT);
    // the croup's ring is the first one ahead of the hip, however many
    // sections the plan spends on the rump behind it
    let croupRing = 0;
    while (croupRing < rings - 1 && P.getZ(croupRing * SEG + TOP) < plan.zHip) croupRing++;
    lift(croupRing, CROUP_LIFT);
    // THE THROAT IS NARROW. The plan's neck rings are as broad under the
    // neck as along its sides, so seen from anywhere off square the lower
    // neck was a full round mass sloping out to the breast. A horse's neck
    // is a wedge in section: broad at the crest's foot and drawn in to the
    // throat. So each neck ring ahead of the root has its lower half drawn
    // in across (THROAT, from the poll back), more the further below the
    // ring's middle a vertex stands. The root ring is left as it is: it is
    // the breast, and the front legs were solved against it.
    THROAT.forEach((f, k) => {
      const o = (rings - 1 - k) * SEG;
      const cy = (P.getY(o + TOP) + P.getY(o + BOT)) / 2, cz = (P.getZ(o + TOP) + P.getZ(o + BOT)) / 2;
      const ay = P.getY(o + TOP) - cy, az = P.getZ(o + TOP) - cz, m2 = ay * ay + az * az;
      for (let j = 0; j < SEG; j++) {
        const t = ((P.getY(o + j) - cy) * ay + (P.getZ(o + j) - cz) * az) / m2;
        if (t < 0) P.setX(o + j, P.getX(o + j) * (1 - (1 - f) * Math.min(1, -t)));
      }
    });
    crest = [1, 2, 3, 4, 5].map((k) => {
      const o = (rings - k) * SEG;
      return { y: P.getY(o + TOP) + body.position.y, z: P.getZ(o + TOP), w: Math.abs(P.getX(o)) };
    });
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
    const SEG = HEAD_RINGS_SEG, pos = [], idx = [];
    for (const [z, w, hh, yo] of HEAD_RINGS) {
      for (let j = 0; j < SEG; j++) {
        const a = ((j + 0.5) / SEG) * Math.PI * 2;
        pos.push(Math.sin(a) * w * height, (Math.cos(a) * hh + yo) * height, z * height);
      }
    }
    const quads = [];
    for (let i = 0; i < HEAD_RINGS.length - 1; i++) ringQuads(quads, i * SEG, (i + 1) * SEG, SEG, true);
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
    // see loft.js: each quad folds outward, so the two sides are mirror images
    geo.setIndex(stitch(pos, quads, idx));
    geo.computeVertexNormals();
    headMesh.geometry.dispose();
    headMesh.geometry = geo;
  }

  // ---- the ears, out of the skull -------------------------------------------
  // Stated in the head loft's frame and carried out by the head's transform,
  // so each mesh is left with no transform of its own for the bake below.
  headMesh.updateMatrix();
  for (const ear of group.children.filter((c) => c.name === 'ear')) {
    const mirror = ear.position.x < 0;
    ear.geometry.dispose();
    ear.geometry = earShell(EAR, { unit: height, mirror, matrix: headMesh.matrix });
    ear.position.set(0, 0, 0);
    ear.rotation.set(0, 0, 0);
  }

  // ---- one mesh for the ears ---------------------------------------------
  // Nothing on a horse animates its ears (the fox's flick belongs to another
  // species), so the static pair bakes its transforms and merges to a single
  // mesh. The name survives ('ear') — species and cases reach in by name.
  const bakePair = (name, extra = []) => {
    const pair = group.children.filter((c) => c.name === name);
    if (pair.length !== 2) return;
    const geos = pair.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    }).concat(extra);
    const merged = new THREE.Mesh(mergeSimple(geos), pair[0].material);
    merged.name = name;
    for (const m of pair) { group.remove(m); m.geometry.dispose(); }
    group.add(merged);
  };

  // ---- the mane: hair ON the neck, not the neck's own outline --------------
  // Lifting the neck's rings into a crest drew the right profile and the
  // wrong animal: the fullness was the neck's own section, as wide as the
  // neck, so from anywhere but square-on it was a horse with a thick neck.
  // Hair is a separate, NARROWER thing standing on the crest: the step in
  // width is what the light and the shadow find, and the step in its outline
  // from lock to lock is what a silhouette finds. So the neck keeps the
  // plan's plain wedge and the mane is a row of blunt wedges along it, each a
  // closed solid with its foot buried under the crest, and a forelock lies
  // down the forehead between the ears. Nothing here moves and the ears do
  // not either, so the hair rides in the ears' mesh and costs no draw.
  const hair = [];
  {
    // one closed solid lofted through four-point sections, turned to face out
    // by its own volume, its quads folded outward like every loft (loft.js);
    // split all one way, a lock was one shape on one side of the crest and
    // another on the other
    const solid = (secs, matrix) => {
      const pos = secs.flat().flatMap((p) => [p.x, p.y, p.z]);
      const quads = [];
      for (let i = 0; i < secs.length - 1; i++) ringQuads(quads, i * 4, (i + 1) * 4, 4);
      const e = (secs.length - 1) * 4;
      quads.push(3, 2, 1, 0, e, e + 1, e + 2, e + 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setIndex(stitch(pos, quads, [], { outward: true }));
      if (matrix) geo.applyMatrix4(matrix);
      geo.computeVertexNormals();
      hair.push(geo);
    };

    // the crest as one run, by length
    const at = [0];
    for (let i = 1; i < crest.length; i++) at.push(at[i - 1] + Math.hypot(crest[i].y - crest[i - 1].y, crest[i].z - crest[i - 1].z));
    const total = at[at.length - 1];
    const crestAt = (u) => {
      const d = u * total;
      let i = 0;
      while (i < crest.length - 2 && d > at[i + 1]) i++;
      const a = crest[i], b = crest[i + 1], t = (d - at[i]) / (at[i + 1] - at[i]);
      const ty = b.y - a.y, tz = b.z - a.z, n = Math.hypot(ty, tz) || 1;
      // `up` is square to the crest on its outer side
      return { y: a.y + ty * t, z: a.z + tz * t, w: a.w + (b.w - a.w) * t, up: [-tz / n, ty / n] };
    };
    for (const [u0, u1, h0, h1] of MANE) {
      // a lock that crosses a corner of the crest takes a section there too,
      // so it bends with the neck instead of cutting the corner
      const us = [u0, ...at.slice(1, -1).map((d) => d / total).filter((u) => u > u0 + 0.03 && u < u1 - 0.03), u1];
      solid(us.map((u) => {
        const c = crestAt(u);
        const rise = (h0 + (h1 - h0) * (u - u0) / (u1 - u0)) * height;
        const foot = -MANE_SINK * height, wf = MANE_W * c.w, wt = wf * MANE_TOP;
        const p = (x, k) => new THREE.Vector3(x, c.y + c.up[0] * k, c.z + c.up[1] * k);
        return [p(-wf, foot), p(-wt, rise), p(wt, rise), p(wf, foot)];
      }));
    }

    // The forelock is stated against the head loft's own upper facet, in the
    // head's frame, and carried out by the head's transform.
    const flat = Math.cos(Math.PI / HEAD_RINGS_SEG);
    const browAt = (z) => {
      let i = 0;
      while (i < HEAD_RINGS.length - 2 && z > HEAD_RINGS[i + 1][0]) i++;
      const a = HEAD_RINGS[i], b = HEAD_RINGS[i + 1];
      const t = Math.min(1, Math.max(0, (z - a[0]) / (b[0] - a[0])));
      return (a[2] + (b[2] - a[2]) * t) * flat + a[3] + (b[3] - a[3]) * t;
    };
    headMesh.updateMatrix();
    solid(FORELOCK.map(([z, rise, w]) => {
      const brow = browAt(z);
      const p = (x, y) => new THREE.Vector3(x * height, y * height, z * height);
      return [p(-w, brow - MANE_SINK), p(-w * MANE_TOP, brow + rise), p(w * MANE_TOP, brow + rise), p(w, brow - MANE_SINK)];
    }), headMesh.matrix);
  }
  bakePair('ear', hair);

  return {
    group,
    tail,
    plan,
    update(dt, simTime) { tail && tail.update(dt, simTime); },
  };
}
