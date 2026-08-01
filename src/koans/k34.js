import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeHut, makeBirds, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { mergeSimple } from '../kit/scatter.js';

const ID = 34;

// "Mind is not Buddha. Learning is not the path." Two sentences, and Mumon
// says Nansen was getting old and forgot to be ashamed.
//
// The scene is what the second sentence is aimed at: a study whose scrolls
// have overflowed the door and gone on piling up outside, and the old man
// standing apart from all of it with his back to the lot. Overhead, birds.
//
// Touch the scrolls and the birds scatter. That is the whole of what the
// words do when they leave the paper — they go up, they wheel around, and
// they settle again somewhere you were not watching.
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

    // THE PATH is the seal (Frank): "Learning is not the PATH" — the road is
    // named in the case, so it is the one red thing. Routed to the right of the
    // study so the spilled scrolls no longer sit on the road (which was also
    // where the z-fighting came from).
    const path = makePath({ from: [4.6, 8.2], to: [1.4, -18], width: 1.3, seed: ID, groundSeed: 21, wander: 0.8, color: ACCENT });
    scene.add(path);

    // the study, its door standing open because it cannot close any more
    const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4 });
    hut.position.set(-1.0, 0, -3.6);
    hut.rotation.y = 0.46;
    scene.add(hut);

    // the mat the overflow has reached. Lifted just clear of the ground and
    // drawn in front of it (polygonOffset) so it never z-fights the terrain or
    // the path, and moved left off the road.
    const matMat = toonMaterial({ color: WASH.dry, flat: true });
    matMat.polygonOffset = true;
    matMat.polygonOffsetFactor = -2;
    const mat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.03, 1.9), matMat);
    mat.name = 'mat';
    mat.position.set(-0.1, 0.035, -0.7);
    mat.rotation.y = 0.2;
    scene.add(mat);

    // THE SCROLLS. The old version was 22 loose cylinders flung across the
    // whole mat — Frank: "what are all of the cylinders around on the ground
    // for?" A scroll is only legible as a scroll when it behaves like one, so
    // the overflow is STACKED: a cord-wood pile by the door (a bottom row, a
    // nested row, a crown) and two scrolls lying PART-UNROLLED on the mat — a
    // pale ribbon of paper ending in its own roll, which is the one
    // silhouette that says "scroll" and not "pipe". The round-1 tumbled rolls
    // off the pile's skirt are gone too (Frank, round 2: "get rid of the
    // cylinders that are lying there") — loose cylinders never read as
    // anything but cylinders; only the pile and the unrolled pages remain,
    // merged into three meshes by tone.
    const scrolls = new THREE.Group();
    scrolls.name = 'scrolls';
    const PILE = { x: -0.3, z: -1.25 };       // by the door edge of the mat
    const AX = 0.2;                            // rolls lie along the mat's grain
    const dirX = Math.cos(AX), dirZ = -Math.sin(AX);   // roll axis
    const perpX = Math.sin(AX), perpZ = Math.cos(AX);  // across the pile
    const R = 0.058;                           // one gauge, like a bound set
    const rollGeo = (x, y, z, yaw, len) => {
      const g = new THREE.CylinderGeometry(R, R, len, 7);
      g.rotateZ(Math.PI / 2);
      g.rotateY(yaw);
      g.translate(x, y, z);
      return g;
    };
    const light = [], dark = [], paper = [];
    // the pile: five below, three nested in the gaps, one on the crown
    const rows = [[-2, -1, 0, 1, 2], [-1.5, -0.5, 0.5], [0]];
    rows.forEach((row, tier) => {
      row.forEach((k, j) => {
        const i = tier * 7 + j;
        const jx = (hash1(i * 3 + 1, ID) - 0.5) * 0.04;
        const len = 0.44 + hash1(i * 3 + 2, ID) * 0.12;
        const g = rollGeo(
          PILE.x + perpX * k * 0.125 + dirX * jx,
          0.05 + R + tier * R * 1.72,
          PILE.z + perpZ * k * 0.125 + dirZ * jx,
          AX + (hash1(i * 3 + 3, ID) - 0.5) * 0.14,
          len);
        (hash1(i * 5 + 4, ID) < 0.5 ? light : dark).push(g);
      });
    });
    // two part-unrolled: a ribbon of paper running out from the pile, the
    // remaining roll waiting at its far end
    for (const [fx, fz, len] of [[0.42, 0.91, 0.95], [0.97, 0.10, 0.62]]) {
      const w = 0.34;
      const strip = new THREE.BoxGeometry(w, 0.014, len);
      strip.rotateY(Math.atan2(fx, fz));
      strip.translate(PILE.x + fx * (0.32 + len / 2), 0.058, PILE.z + fz * (0.32 + len / 2));
      paper.push(strip);
      paper.push(rollGeo(
        PILE.x + fx * (0.32 + len + 0.02),
        0.05 + R,
        PILE.z + fz * (0.32 + len + 0.02),
        Math.atan2(fx, fz) + Math.PI / 2, w + 0.06));
    }
    for (const [geos, tone] of [[light, 0.11], [dark, 0.24], [paper, 0.06]]) {
      const m = new THREE.Mesh(mergeSimple(geos), toonMaterial({ color: wash(tone), flat: true }));
      m.name = 'scroll';
      scrolls.add(m);
    }
    scene.add(scrolls);

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
    hit.name = 'scrolls-hit';
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
