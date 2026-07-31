import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { robeLathe, sphereHead } from './figure.js';

// A seated Buddha: built on the same lathe-and-sphere vocabulary as `figure.js`
// (`robeLathe`, `sphereHead`), reusable for any Buddha-statue case
// (6, 9, 30, 32, 42). Featureless, like every figure in the book — the smile,
// if any, is added by the scene, not the statue.
//
// A SEATED MAN, NOT A MOUNTAIN. The first build of this ran one continuous
// taper from the knees to the shoulders, and the whole figure collapsed into
// "a big round kind of thing" (Frank's words) — a bell, a rock, a pile. What
// makes a cross-legged man read as a man is a DISCONTINUITY: the crossed legs
// are a low, comparatively narrow base (lap about half the height wide,
// topping out around a fifth of the height), and the torso rises visibly
// INSET from it — a hard step at the waist, then a chest that carries real
// shoulders about a third of the height wide, up at seven tenths. Lap, step,
// torso, shoulders, head: five events, and the step is the one that says
// "someone is sitting" instead of "something is heaped".
//
// The read still has to survive three scales — workbench close-up, a
// garden-scale figure (k6, k30, k32, k42), and the six-times-height hillside
// colossus of k9 — so every one of those events is a silhouette event, not
// surface detail. Per the detail floor (see finger.js): silhouette plus two
// or three tone steps is the entire budget.
const BODY_PROFILE = [
  [0.020, 0.000],   // hem centre, closed on the ground (or on the plinth)
  [0.240, 0.000],   // hem edge, the pooled robe just past the knees
  [0.270, 0.060],   // THE KNEES — the crossed legs, widest cloth he owns (0.54·H)
  [0.255, 0.140],   // the top plane of the lap begins rolling in
  [0.225, 0.200],   // LAP TOP — the shelf the hands rest on
  [0.135, 0.240],   // THE WAIST STEP — torso hard inset from the lap. This one
                    //   ring is the whole difference between a man and a mound.
  [0.150, 0.340],   // the belly easing back out above the sash
  [0.140, 0.520],   // the long clean run up the chest
  [0.162, 0.660],   // filling out under the shoulders
  [0.165, 0.700],   // SHOULDER — 0.33·H across, square at seven tenths height
  [0.100, 0.725],   // collar — a step, the same event figure.js's monk collar is
  [0.058, 0.755],   // the neck opening — reaches UP PAST the head's own bottom
                    //   (see HEAD_Y/HEAD_R below), or the two solids leave a
                    //   visible gap of bare paper between them, the same trap
                    //   figure.js's neckBetween exists to close
];

const HEAD_R = 0.115;   // fraction of height
const HEAD_Y = 0.820;

// The arms, in fractions of height. One slim tapered column per side, from
// the shoulder down and inward to the wrist at the lap — this pair is what
// finally makes the figure read as a person rather than a statue-shaped
// solid, because a lathe can never show arms and a man visibly has them.
const ARM_SHOULDER = [0.150, 0.660, 0.035];   // sunk into the shoulder mass
const ARM_WRIST = [0.085, 0.245, 0.170];      // sunk into the hands mound
const ARM_R0 = 0.042;                          // upper arm radius
const ARM_R1 = 0.030;                          // wrist radius

export function makeBuddha({ height = 2.0, color = INK } = {}) {
  const g = new THREE.Group();
  g.name = 'buddha';
  const mat = toonMaterial({ color, flat: true });
  const H = height;

  g.add(robeLathe(BODY_PROFILE, H, mat, 12));   // 12 segments — a statue is the roundest figure in the kit

  // HANDS-IN-LAP. One squashed sphere resting on the lap shelf, in the
  // dhyana-mudra spot. A lathe is a solid of revolution, so ANY point inside
  // the profile's own radius at that height is buried and invisible — the
  // mound has to reach OUTSIDE the body's radius (~0.146·H here, on the waist
  // step) to read as its own mass, the same "proud, not coincident" rule the
  // ushnisha and ears lean on. Shallow and wide: a bowl of hands, not a fist.
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.09 * H, 10, 8), mat);
  hands.name = 'hands';
  hands.scale.set(1.4, 0.5, 0.95);
  hands.position.set(0, 0.235 * H, 0.175 * H);
  g.add(hands);

  // THE ARMS. Both ends are padded into the solids they join (the shoulder
  // mass, the hands mound) so no seam of bare paper opens at either joint —
  // neckBetween's rule, applied to a limb. The run between them bows FORWARD
  // of the chest (the z components below) as well as outboard of it, so the
  // arm stays proud of the lathe along its whole length instead of dipping
  // inside the torso midway, which is where a straight shoulder-to-lap chord
  // would put it.
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
  // shows proud of the skull.
  const ush = new THREE.Mesh(new THREE.SphereGeometry(0.05 * H, 10, 8), mat);
  ush.name = 'ushnisha';
  ush.position.y = (HEAD_Y + HEAD_R * 0.87) * H;
  g.add(ush);

  // LONG EARS. Renunciation's mark — the earlobes stretched long by the
  // jewelry he gave up. Two small lobes, elongated down toward the
  // shoulders rather than out, set low on the head where a jaw would be.
  // Sized so the lobe bottoms stop CLEAR of the shoulder line — at the first
  // scale they reached it, and head, ears and shoulders fused into one hooded
  // mass from the front.
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042 * H, 8, 6), mat);
    ear.name = 'ear';
    ear.scale.set(0.6, 1.7, 0.55);
    ear.position.set(side * HEAD_R * 1.0 * H, (HEAD_Y - HEAD_R * 0.35) * H, 0);
    g.add(ear);
  }

  return g;
}
