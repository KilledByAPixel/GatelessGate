import * as THREE from '../../../lib/three.module.js';
import MATTER from '../text/matter.js';
import { buildHub } from '../../intro.js';
import { WASH } from '../../palette.js';
import {
  makeBuddha, makeCat, makeWildflowers, groundHeight, toonMaterial, addOutlines,
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
const SEEDS = { seed: 34, groundSeed: 58, pathSeed: 17 };

// The mat: a step out from a tree's trunk on its camera side, under the canopy
// edge. WHICH tree is chosen at build time, not written down. It used to be a
// coordinate copied out of one particular seed's scatter — "(3.04, −11.7), the
// only one near the camera's view axis" — and the day the hub's seed changed
// that tree moved and the meditator did not: he sat in open grass, under
// nothing, and no test or screenshot said a word. So the pairing is derived
// now. It cannot come apart.
const MAT_R = 0.55, MAT_H = 0.05;
// How far out from the trunk the mat sits, toward the camera. About a canopy
// radius: under the edge of the leaves rather than against the bark.
const OFF = 1.1;
// Named, because build() has to solve the rig's own equation to know where the
// reader is standing before it can put anything to one side of them.
const CAM = { distance: 16, heading: 28.6, pitch: 15.5 };

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

    // HIS TREE: of the scatter trees standing well beyond the gate spot, the one
    // whose offset from the view axis is nearest SIDE. Not the one NEAREST the
    // axis — that is the middle of the picture, and the whole point of him is
    // that the camera is not on him. SIDE is where the old hand-picked tree sat
    // (about four and a half units off the centre line), which is far enough to
    // be beside the shot and near enough to still be in it.
    const SIDE = 4.5, PAST = 1.5;
    const ax = gx - eye.x, az = gz - eye.z;
    const axisLen = Math.hypot(ax, az) || 1;
    const candidates = built.trees.map((t) => {
      const dx = t.position.x - eye.x, dz = t.position.z - eye.z;
      return {
        t,
        along: (dx * ax + dz * az) / axisLen,               // depth into the shot
        lateral: Math.abs(dx * az - dz * ax) / axisLen,     // off the centre line
      };
    });
    const bySide = (pool) =>
      pool.slice().sort((a, b) => Math.abs(a.lateral - SIDE) - Math.abs(b.lateral - SIDE))[0];
    const tree = bySide(candidates.filter((c) => c.along > axisLen + PAST))
      // A seed can put every tree short of the gate spot. Then the deepest of
      // them is still a tree to sit under, and no meditator at all is not an
      // option — this page has exactly one figure in it.
      || candidates.slice().sort((a, b) => b.along - a.along)[0];

    // The mat sits a step out from that trunk, on the camera's side of it, so
    // he is under the canopy edge rather than behind the tree.
    const tx = tree.t.position.x, tz = tree.t.position.z;
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
    const SPOTS = [{ x: MAT.x, z: MAT.z, k: 1 }, { x: CAT.x, z: CAT.z, k: 0.62 }];
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
