import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBirds, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 34;

// "Mind is not Buddha. Learning is not the path." Two sentences, and Mumon
// says Nansen was getting old and forgot to be ashamed.
//
// The scene is the study the second sentence walks out of — the RED house
// the old man has turned his back on — a bare reading mat before its door,
// and Nansen standing apart from all of it. Overhead, birds.
//
// Touch the mat and the birds scatter. That is the whole of what the words
// do when they leave the paper — they go up, they wheel around, and they
// settle again somewhere you were not watching.
export default {
  id: ID,
  slug: 'learning-is-not-the-path',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'birds', 'music'],
  camera: { distance: 10.5, target: [0.7, 1.5, -0.8], azimuth: 0.55, polar: 1.22 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // The road, back to ordinary dirt — it carried the case's red for a
    // while, but a ground-spanning ribbon never sat right as a seal.
    const path = makePath({ from: [4.6, 8.2], to: [1.4, -18], width: 1.3, seed: ID, groundSeed: 21, wander: 0.8 });
    scene.add(path);

    // THE STUDY is the seal now (Frank: "make the little house red, because
    // it mentions his home") — the one red thing is the home the sentences
    // walk out of. A building is a big mass, so it takes the DEEP mix, per
    // the palette's own rule: same hue, less glare.
    const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, color: ACCENT_DEEP });
    hut.position.set(-1.0, 0, -3.6);
    hut.rotation.y = 0.46;
    scene.add(hut);

    // THE MAT, bare. Lifted just clear of the ground and drawn in front of it
    // (polygonOffset) so it never z-fights the terrain or the path. The
    // scrolls that used to cover it — 22 loose cylinders, then a cord-wood
    // pile with part-unrolled ribbons — are GONE entirely: three rounds of
    // Frank asking what the cylinders were is the answer to whether they ever
    // read as scrolls. An empty reading mat before a shut-up study says
    // "learning, abandoned" better than any prop pile did.
    const matMat = toonMaterial({ color: WASH.dry, flat: true });
    matMat.polygonOffset = true;
    matMat.polygonOffsetFactor = -2;
    const mat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 1.9), matMat);
    mat.name = 'mat';
    mat.position.set(-0.1, 0.035, -0.7);
    mat.rotation.y = 0.2;
    scene.add(mat);

    // NANSEN, apart from it, facing away — he said the sentence and walked off
    const nansen = makeMonk({ height: 1.66, elder: true });
    nansen.position.set(3.4, 0, 1.9);
    aimMonk(nansen, { x: 8.0, z: 4.0 });
    scene.add(nansen);

    // THE BIRDS: the words that have already left, crossing the sky
    const birds = makeBirds({ count: 8, seed: ID, center: [0.6, -1.2], height: 6.4, spread: 5.2 });
    scene.add(birds.group);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: hut.position.x, z: hut.position.z, r: 3.0 },
        { x: 0.7, z: -0.9, r: 2.2 },
        { x: 3.4, z: 1.9, r: 1.2 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: hut.position.x, z: hut.position.z, r: 2.0 },
        { x: 0.9, z: -0.7, r: 1.7 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [nansen.position, 0.7, 0.54, 0.42],
      [hut.position, 2.0, 1.6, 0.30],
      [new THREE.Vector3(-0.1, 0, -0.8), 1.3, 1.0, 0.26],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.7, 0.9, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'mat-hit';
    hit.userData.noOutline = true;
    hit.position.set(-0.1, 0.35, -0.8);
    scene.add(hit);

    // ---- the moment: the words go up -------------------------------------
    let camera = null;
    let clock = 0;
    let disturbed = 0;
    let lastAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (clock - lastAt < 0.5) return;
      lastAt = clock;
      birds.scatter();
      disturbed++;
      audio && audio.chimeStrike({ tube: 4, force: 0.45 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        birds.update(dt, simTime);
      },
      fragment() {
        return {
          disturbed,
          birds: birds.count(),
          aloft: +birds.energy().toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
