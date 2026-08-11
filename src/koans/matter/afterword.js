import * as THREE from '../../../lib/three.module.js';
import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';
import { WASH } from '../../palette.js';
import {
  makeBuddha, makeCat, makeWildflowers, groundHeight, toonMaterial, addOutlines,
  plantTree,
} from '../../kit/index.js';
import { eyePosition } from '../../camera.js';

// Mumon's afterword, the Zen Warnings, and the letter that produced case 49 —
// in that order, so the book ends on "Say it quick. Say it quick."
//
// Amban's letter is really the preface to case 49, so a reader meets it after
// the case it introduces. That inversion is accepted: it reads as the machinery
// shown afterwards, and the alternative is editing a case.
//
// The scene is the world with the PEOPLE and the built things taken out of it —
// no gate, no path, no lanterns, no one walking. Ground, mountains, forest, a
// meadow gone to wildflowers, and the fog. What was cleared is the traffic, not
// the life: an empty road through dead ground is a bleaker last picture than
// this book earns. Except: two stayed behind. A Buddha on a small mat under the tree the opening camera
// looks past (Frank, overnight pass 2), off to the side of the frame, facing
// the spot where the gate stood in the intro — meditating on the door everyone
// else left by. The camera is not on him; he is found, not shown.
//
// And the cat (Frank: "for the afterword lets add the cat to the scene sitting
// nearby"), a step off the mat, facing the same empty spot he is. It is the one
// creature in the book that turns up wherever it likes — the sermon in case 6,
// the washing-up in case 7, its own case 14 — so of course it is still here
// after the last page, and of course nobody is left to argue over it.
const page = MATTER.afterword;

// Its own three seeds, for the same reason the preface has its own: the book
// should not close on the picture it opened from. The stage clears AND the land
// is different — a valley the reader has not stood in, which is what the end of
// a book looks like.
const SEEDS = { seed: 35, groundSeed: 58, pathSeed: 17 };

// HIS TREE IS HIS OWN (Frank: "let's just have it so Buddha sits under his own
// custom tree that we set up and place"). It used to be picked out of the hub's
// scatter at build time, which was itself a fix for something worse — a
// coordinate copied out of one particular seed's scatter, "(3.04, −11.7)", so
// that the day the hub's seed changed the tree moved and the meditator did not:
// he sat in open grass, under nothing, and no test or screenshot said a word.
//
// Planting our own removes that hazard rather than reopening it, PROVIDED the
// tree is not written down as a raw coordinate either. It is placed in the
// SHOT'S OWN FRAME — so far past the gate spot along the view axis, so far off
// the centre line — and the mat is then derived from the trunk exactly as
// before. Tree and meditator come from one number now instead of two that have
// to agree, which is stronger than the derivation it replaces: there is no
// second thing left to go stale.
//
// An OAK, not the scatter's broadleaf: it is bigger and broader than anything
// the hub plants (tests/k38 pins that), so the one tree in this picture that
// matters reads as his rather than as one more tree that happened to be there.
const TREE = {
  kind: 'oak',
  height: 5.2,
  depth: 3.2,     // units beyond the gate spot, along the view axis
  side: 2.8,      // units off the centre line — beside the shot, still in it.
                  // Positive is camera-RIGHT at this page's framing. 4.5 (the
                  // old derivation's target) put the oak half off the right
                  // edge with him hidden behind the trunk.
  seed: 41,       // pinned, so his tree is the same tree every time the book ends
};
// Any hub tree closer than this to his gets cleared away. Two trunks growing
// through each other is worse than one fewer tree in a field of them, and the
// hub's scatter knows nothing about what we are about to plant.
const TREE_CLEAR = 3.4;
const MAT_R = 0.55, MAT_H = 0.05;
// How far out from the trunk the mat sits, toward the camera. About a canopy
// radius: under the edge of the leaves rather than against the bark.
const OFF = 1.1;
// Named, because build() has to solve the rig's own equation to know where the
// reader is standing before it can put anything to one side of them.
const CAM = { distance: 14.8, target: [-0.705, 1.9, -6], heading: 27.5, pitch: 15.5 };

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
  camera: CAM,
  build() {
    const built = buildHub({ gate: false, path: false, monk: false, lanterns: false, ...SEEDS });
    const scene = built.scene;

    // WHERE THE GATE STOOD, and where the reader is standing to look at it —
    // both read off the scene rather than written down, so they follow the road
    // wherever this page's pathSeed bends it. The eye comes from the rig's own
    // eyePosition rather than a second copy of its trig — a copy would have been
    // one more thing to find when the camera changed vocabulary.
    const [gx, , gz] = built.gateTarget;
    const [ex, , ez] = eyePosition(CAM, built.gateTarget);
    const eye = { x: ex, z: ez };

    // HIS TREE, placed rather than found. The frame is the shot's own: a unit
    // vector down the view axis (eye -> gate) and its perpendicular, so `depth`
    // and `side` mean what they say however this page's pathSeed bends the road
    // or the camera vocabulary changes.
    const ax = gx - eye.x, az = gz - eye.z;
    const axisLen = Math.hypot(ax, az) || 1;
    const ux = ax / axisLen, uz = az / axisLen;          // down the axis
    const px = -uz, pz = ux;                             // and across it
    const tx = eye.x + ux * (axisLen + TREE.depth) + px * TREE.side;
    const tz = eye.z + uz * (axisLen + TREE.depth) + pz * TREE.side;

    // Clear the hub's own scatter out of his spot first. buildHub scattered
    // those before this page had any say in it, so without this a seed is free
    // to have already put a trunk exactly where his goes.
    for (const t of built.trees.slice()) {
      if (Math.hypot(t.position.x - tx, t.position.z - tz) < TREE_CLEAR) {
        t.parent && t.parent.remove(t);
        built.trees.splice(built.trees.indexOf(t), 1);
      }
    }

    const bodhi = plantTree(scene, {
      x: tx, z: tz, kind: TREE.kind, height: TREE.height, seed: TREE.seed,
      groundSeed: built.groundSeed,
    });
    bodhi.name = 'bodhi';   // his, and findable — tests/matter.test.js seats him under THIS tree

    // The mat sits a step out from that trunk, on the camera's side of it, so
    // he is under the canopy edge rather than behind the tree.
    const ox = eye.x - tx, oz = eye.z - tz;
    const olen = Math.hypot(ox, oz) || 1;
    const MAT = { x: tx + (ox / olen) * OFF, z: tz + (oz / olen) * OFF };

    // the mat: the same four-sided cylinder every mat in the book is (k30,
    // k33), in the dark wash — the quiet version, not a seal
    const y0 = groundHeight(MAT.x, MAT.z, { seed: built.groundSeed });
    const mat = new THREE.Mesh(
      new THREE.CylinderGeometry(MAT_R, MAT_R, MAT_H, 4),
      toonMaterial({ color: WASH.dark, flat: true }));
    mat.name = 'mat';
    mat.rotation.y = Math.PI / 4;
    mat.position.set(MAT.x, y0 + MAT_H / 2, MAT.z);
    scene.add(mat);

    // the meditator, ordinary monk scale, facing where the gate was: seated
    // figures face local +z, so swing +z onto the mat→gate bearing
    const buddha = makeBuddha({ height: 1.6 });
    buddha.position.set(MAT.x, y0 + MAT_H, MAT.z);
    buddha.rotation.y = Math.atan2(gx - MAT.x, gz - MAT.z);
    scene.add(buddha);
    // THE CAT, a stride off the mat on his left, sitting the way it sits in
    // every other case it has walked into. Facing where he faces rather than
    // facing HIM: k6's cat watches the Buddha because that case is about who
    // understood the sermon, and this page is not about anything — the two of
    // them are simply looking at the same empty road.
    const CAT_OUT = 0.95;
    const psi = buddha.rotation.y;
    // his local +x in world, which is his left as the reader sees him
    const CAT = { x: MAT.x + Math.cos(psi) * CAT_OUT, z: MAT.z - Math.sin(psi) * CAT_OUT };
    const cat = makeCat({ height: 0.32, seed: 49, pose: 'sit' });
    cat.group.position.set(CAT.x, groundHeight(CAT.x, CAT.z, { seed: built.groundSeed }), CAT.z);
    cat.group.rotation.y = psi;
    scene.add(cat.group);

    // buildHub outlined its scene before these three existed; the call is
    // per-mesh idempotent, so scoping a second one to the additions is safe
    addOutlines(mat, { width: 0.035, wobble: 0.7 });
    addOutlines(buddha, { width: 0.035, wobble: 0.7 });
    addOutlines(cat.group, { width: 0.035, wobble: 0.7 });

    // A small clearing, only where the two of them actually sit: the hub placed
    // its scatter with no keepout here, so retire any instance that landed
    // under them by sinking it well below the ground (the matrix stays finite
    // and invertible, the instanced draw stays intact, and it is exactly as
    // deterministic as the placement was). Grass keeps growing right up to
    // the mat's edge — the house rule — so the tuft clearing radius hugs the
    // mat; rocks and bushes get a touch more: a boulder shouldering the
    // meditator reads as bad luck, not nature.
    const CLEAR = { rocks: 0.95, bushes: 0.95, grassfield: 0.7 };
    // The cat's own clearing, as a fraction of his: it is a third of his height
    // and 0.32 of animal disappears in full meadow (k7 learned that the hard
    // way and k6 wrote it down), but a cat-sized bald patch is all it needs.
    const SPOTS = [{ x: MAT.x, z: MAT.z, k: 1 }, { x: CAT.x, z: CAT.z, k: 0.7 }];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    scene.traverse((o) => {
      const r = o.isInstancedMesh && CLEAR[o.name];
      if (!r) return;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if (!SPOTS.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < r * s.k)) continue;
        m.setPosition(p.x, p.y - 30, p.z);
        o.setMatrixAt(i, m);
      }
      o.instanceMatrix.needsUpdate = true;
    });

    // WILDFLOWERS through the valley (Frank). The stage is cleared of people and
    // built things, not of life — an empty road with the meadow gone over is a
    // different, bleaker ending than the one this page wants. They keep the
    // kit's default whitish bloom: this page has `accent: undefined` and no
    // seal, and a red head would invent one on the last picture in the book.
    //
    // Placed with their own keepouts rather than through the CLEAR sweep above
    // — that sweep retires instances the hub had already scattered blind, and
    // these are ours to put down correctly the first time.
    // Count and scale are measured against k32's field, which reads correctly:
    // 120 at scale 1 over this radius put only 70 in frame at ~3.8px a head and
    // vanished into the fog.
    const flowers = makeWildflowers({
      count: 260, rMin: 2.5, radius: 20, scale: 1.5, seed: 58, groundSeed: built.groundSeed,
      keepout: [
        { x: MAT.x, z: MAT.z, r: 0.85 },
        { x: CAT.x, z: CAT.z, r: 0.5 },
      ],
    });
    scene.add(flowers.mesh);

    // buildHub's own return, with the cat driven off the end of it: its barrel
    // breathes and its tail drifts, which is the only thing moving on this page
    // besides the meadow. The simTime guard is the house idiom — a cat handed a
    // NaN clock stops breathing and never starts again.
    let clock = 0;
    return {
      ...built,
      update(dt, simTime) {
        built.update(dt, simTime);
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        cat.update(Math.max(0, dt || 0), clock);
        flowers.update(Math.max(0, dt || 0), clock);
      },
    };
  },
};
