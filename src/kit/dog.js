import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { skullGeometry } from './skull.js';
import { mirrorGeometry } from './loft.js';
import { hash1, noise1 } from '../util/noise.js';
import { clamp01, smoothstep } from '../util/math.js';

// Joshu's dog (case 1). A small ink quadruped, featureless by design — the koan
// asks whether it has Buddha-nature, and a face would answer that.
//
// Built on the shared quadruped so the leg-to-belly join is computed rather than
// guessed; see THE LEG RULE in quadruped.js. Faces +z.
//
// He is HALF THE CAST of case 1 — a small red seal beside two ink monks, not a
// showpiece — so this stays humble: the shared plan at plain, lean proportions,
// a deep chest under a lifted neck, and nothing added. Masses hung on the body
// were tried here twice and cut twice: a brisket ball read as something hanging
// below his chest, and a haunch dome broke the topline over the hips. The chest
// and the haunch are the trunk's own profile and the thigh's own top now.
//
// WHAT SAYS DOG, in the order it is lost at distance:
//
//   1. THE HEAD IS A BLOCK WITH A STOP. A ball skull with a muzzle part on its
//      front was the last toy thing on an anatomical body. One loft instead
//      (skull.js): a domed skull well over half as deep as the chest, a brow,
//      a short fall to a muzzle that is deep and BLUNT — the fox's is a
//      needle, and the bluntness is half of what separates them. Built small
//      and shallow it was a wedge on a stalk, and the whole animal read as
//      leggy because nothing up front balanced the trunk.
//   2. THE EARS HANG. Flaps beside the skull, rooted in its upper corners and
//      falling to the jaw. Standing points are the fox's ears; laid out flat
//      to either side they drew a bar across the top of the head. Hanging,
//      they leave the crown a clean dome, which is the outline that says dog.
//   3. THE NECK IS THICK AND LIFTS THE HEAD CLEAR OF THE BACK. It leaves the
//      whole front of the chest, withers to breast, and is still most of the
//      skull's depth where it enters it. The jaw rides above the withers; a
//      head carried level with the back is the fox's carriage.
//   4. THE TAIL IS CARRIED UP AND BACK IN A CURVE, thick where it leaves the
//      croup and drawn to a point. A straight rod standing on the rump was a
//      spike, and a fox never carries its brush above its back at all.
//
// IT MOVES, and it returns a handle rather than a bare group for that reason —
// the same shape makeFox and makeCat return, and the same division of labour:
// the ANIMAL owns what a dog does, a case owns only when. It was the one animal
// in the book that was furniture, standing dead still in the two cases that use
// it while a cat and a fox either side of it breathed and turned. Everything
// below is a pure function of (simTime, stir): no wall clock, no Math.random,
// so two dogs on the same seed pose identically forever.

// THE TAIL, root to tip: [back, up, radius] in heights, from the point it
// hinges on. It is its own outline rather than the plan's straight taper, and
// its first station lies AHEAD of the hinge, inside the croup, so the root
// grows out of the body at any wag instead of perching on the outline.
const TAIL = [
  [-0.06, -0.03, 0.05],
  [0.0, 0.0, 0.056],
  [0.07, 0.03, 0.05],
  [0.14, 0.085, 0.042],
  [0.2, 0.16, 0.031],
  [0.24, 0.235, 0.019],
];
const TAIL_TIP = [0.262, 0.29];          // [back, up]
// Where it hinges: this far behind the hip section, sunk this far under the
// topline there.
const TAIL_SET = 0.1;                    // x height
const TAIL_SINK = 0.035;

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). The neck comes in
// low at the back, so the skull stands mostly above and ahead of zero. Read
// down the `top` column for the profile: a domed crown, the brow, the stop,
// then a muzzle that barely falls; `bottom` is the jaw, nearly straight.
// Widest at the cheek and never narrow — a pointed nose is the other animal.
// The back half has to hold the end of a thick neck at any turn of the head,
// which is what bounds how small this can be made.
const SKULL = [
  [-0.115, 0.1, -0.075, 0.09],
  [-0.04, 0.158, -0.122, 0.122],
  [0.06, 0.162, -0.126, 0.122],
  [0.13, 0.13, -0.118, 0.1],
  [0.188, 0.07, -0.11, 0.076],
  [0.25, 0.05, -0.1, 0.067],
  [0.3, 0.038, -0.088, 0.058],
];
const SKULL_BACK = [0.016, -0.15];       // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.022, 0.324];
const HEAD_NOSE_DOWN = 0.12;             // rad the whole head is carried nose-down

// Where the skull hinges: straight below the point the neck ends on, so the
// head PIVOTS on the neck instead of orbiting a point in mid-air. Any offset
// fore or aft swings the skull sideways off the neck's end as it turns, and
// the end of the neck then shows through the cheek. Taken from the head mesh
// the quadruped placed rather than restated as an absolute, so it follows the
// head when the carriage is retuned.
const HINGE_DOWN = 0.02;                 // x height

// AN EAR, root to tip: [along, out, thickness, half-breadth] in heights. A
// leaf, not a cone: broad fore and aft, thin across. `out` is how far its
// middle stands off the straight line from root to tip, toward the outside of
// the head — the flap leaves a corner of the skull and has to clear the cheek
// below it, which is the widest part of the head, and a straight flap hung
// from inside the skull stays inside it all the way down.
const EAR = [
  [0.0, 0.0, 0.016, 0.042],
  [0.045, 0.026, 0.015, 0.058],
  [0.105, 0.036, 0.013, 0.046],
  [0.16, 0.034, 0.01, 0.026],
];
const EAR_TIP = [0.188, 0.032];          // [along, out]
const EAR_SPLAY = 0.3;                   // rad the flap hangs out from plumb
const EAR_BACK = 0.2;                    // ...and back, at rest

const STIR = 3.2;                        // seconds for one whole response
// The envelope: up fast, HELD, then let go slowly. A symmetric out-and-back
// (the cat's sin²) reads as a twitch on an animal this size; a dog that has
// noticed you stays noticing for a beat. Fractions of STIR.
const RISE = 0.10;
const HOLD = 0.42;

// HOW BIG. Judged in case 1, where the dog stands nearest the lens and unfogged
// — and still these are large numbers for a 0.6-unit animal. The cat's own
// header records the same finding from the other end of the book: a tenth of a
// radian in a part a few pixels across is motion you can only find by looking
// for it. Legible beats subtle every time here, because nothing announces that
// the dog can be touched at all.
const HEAD_TURN = 0.34;                  // rad the skull comes round
const HEAD_TILT = 0.42;                  // ...and cocks over. THE dog gesture.
const HEAD_LIFT = 0.10;                  // chin up, a little
const EAR_PERK = 0.40;                   // both ears, and one goes further
const TAIL_WAG = 0.62;                   // rad of sweep, either way
const TAIL_WAG_HZ = 3.1;                 // a dog wags FAST — this is most of what says dog
const TAIL_COCK = 0.16;                  // and carries it higher while it does

// Idle, when nothing has happened. Small, slow, never still: a dog standing in a
// field is not a statue, and the alternative is that touching it is the only
// frame in which it is alive.
const IDLE_YAW = 0.11;
const IDLE_PITCH = 0.045;
const IDLE_TAIL = 0.10;

export function makeDog({ height = 0.5, color = INK_LIT, seed = 1 } = {}) {
  // A trunk deep at the chest and tucked at the flank, on legs about as long
  // as that chest is deep: the depth is all brisket, so the loin stays lean.
  // Short-legged and fat-bodied the whole way along reads as a pig; the same
  // trunk carried higher on longer legs reads as a hound on stilts. The
  // topline falls a little from withers to croup and the rump overhangs the
  // hind legs enough to turn down in a round rather than a corner (`round`:
  // on a body this short a blunt end is a box under the tail).
  const { group, material, plan } = makeQuadruped({
    height, color, seed,
    bodyR: 0.2, bodyLen: 0.56, bodyDrop: 0.2,
    // A BARREL, NOT A DIAMOND (`barrel`): at the right width but with the
    // plan's round section he was widest along one line and fell away above
    // and below it — a thin slab from the front, two flat planes meeting at a
    // ridge from three-quarter. `girth` ends the shoulder at an edge behind
    // the elbow, so it reads as a plane of its own against the ribs. Under
    // it all the trunk is a KEEL (`keel`): with one lower corner a side the
    // belly was a floor under a hard edge, and the chest a flat dark plate
    // between the forelegs.
    //
    // SEEN FROM THE FRONT HE IS BROAD: about a third as wide as he is tall
    // through the chest, with the front legs coming down from under the
    // shoulders well apart and daylight between them. At the plan's lean
    // widths he was a plank on edge with his legs pressed together. The stance
    // (hipX) is bounded by the hips: set wider than this the hind leg's top
    // ring stands out of the rump as a shelf.
    torso: { chest: 1.4, loin: 0.78, withers: 1.05, back: 0.93, croup: 0.92, round: 1, slab: 1, barrel: 1, girth: 0.16, keel: 1, haunch: 0.9, arm: 0.25, shoulderW: 1.0, barrelW: 1.08, hipW: 1.02 },
    legBury: 0.16,
    legH: 0.46, legR: 0.066, legTaper: 0.8, hipX: 0.11, hipZ: 0.30,
    // The legs stand under the two ends of the trunk rather than under its
    // sections: the front pair below the neck, with the withers behind them,
    // and the hind pair below the buttock. Neither can go further out than
    // there is trunk above it to bury the top of the leg in.
    //
    // HOW THICK, AND WHERE. The lower leg is slim — under a fifth of the
    // chest's depth — and the forearm is NOT that width carried up to the
    // belly: one width from paw to chest is a post, however slim. `legR` is
    // the whole leg's scale and `legTaper` the forearm's share of it, so the
    // pair is slimmed with those and the masses that are stated as multiples
    // of `legR` — shoulder, thigh, paw — are raised to stay the size they
    // were. The keeled chest is narrower low down where the shoulder's sunk
    // ring sits, so `shoulder` asks for more than the ring is given.
    //
    // THE SHOULDER is the chest's own side, carried straight down to the leg
    // (`torso.slab`), and out over the forearm's top and a little lower
    // round it (`torso.arm`), where the leg's outer face stood flush with
    // the narrowing breast and showed as a tab beside a notch. The forearm under it is an arm, not a thigh: a column
    // about as broad as the leg at the knee (`elbow`), its edges near plumb,
    // a long one over a low wrist (`wrist`), and at its top it opens both
    // ways into the trunk over its upper third (`flare`, `drop`) — the
    // front edge up into the breast, the back edge into the girth. Broad at
    // the elbow and leaning its rear line back into the belly, it read as a
    // hind leg standing under the chest. The front pair stands well forward
    // (`frontSet`), and the throat leaves the breast high on it (neck
    // `root`), so the breast rises off the front of the leg at once and
    // stands out ahead of it: from a low point of the breast the chest ran
    // on ahead of the leg as a level keel, a notch where the leg met it.
    //
    // THE HIND LEG folds well (`knee`) at a hock standing about a quarter of
    // his height up (`hock`), over a cannon that is nearly upright (`rake`):
    // the hock is the point behind him, with the back of the leg dipping
    // forward above it to the buttock — not so far behind that it stands
    // out past the buttock, which folded further it did. The leg hangs only
    // a little behind the hip section (`hindSet`): a tenth of the height
    // back, it stood under the very end of the trunk and read as set too far
    // back.
    //
    // THE HAUNCH IS THE TRUNK'S (`torso.haunch`): the trunk hangs down over
    // each hind leg toward the stifle, so the thigh is the body's own surface
    // from the croup down and only the gaskin leaves it. A thigh hung under
    // the belly line showed its top as a pale plate under the trunk's dark
    // underside, with a step at the rump; and it is not stood out of the
    // flank (`proud`), or it breaks out through the side of the haunch.
    legs: { knee: 0.4, shoulder: 3.6, thigh: 3.4, proud: 0, foot: 1.45, frontSet: 0.06, hindSet: 0.05, point: 0.7, flare: 0.8, drop: 0.3, elbow: 1.2, wrist: 0.45, hock: 0.6, rake: 0.12 },
    // the neck's end has to fit inside the skull it enters, turned or not.
    // The head is carried high on a neck that stands steeply, so the back has
    // a long way to turn to become the nape: `ease` and `easeUp` split that
    // turn about evenly between the withers and the root of the neck. All of
    // it at one point, under a root that dips first, was a notch.
    neck: { r: 0.1, w: 0.85, root: 0.3, set: 0.05, taper: 1.0, arch: 0.02, ease: 0.5, easeUp: 0.45 },
    // The plan's ball is only a placeholder for where the head is carried and
    // how far it is nosed down; its geometry is replaced by the loft below.
    // No snout: the muzzle is the front half of that loft.
    head: { shape: 'sphere', r: 0.1, fwd: 0.55, up: 0.38, tilt: HEAD_NOSE_DOWN },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): x/y/z = base
    // offset from the point the neck ends on, in an upper back corner of the
    // skull and just under its surface. The plan's cone is a placeholder for
    // that root; its `tilt` turns the ear past level so that it hangs.
    ears: { r: 0.03, h: 0.1, x: 0.07, y: 0.092, z: -0.02, tilt: Math.PI - EAR_SPLAY },
    // a placeholder too: only the mesh is kept, reshaped and re-seated below
    tail: { kind: 'stiff', r0: 0.02, r1: 0.05, length: 0.3, tilt: 0 },
  });
  group.name = 'dog';

  // ---- the skull, onto its own hinge --------------------------------------
  // makeQuadruped hangs the head and ears straight off the body, which
  // is right for a body plan and useless for a look. Re-parent them onto a pivot
  // at the base of the skull; the neck stays behind, buried, so the head turns
  // against it rather than dragging it along.
  const headMesh = group.children.find((c) => c.name === 'head');
  headMesh.geometry.dispose();
  headMesh.geometry = skullGeometry(SKULL, { unit: height, back: SKULL_BACK, nose: SKULL_NOSE });
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(
    0,
    headMesh.position.y - HINGE_DOWN * height,
    headMesh.position.z,
  );
  group.add(headPivot);
  for (const part of group.children.slice()) {
    if (part.name === 'head' || part.name === 'ear') {
      part.position.sub(headPivot.position);
      headPivot.add(part);
    }
  }
  // The flap is the same closed loft as the skull, stated along its own
  // length and then stood on the ear's axes: length up local y (which the
  // mesh's turn points down), breadth fore and aft, and `out` to whichever
  // side is away from the head — the pair is mirrored, so each ear gets its
  // own geometry. The hinge the perk turns stays rotation.x, about the root.
  // The flap is built for the +x ear and reflected for the other (loft.js,
  // THE OTHER ONE OF A PAIR): turned round to the other side instead, it was
  // the same points joined into other triangles, a differently folded flap.
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  const flap = skullGeometry(
    EAR.map(([along, out, thick, breadth]) => [along, out + thick, out - thick, breadth]),
    { unit: height, seg: 4, back: [0, -0.01], nose: [EAR_TIP[1], EAR_TIP[0]] },
  );
  flap.applyMatrix4(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  ));
  flap.computeVertexNormals();
  for (const ear of ears) {
    ear.geometry.dispose();
    ear.geometry = ear.position.x < 0 ? mirrorGeometry(flap) : flap;
    ear.rotation.x = EAR_BACK;
    ear.userData.baseX = ear.rotation.x;
  }

  // ---- the tail, onto its own hinge ---------------------------------------
  // Rotating a tail about its own long axis does nothing, so the sweep
  // happens about the root, which is where the pivot goes: on the croup, read
  // off the plan's own topline so it follows a retuned back. The mesh sits
  // square on that pivot and the curve is all in its geometry — the skull's
  // loft again, run tip to root, each ring deepened by the slope of the tail
  // through it because the loft stands its rings upright and a rising tube
  // cut that way would otherwise thin as it climbs.
  const tailMesh = group.children.find((c) => c.name === 'tail');
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  const tailZ = plan.zHip - TAIL_SET * height;
  tailPivot.position.set(
    0,
    plan.topAt(tailZ) - TAIL_SINK * height,
    tailZ,
  );
  group.add(tailPivot);
  const path = [...TAIL, [...TAIL_TIP, 0]];
  const tailRows = TAIL.map(([back, up, r], i) => {
    const p = path[Math.max(i - 1, 0)], n = path[i + 1];
    const run = Math.hypot(n[0] - p[0], n[1] - p[1]) || 1;
    const deep = r * run / Math.max(0.35 * run, n[0] - p[0]);
    return [-back, up + deep, up - deep, r];
  }).reverse();
  tailMesh.geometry.dispose();
  tailMesh.geometry = skullGeometry(tailRows, {
    unit: height, seg: 6,
    back: [TAIL_TIP[1], -TAIL_TIP[0]],
    nose: [TAIL[0][1], -TAIL[0][0] + 0.02],
  });
  tailMesh.position.set(0, 0, 0);
  tailMesh.rotation.set(0, 0, 0);
  tailPivot.add(tailMesh);

  let look = 0;          // the head's resting bearing, set by the koan
  let stirT = -1;        // -1 idle, else seconds into a response
  let env = 0;           // 0..1, the shape of it
  let notices = 0;
  let clock = 0;
  let yaw = 0, wag = 0;

  function update(dt, simTime) {
    // simTime is authoritative when it exists; dt keeps the idle moving in a
    // harness that has no clock at all (the model viewer's rest pose calls this
    // once with 0, 0 and must not divide by anything).
    clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
    if (stirT >= 0) {
      stirT += dt || 0;
      if (stirT >= STIR) { stirT = -1; env = 0; }
      else {
        const p = stirT / STIR;
        env = smoothstep(0, RISE, p) * (1 - smoothstep(HOLD, 1, p));
      }
    }
    // spent in the first moments, for the parts that snap rather than swell
    const flick = stirT < 0 ? 0 : Math.sin(Math.PI * clamp01(stirT / (STIR * 0.28)));

    // the head: drifting always, and on a stir it comes round, lifts its chin
    // and COCKS OVER. The cock is the whole gesture — a turn alone is a head on
    // a stick, and it is the one movement that reads as the animal wondering
    // about you rather than merely facing you.
    yaw = look
      + (noise1(clock * 0.19 + seed * 1.7, seed) - 0.5) * IDLE_YAW
      + env * HEAD_TURN;
    headPivot.rotation.y = yaw;
    headPivot.rotation.x = (noise1(clock * 0.15 + 5.5, seed + 3) - 0.5) * IDLE_PITCH
      - env * HEAD_LIFT;
    headPivot.rotation.z = env * HEAD_TILT;

    // ears: each on its own slow cycle so they never twitch together, plus a
    // hard perk the moment something is noticed
    ears.forEach((ear, i) => {
      const ph = clock * 0.29 + i * 0.57 + hash1(i + 1, seed);
      const w = ph - Math.floor(ph);
      const twitch = w < 0.12 ? Math.sin(Math.PI * (w / 0.12)) : 0;
      ear.rotation.x = ear.userData.baseX
        - (twitch * 0.16 + flick * EAR_PERK * (i === 0 ? 1 : 0.7));
    });

    // THE WAG. An oscillation with the envelope as its amplitude, not a lean
    // that goes out and comes back — a tail that sweeps aside once is a tail
    // being pushed, not a tail being wagged. It starts still, wags while the dog
    // is pleased, and is still again at the end. (The cat's tail learned this
    // the same way; hers is slower and hers is a curl.)
    wag = Math.sin(clock * 0.41 + seed) * IDLE_TAIL
      + env * TAIL_WAG * Math.sin(2 * Math.PI * TAIL_WAG_HZ * clock);
    tailPivot.rotation.y = wag;
    // (+x tips a tail that runs up and back further upright)
    tailPivot.rotation.x = env * TAIL_COCK;
  }

  update(0, 0);

  return {
    group, material,
    head: headPivot,
    tail: tailPivot,
    ears,
    // where the dog is looking when nothing has disturbed it, in its own frame
    setLook(a) { look = a; update(0, 0); return this; },
    // an ear, a turn and cock of the head, a burst of wagging. Then back to
    // standing in a field. Ignored while one is already running, so a held
    // pointer cannot stack them.
    notice() { if (stirT >= 0) return false; stirT = 0; notices++; return true; },
    noticed: () => notices,
    stirring: () => stirT >= 0,
    stirLevel: () => env,
    headYaw: () => yaw,
    tailYaw: () => wag,
    update,
  };
}
