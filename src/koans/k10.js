import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMonk, faceMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 10;

// Seizei says he is alone and poor and asks for support. Sozan tells him he
// has already drunk three cups of the best wine in China and is still claiming
// his lips are dry.
//
// So there are three cups in the scene, set out on the mat between them, and
// they are the only warm thing in it. Tip one over and you find what Sozan
// already knows: it is empty, and it was empty before you touched it, because
// it has already been drunk. Tip all three and after a while they stand
// themselves back up, full of exactly as much as they were before.

const TIP = 0.55;         // seconds for a cup to go over
const RIGHT_AFTER = 4.5;  // and how long all three lie there before standing up
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'seizei-alone-and-poor',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'cups', 'music'],
  camera: { distance: 8.6, target: [0.7, 1.0, 0.4], azimuth: 0.55, polar: 1.27 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [4.0, 8.4], to: [-2.0, -18], width: 1.2, seed: ID, groundSeed: 21, wander: 1.2 });
    scene.add(path);

    // Sozan's hut, which is not much of a hut either
    const hut = makeHut({ width: 2.6, height: 2.1, depth: 2.2 });
    hut.position.set(-1.4, 0, -4.0);
    hut.rotation.y = 0.5;
    scene.add(hut);

    // the mat they are sitting on — the whole of Seizei's estate
    const matGeo = new THREE.BoxGeometry(2.5, 0.035, 1.7);
    const mat = new THREE.Mesh(matGeo, toonMaterial({ color: WASH.dry, flat: true }));
    mat.name = 'mat';
    mat.position.set(0.7, 0.018, 0.5);
    mat.rotation.y = 0.24;
    scene.add(mat);

    // SEIZEI, sitting on it with nothing
    const seizei = makeMonk({ height: 1.5, pose: 'sit', cushion: false });
    seizei.position.set(1.75, 0.035, 1.0);
    scene.add(seizei);

    // SOZAN, sitting across from him, who has been counting
    const sozan = makeMonk({ height: 1.56, pose: 'sit', elder: true, stout: 1.04, cushion: false });
    sozan.position.set(-0.35, 0.035, 0.0);
    scene.add(sozan);
    faceMonk(seizei, sozan.position);
    faceMonk(sozan, seizei.position);

    // THE THREE CUPS, between them. Small, held, already drunk.
    const cupMat = toonMaterial({ color: ACCENT, flat: true });
    const cups = [];
    const CUP_AT = [[0.55, 0.72], [0.92, 0.34], [1.12, 0.86]];
    for (const [i, [cx, cz]] of CUP_AT.entries()) {
      const pivot = new THREE.Group();       // tips about its own foot
      pivot.name = 'cup';
      pivot.position.set(cx, 0.035, cz);
      pivot.rotation.y = i * 1.1;
      const profile = [
        [0.001, 0.000], [0.035, 0.000], [0.032, 0.012], [0.052, 0.055],
        [0.060, 0.090], [0.056, 0.092], [0.048, 0.058], [0.028, 0.014], [0.000, 0.010],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 9), cupMat);
      cup.name = 'cup-body';
      pivot.add(cup);
      scene.add(pivot);
      cups.push({ pivot, tippedAt: -99 });
    }

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: hut.position.x, z: hut.position.z, r: 2.7 },
        { x: 0.7, z: 0.5, r: 2.2 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: hut.position.x, z: hut.position.z, r: 1.8 },
        { x: 0.7, z: 0.5, r: 1.7 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [seizei.position, 0.6, 0.48, 0.40],
      [sozan.position, 0.62, 0.5, 0.40],
      [hut.position, 1.8, 1.4, 0.30],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    // forgiving targets, because a wine cup is 6cm across
    for (const c of cups) {
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, 0.22, 6),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.name = 'cup-hit';
      hit.userData.noOutline = true;
      hit.position.y = 0.09;
      c.pivot.add(hit);
      c.hit = hit;
    }

    // ---- the moment: they were empty already ------------------------------
    let camera = null;
    let clock = 0;
    let tipped = 0;
    let allDownAt = -99;

    input.onTap(() => {
      if (!camera) return;
      for (const c of cups) {
        if (c.tippedAt > -99) continue;
        if (!input.raycastFirst(camera, [c.hit])) continue;
        c.tippedAt = clock;
        tipped++;
        // ceramic, and lighter than you expected
        audio && audio.knock({ force: 0.28 });
        if (tipped === cups.length) allDownAt = clock;
        return;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        // once all three are down they lie a while, then stand back up
        if (allDownAt > -99 && clock - allDownAt > RIGHT_AFTER) {
          for (const c of cups) c.tippedAt = -99;
          tipped = 0;
          allDownAt = -99;
        }

        for (const c of cups) {
          const u = c.tippedAt > -99 ? clamp01((clock - c.tippedAt) / TIP) : 0;
          const e = u * u * (3 - 2 * u);
          c.pivot.rotation.z = -(Math.PI / 2) * e;
        }
      },
      fragment() {
        return { tipped, standing: cups.length - tipped };
      },
      dispose() {},
    };
  },
};
