import * as THREE from '../../lib/three.module.js';
import { INK_LIT } from '../palette.js';
import { makeQuadruped } from './quadruped.js';
import { hash1, noise1 } from '../util/noise.js';
import { clamp01, smoothstep } from '../util/math.js';

// Joshu's dog (case 1). A small ink quadruped, featureless by design — the koan
// asks whether it has Buddha-nature, and a face would answer that.
//
// Built on the shared quadruped so the leg-to-belly join is computed rather than
// guessed; see THE LEG RULE in quadruped.js. Faces +z.
//
// He is HALF THE CAST of case 1 — a small red seal beside two ink monks, not a
// showpiece — so this stays humble: the same bare barrel as before, plus just
// enough mass to stop it reading as a table. `haunch` alone carries that (not
// `shoulder`, not `legs.knee`): it sits over the hind legs (`back` matches
// `hipZ` — it seats where the hind pair actually roots, so the dog reads as one
// animal, not a barrel with sticks) and stands only barely proud of the barrel
// line (`up + r*scaleY` clears `bodyR` by ~0.04h) — enough to read as weight at
// k1 scale, not enough to look fed. A `chest` brisket was tried here and CUT:
// hung ahead of the foreleg it never merged with the body line, and at case
// distance it read as "something weird hanging below his chest, like a round
// ball" — the plain barrel beats a bolted-on lump. THE TAIL ROOTS INTO THE BODY.
// A 'stiff' tail is a cylinder centred on its own origin, and the old up/back
// numbers left its root end hovering near the barrel's axis — which put the
// visible root at the top of the rump, perched ON the outline instead of growing
// out of it, and together with the proud haunch it broke the topline as
// "something weird on the top of its butt". Same cure as the fox's brush: pin
// the ROOT to a stated point just under the rump's surface and solve the centre
// the quadruped wants, so the cocked tail emerges from inside the body at any
// length or angle.
//
// IT MOVES, and it returns a handle rather than a bare group for that reason —
// the same shape makeFox and makeCat return, and the same division of labour:
// the ANIMAL owns what a dog does, a case owns only when. It was the one animal
// in the book that was furniture, standing dead still in the two cases that use
// it while a cat and a fox either side of it breathed and turned. Everything
// below is a pure function of (simTime, stir): no wall clock, no Math.random,
// so two dogs on the same seed pose identically forever.
const TAIL_TILT = -1.0;                  // rad: up and back — the cocked tail is the read
const TAIL_LEN = 0.28;
const TAIL_ROOT = [0.13, -0.40];         // [above the barrel axis, z] — 0.07 under the surface
const TAIL_UP = TAIL_ROOT[0] + (TAIL_LEN / 2) * Math.cos(TAIL_TILT);
const TAIL_BACK = -(TAIL_ROOT[1] + (TAIL_LEN / 2) * Math.sin(TAIL_TILT));

// Where the skull hinges, as an offset from the head's own centre: back and
// down, at the base of the crown, so the head PIVOTS on the neck instead of
// orbiting a point in mid-air. Derived from the head mesh the quadruped
// actually built rather than restated in heights — the fox states its hinge as
// an absolute and has to be re-measured whenever the skull moves.
const HINGE_BACK = 0.78;                 // x the skull's radius
const HINGE_DOWN = 0.42;

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
  // Taller legs and a slimmer barrel: the first pass was short-legged and
  // fat-bodied, which read as a pig rather than a dog. The neck lifts the head
  // off the shoulders, which is most of what separates the two silhouettes.
  const { group, material } = makeQuadruped({
    height, color, seed,
    bodyR: 0.25, bodyLen: 0.50, bodyDrop: 0.18,
    // the legs read as sticks when thinner; the limb profile in the shared plan
    // (broad thigh, slim cannon, small foot) does the shaping now, and legTaper
    // hands it a full-width thigh to start from
    legBury: .2,
    legH: 0.5, legR: 0.09, legTaper: 1.0, hipX: 0.1, hipZ: 0.30,
    neck: { r: 0.15, len: 0.26 },
    head: { shape: 'sphere', r: 0.165, fwd: 0.55, up: 0.30 },
    snout: { r0: 0.06, r1: 0.1, len: 0.2, fwd: 0.7, up: 0.24 },
    // DIRECT dials (quadruped.js, EARS ARE PLACED DIRECTLY): r width, h length,
    // x/y/z = base offset from the head's CENTRE (keep the offsets inside the
    // head's own radius, above, to bury the join), tilt = outward lean. These
    // numbers reproduce the old aim-ray placement exactly (45° out on the
    // crown); they are a starting point to tune, not a keeper.
    ears: { r: 0.07, h: 0.16, x: 0.07, y: 0.08, z: -.03, tilt: 1.6 },
    // rump: `back` sits just short of `hipZ` so the mass gathers where the hind
    // legs actually drive into the barrel. LOW AND LONG: an earlier round stood
    // it proud of the barrel line and the bump over the hips was the first
    // thing anyone saw. `up + r*scaleY` now clears `bodyR` by a hair — the
    // haunch thickens the topline without breaking it — and the longer scaleZ
    // lets the extra weight run INTO the back instead of up off it.
    haunch: { r: 0.145, scaleY: 0.75, scaleZ: 1.30, up: 0.10, back: 0.28 },
    tail: {
      kind: 'stiff', r0: 0.024, r1: 0.052, length: TAIL_LEN,
      up: TAIL_UP, back: TAIL_BACK, tilt: TAIL_TILT,
    },
  });
  group.name = 'dog';

  // ---- the skull, onto its own hinge --------------------------------------
  // makeQuadruped hangs the head, muzzle and ears straight off the body, which
  // is right for a body plan and useless for a look. Re-parent them onto a pivot
  // at the base of the skull; the neck stays behind, buried, so the head turns
  // against it rather than dragging it along.
  const headMesh = group.children.find((c) => c.name === 'head');
  const skullR = headMesh.geometry.parameters.radius;
  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(
    0,
    headMesh.position.y - HINGE_DOWN * skullR,
    headMesh.position.z - HINGE_BACK * skullR,
  );
  group.add(headPivot);
  for (const part of group.children.slice()) {
    if (part.name === 'head' || part.name === 'snout' || part.name === 'ear') {
      part.position.sub(headPivot.position);
      headPivot.add(part);
    }
  }
  const ears = headPivot.children.filter((c) => c.name === 'ear');
  for (const ear of ears) ear.userData.baseX = ear.rotation.x;

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
