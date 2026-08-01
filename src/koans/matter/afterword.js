import * as THREE from '../../../lib/three.module.js';
import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';
import { WASH } from '../../palette.js';
import { makeBuddha, groundHeight, toonMaterial, addOutlines } from '../../kit/index.js';

// Mumon's afterword, the Zen Warnings, and the letter that produced case 49 —
// in that order, so the book ends on "Say it quick. Say it quick."
//
// Amban's letter is really the preface to case 49, so a reader meets it after
// the case it introduces. That inversion is accepted: it reads as the machinery
// shown afterwards, and the alternative is editing a case.
//
// The scene is the world with everything taken out of it — no gate, no path, no
// lanterns, no one walking. Ground, mountains, forest, and the fog. Except: one
// figure stayed behind. A Buddha on a small mat under the tree the opening
// camera looks past (Frank, overnight pass 2), off to the side of the frame,
// facing the spot where the gate stood in the intro — meditating on the door
// everyone else left by. The camera is not on him; he is found, not shown.
const page = MATTER.afterword;

// The tree: hub world seed 7 places its five scatter trees deterministically,
// and this one — at (3.04, −11.7) — is the only one sitting near the initial
// camera's view axis (lateral offset ~4.6 against ~7–10 for the rest). The mat
// sits a step out from the trunk on its camera side, under the canopy edge.
const TREE = { x: 3.04, z: -11.7 };
const GATE_SPOT = { x: 0.861, z: -6 };        // buildHub's gateTarget, on the ground
const MAT = { x: 2.65, z: -10.68, r: 0.55, h: 0.05 };

export default {
  id: null,
  slug: page.slug,
  title: page.title,
  sections: page.sections,
  labels: page.labels,
  text: page.text,
  accent: undefined,
  ambience: ['wind:0.30', 'music'],
  mood: 'in',
  camera: { distance: 16, azimuth: 0.5, polar: 1.3 },
  build() {
    const built = buildHub({ gate: false, path: false, monk: false, lanterns: false });
    const scene = built.scene;

    // the mat: the same four-sided cylinder every mat in the book is (k30,
    // k33), in the dark wash — the quiet version, not a seal
    const y0 = groundHeight(MAT.x, MAT.z, { seed: 7 });   // the hub's groundSeed
    const mat = new THREE.Mesh(
      new THREE.CylinderGeometry(MAT.r, MAT.r, MAT.h, 4),
      toonMaterial({ color: WASH.dark, flat: true }));
    mat.name = 'mat';
    mat.rotation.y = Math.PI / 4;
    mat.position.set(MAT.x, y0 + MAT.h / 2, MAT.z);
    scene.add(mat);

    // the meditator, ordinary monk scale, facing where the gate was: seated
    // figures face local +z, so swing +z onto the mat→gate bearing
    const buddha = makeBuddha({ height: 1.6 });
    buddha.position.set(MAT.x, y0 + MAT.h, MAT.z);
    buddha.rotation.y = Math.atan2(GATE_SPOT.x - MAT.x, GATE_SPOT.z - MAT.z);
    scene.add(buddha);
    // buildHub outlined its scene before these two existed; the call is
    // per-mesh idempotent, so scoping a second one to the additions is safe
    addOutlines(mat, { width: 0.035, wobble: 0.7 });
    addOutlines(buddha, { width: 0.035, wobble: 0.7 });

    // A small clearing, only where he actually sits: the hub placed its
    // scatter with no keepout here, so retire any instance that landed under
    // the mat by sinking it well below the ground (the matrix stays finite
    // and invertible, the instanced draw stays intact, and it is exactly as
    // deterministic as the placement was). Grass keeps growing right up to
    // the mat's edge — the house rule — so the tuft clearing radius hugs the
    // mat; rocks and bushes get a touch more: a boulder shouldering the
    // meditator reads as bad luck, not nature.
    const CLEAR = { rocks: 0.95, bushes: 0.95, grassfield: 0.7 };
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    scene.traverse((o) => {
      const r = o.isInstancedMesh && CLEAR[o.name];
      if (!r) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if (Math.hypot(p.x - MAT.x, p.z - MAT.z) >= r) continue;
        m.setPosition(p.x, p.y - 30, p.z);
        o.setMatrixAt(i, m);
      }
      o.instanceMatrix.needsUpdate = true;
    });

    return built;
  },
};
