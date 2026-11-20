import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { skullGeometry } from './skull.js';
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
//   1. THE HEAD IS A WEDGE WITH A STOP. A ball skull with a muzzle part on its
//      front was the last toy thing on an anatomical body, and a ball that
//      size made the whole animal a puppy. One loft instead (skull.js): a
//      skull about half as deep as the chest, a brow, a short fall to a muzzle
//      that is deep and BLUNT — the fox's is a needle, and the bluntness is
//      half of what separates them.
//   2. SMALL EARS, STANDING. Laid out flat to either side they drew a bar
//      across the top of the head, a cap rather than ears. Short and pricked,
//      at the back corners of the skull, canted out.
//   3. THE NECK LIFTS THE HEAD CLEAR OF THE BACK. The jaw rides above the
//      withers; a head carried level with the back is the fox's carriage.
//   4. THE TAIL IS COCKED — up more than back. It is the one line on him that
//      a fox never draws.
//
// THE TAIL ROOTS INTO THE BODY. A 'stiff' tail is centred on its own origin,
// and stating that centre by hand leaves the root perched ON the outline
// instead of growing out of it. Same cure as the fox's brush: pin the ROOT to a
// stated point just under the rump's surface and solve the centre the quadruped
// wants, so the cocked tail emerges from inside the body at any length or
// angle.
//
// IT MOVES, and it returns a handle rather than a bare group for that reason —
// the same shape makeFox and makeCat return, and the same division of labour:
// the ANIMAL owns what a dog does, a case owns only when. It was the one animal
// in the book that was furniture, standing dead still in the two cases that use
// it while a cat and a fox either side of it breathed and turned. Everything
// below is a pure function of (simTime, stir): no wall clock, no Math.random,
// so two dogs on the same seed pose identically forever.
const TAIL_TILT = -0.62;                 // rad off vertical, backward: up more than back
const TAIL_LEN = 0.3;
const TAIL_ROOT = [0.07, -0.37];         // [above the body's axis, z] — just under the croup
const TAIL_UP = TAIL_ROOT[0] + (TAIL_LEN / 2) * Math.cos(TAIL_TILT);
const TAIL_BACK = -(TAIL_ROOT[1] + (TAIL_LEN / 2) * Math.sin(TAIL_TILT));

// THE HEAD, back of the skull to the nose: [z, top, bottom, half-width] in
// heights, from the point the neck ends on (see skull.js). The neck comes in
// low at the back, so the skull stands mostly above and ahead of zero. Read
// down the `top` column for the profile: crown, brow, the stop, then a muzzle
// that barely falls; `bottom` is the jaw, nearly straight. Widest at the
// cheek and never narrow — a pointed nose is the other animal.
const SKULL = [
  [-0.086, 0.076, -0.054, 0.07],
  [-0.011, 0.113, -0.092, 0.103],
  [0.076, 0.106, -0.089, 0.095],
  [0.13, 0.052, -0.08, 0.063],
  [0.205, 0.042, -0.075, 0.055],
  [0.27, 0.034, -0.067, 0.049],
];
const SKULL_BACK = [0.016, -0.119];      // [y, z] apexes closing the loft
const SKULL_NOSE = [-0.015, 0.292];
const HEAD_NOSE_DOWN = 0.12;             // rad the whole head is carried nose-down

// Where the skull hinges: straight below the point the neck ends on, so the
// head PIVOTS on the neck instead of orbiting a point in mid-air. Any offset
// fore or aft swings the skull sideways off the neck's end as it turns, and
// the end of the neck then shows through the cheek. Taken from the head mesh
// the quadruped placed rather than restated as an absolute, so it follows the
// head when the carriage is retuned.
const HINGE_DOWN = 0.02;                 // x height
// A cone is as deep as it is wide, and an ear is a leaf. Flattened fore and
// aft it is also a root short enough to stay under the skull's surface when
// the perk tips it — a round root lifted clear of the crown at the back.
const EAR_FLAT = 0.6;

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
  // Long legs under a trunk that is deep at the chest and tucked at the
  // flank: the depth is all brisket, so the loin stays lean. Short-legged and
  // fat-bodied the whole way along reads as a pig.
  // The neck lifts the head off the shoulders, which is most of what separates
  // the two silhouettes.
  const { group, material } = makeQuadruped({
    height, color, seed,
    bodyR: 0.2, bodyLen: 0.52, bodyDrop: 0.2,
    torso: { chest: 1.4, loin: 0.68, withers: 1.05, back: 0.92, croup: 0.95 },
    legBury: 0.16,
    legH: 0.5, legR: 0.07, legTaper: 1.0, hipX: 0.085, hipZ: 0.30,
    legs: { knee: 0.36, thigh: 3.0, hindSet: 0.09 },
    // the neck's end has to fit inside the skull it enters, turned or not
    neck: { r: 0.076, w: 0.9, root: 0.6, set: 0.2, taper: 1.0, arch: 0.02 },
    // The plan's ball is only a placeholder for where the head is carried and
    // how far it is nosed down; its geometry is replaced by the loft below.
    // No snout: the muzzle is the front half of that loft.
    head: { shape: 'sphere', r: 0.1, fwd: 0.52, up: 0.34, tilt: HEAD_NOSE_DOWN },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): r width, h length,
    // x/y/z = base offset from the point the neck ends on, tilt = outward
    // lean. Rooted inside the back corners of the skull.
    ears: { r: 0.04, h: 0.1, x: 0.056, y: 0.042, z: -0.025, tilt: 0.8 },
    tail: {
      kind: 'stiff', r0: 0.026, r1: 0.06, length: TAIL_LEN,
      up: TAIL_UP, back: TAIL_BACK, tilt: TAIL_TILT,
    },
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
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  for (const ear of ears) { ear.userData.baseX = ear.rotation.x; ear.scale.z = EAR_FLAT; }

  // ---- the tail, onto its own hinge ---------------------------------------
  // Rotating the tail MESH about y does nothing: y is its own long axis. The
  // sweep has to happen about the root, which is where the pivot goes — walked
  // back down the cylinder's own axis from the centre the quadruped placed, so
  // this stays exact if the tail's length or angle is ever retuned. (Rotating a
  // +y cylinder by x=t sends its axis to (0, cos t, sin t).)
  const tailMesh = group.children.find((c) => c.name === 'tail');
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tailPivot';
  tailPivot.position.set(
    0,
    tailMesh.position.y - (TAIL_LEN / 2) * height * Math.cos(TAIL_TILT),
    tailMesh.position.z - (TAIL_LEN / 2) * height * Math.sin(TAIL_TILT),
  );
  group.add(tailPivot);
  tailMesh.position.sub(tailPivot.position);
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
    tailPivot.rotation.x = -env * TAIL_COCK;
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
