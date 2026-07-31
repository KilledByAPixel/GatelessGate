import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { robeLathe, sphereHead } from './figure.js';

// A seated Buddha: built on the same lathe-and-sphere vocabulary as `figure.js`
// (`robeLathe`, `sphereHead`), but on its own profile — the pooled-robe
// seated statue is not a monk's stance, it is a mountain. Reusable for any
// Buddha-statue case (6, 9, 30, 32, 42). Featureless, like every figure in the
// book — the smile, if any, is added by the scene, not the statue.
//
// THE MOUNTAIN TRIANGLE. The whole read has to survive at three very
// different scales — a workbench close-up, a garden-scale seated figure
// (k6, k30, k32, k42), and a six-times-height hillside colossus (k9) — so it
// leans on silhouette, not surface: a wide base at the knees, tapering hard
// to shoulders under half that width, and a small head on top. That ratio is
// what separates a seated Buddha from a bell or a rock (the shapes this
// profile used to collapse into): a bell tapers evenly top to bottom; a
// mountain has a knee.
//
// FOLD RINGS. Two shallow ridges — a pinch then a small release, the same
// two-point grammar figure.js's obi uses for its belt — cross the robe over
// the shins and again at the waist. They are rings in the SAME lathe, not new
// meshes: the fold is a change in facet angle, and under flat shading a
// change in facet angle is a visible tone step. Two is enough; a third
// crowded the read at workbench distance during the critique pass.
const BODY_PROFILE = [
  [0.020, 0.000],   // hem centre, closed on the ground (or on the plinth)
  [0.410, 0.000],   // hem edge, where the pooled robe meets the ground
  [0.480, 0.070],   // THE KNEES — widest cloth he owns, the cross-legged spread
  [0.440, 0.115],   // FOLD 1 — the pinch
  [0.455, 0.142],   // FOLD 1 — the release, cloth easing back out just above it
  [0.398, 0.225],   // the long run over the lap — this is where the hands sit
  [0.350, 0.272],   // FOLD 2 — the pinch, at the waist
  [0.365, 0.292],   // FOLD 2 — the release
  [0.230, 0.362],   // the run up the chest
  [0.148, 0.460],   // SHOULDER — well under half the knee width: the mountain's peak
  [0.098, 0.485],   // collar — a step, the same event figure.js's monk collar is
  [0.060, 0.525],   // the neck opening — reaches UP PAST the head's own bottom
                    //   (see HEAD_Y/HEAD_R below), or the two solids leave a
                    //   visible gap of bare paper between them, the same trap
                    //   figure.js's neckBetween exists to close
];

const HEAD_R = 0.115;   // fraction of height
const HEAD_Y = 0.615;

export function makeBuddha({ height = 2.0, color = INK } = {}) {
  const g = new THREE.Group();
  g.name = 'buddha';
  const mat = toonMaterial({ color, flat: true });
  const H = height;

  g.add(robeLathe(BODY_PROFILE, H, mat, 12));   // 12 segments — a statue is the roundest figure in the kit

  // HANDS-IN-LAP. One squashed sphere resting against the front of the belly,
  // in the dhyana-mudra spot just above the lap. A lathe is a solid of
  // revolution, so ANY point inside the profile's own radius at that height is
  // buried and invisible — the mound has to reach OUTSIDE the body's radius to
  // read as its own mass, the same "proud, not coincident" rule the ushnisha
  // and ears lean on. The body radius shrinks fast through this stretch (the
  // chest taper into the shoulder), so a uniform offset overshoots the top of
  // a tall mound; this one is shallow and wide instead, so it clears cleanly
  // near its centre (the belly) and eases back into the lap at its base.
  const hands = new THREE.Mesh(new THREE.SphereGeometry(0.16 * H, 10, 8), mat);
  hands.name = 'hands';
  hands.scale.set(1.35, 0.45, 0.9);
  hands.position.set(0, 0.245 * H, 0.34 * H);
  g.add(hands);

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
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.048 * H, 8, 6), mat);
    ear.name = 'ear';
    ear.scale.set(0.65, 2.0, 0.6);
    ear.position.set(side * HEAD_R * 1.0 * H, (HEAD_Y - HEAD_R * 0.45) * H, 0);
    g.add(ear);
  }

  return g;
}
