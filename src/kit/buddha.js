import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { sphereHead } from './figure.js';
import { mergeSimple } from './scatter.js';

// A seated Buddha: same lathe-and-sphere vocabulary as `figure.js`, reusable
// for any Buddha-statue case (6, 9, 30, 32, 42). Featureless, like every
// figure in the book — the smile, if any, is added by the scene.
//
// THREE SILHOUETTE EVENTS carry the whole read, and each earned its place by
// being missing once (round 1 came back "a fire hydrant / chess bishop"):
//
//   KNEES, PLURAL. A lathe base is a plinth disc; crossed legs are two knee
//   masses poking out at ±x, the widest thing he owns, low. They are
//   ellipsoids MERGED INTO THE BODY GEOMETRY (mergeSimple, one mesh) — the
//   lumpy asymmetric base cannot come from a solid of revolution, and the
//   mesh budget (k30 builds two of him) cannot afford them as separate parts.
//
//   THE SHOULDER SHELF. The torso is a trapezoid that narrows DOWNWARD —
//   waist narrowest, chest swelling out above it, then a hard horizontal
//   turn at the shoulder. Run parallel it reads as a pipe; run wider at the
//   waist it reads as a bottle. The taper direction is the torso.
//
//   HEAD PROUD ON A NECK NOTCH. The collar dives from the shelf to a slim
//   neck column and the skull sits clearly ON it — a deep notch either side.
//   Nothing but the ushnisha breaks the crown line: round 1's ears were tall
//   enough to fuse head into shoulders, and the side view read half-buried.
//
// The read must survive three scales — workbench, garden figure, and k9's
// six-times-height hillside colossus — so every event above is silhouette,
// not surface. Detail floor (see finger.js): silhouette + 2–3 tone steps.
const BODY_PROFILE = [
  [0.020, 0.000],   // hem centre, closed on the ground (or on the plinth)
  [0.190, 0.000],   // hem edge
  [0.210, 0.060],   // the pooled robe over the shins
  [0.180, 0.160],   // lap top rolling in — the shelf the hands rest on
  [0.115, 0.240],   // THE WAIST — narrowest ring on the figure
  [0.140, 0.420],   // the chest growing back out: the torso tapers DOWN
  [0.175, 0.640],   // full chest
  [0.180, 0.685],   // THE SHOULDER SHELF — widest ring of the torso, then a
                    //   hard turn: this corner, not the taper, is "shoulders"
  [0.075, 0.715],   // collar diving in — the wall of the neck notch
  [0.055, 0.760],   // the neck column the head sits on
];

const HEAD_R = 0.115;   // fraction of height
const HEAD_Y = 0.865;   // head bottom at 0.750 — the neck column (top 0.760)
                        // tucks just inside it, sealing the joint with a
                        // visible notch below, not a buried skull

// The crossed legs: one flattened ellipsoid per side, merged into the body.
const KNEE = { r: 0.09, scale: [1.35, 0.75, 1.15], x: 0.155, y: 0.09, z: 0.05 };

// The arms: a tapered column per side with real limb volume (not wires),
// falling from just OUTSIDE the shoulder shelf, then folding inward to the
// hands. Both ends padded into the solids they join.
const ARM_SHOULDER = [0.185, 0.670, 0.020];
const ARM_WRIST = [0.100, 0.260, 0.140];
const ARM_R0 = 0.048;                          // upper arm radius
const ARM_R1 = 0.038;                          // wrist radius

export function makeBuddha({ height = 2.0, color = INK } = {}) {
  const g = new THREE.Group();
  g.name = 'buddha';
  const mat = toonMaterial({ color, flat: true });
  const H = height;

  // the body: robe lathe + the two knees, one merged solid. 12 segments —
  // a statue is the roundest figure in the kit.
  const lathe = new THREE.LatheGeometry(
    BODY_PROFILE.map(([r, y]) => new THREE.Vector2(r * H, y * H)), 12);
  const knees = [-1, 1].map((side) => {
    const k = new THREE.SphereGeometry(KNEE.r * H, 10, 8);
    k.scale(KNEE.scale[0], KNEE.scale[1], KNEE.scale[2]);
    k.translate(side * KNEE.x * H, KNEE.y * H, KNEE.z * H);
    return k;
  });
  const body = new THREE.Mesh(mergeSimple([lathe, ...knees]), mat);
  body.name = 'body';
  g.add(body);

  // HANDS-IN-LAP. One squashed sphere on the lap shelf, in the dhyana-mudra
  // spot, reaching OUTSIDE the lathe's own radius there so it reads as its
  // own mass — the same "proud, not coincident" rule the ushnisha leans on.
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.085 * H, 10, 8), mat);
  hands.name = 'hands';
  hands.scale.set(1.5, 0.55, 1.0);
  hands.position.set(0, 0.24 * H, 0.13 * H);
  g.add(hands);

  // THE ARMS. The run bows forward of the chest (the z components) as well
  // as outboard of it, so the limb stays proud of the lathe its whole length
  // instead of dipping inside the torso midway.
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const a = new THREE.Vector3(side * ARM_SHOULDER[0] * H, ARM_SHOULDER[1] * H, ARM_SHOULDER[2] * H);
    const b = new THREE.Vector3(side * ARM_WRIST[0] * H, ARM_WRIST[1] * H, ARM_WRIST[2] * H);
    const dir = b.clone().sub(a);
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(ARM_R1 * H, ARM_R0 * H, dir.length() + 0.06 * H, 8), mat);
    arm.name = 'arm';
    arm.position.copy(a).addScaledVector(dir, 0.5);
    arm.quaternion.setFromUnitVectors(up, dir.clone().normalize());
    g.add(arm);
  }

  const head = sphereHead({ height: H, r: HEAD_R, mat });
  head.position.y = HEAD_Y * H;
  g.add(head);

  // USHNISHA — the cranial bump, embedded into the crown so only its crest
  // shows proud of the skull. The one thing allowed to break the crown line.
  const ush = new THREE.Mesh(new THREE.SphereGeometry(0.05 * H, 10, 8), mat);
  ush.name = 'ushnisha';
  ush.position.y = (HEAD_Y + HEAD_R * 0.87) * H;
  g.add(ush);

  // LONG EARS. Renunciation's mark. Small lobes set where a jaw would be,
  // stopping at the head's own underline — any longer and head, ears and
  // shoulders fuse into one hooded mass (round 1's mistake).
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.040 * H, 8, 6), mat);
    ear.name = 'ear';
    ear.scale.set(0.55, 1.5, 0.5);
    ear.position.set(side * HEAD_R * 0.95 * H, (HEAD_Y - HEAD_R * 0.5) * H, 0);
    g.add(ear);
  }

  return g;
}
