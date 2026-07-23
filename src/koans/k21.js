import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 21;

// "What is Buddha?" — "Dried dung."
//
// The answer is deliberately worthless, so the scene refuses to dress it up.
// A yard swept to bare earth, one dried stick standing in the middle of it,
// two figures, and nothing else: no lantern, no path, no hut, the trees kept
// out at the fog line. The emptiness is the staging.
//
// The one warm mark on the page is a seal stamped in the dirt at the stick's
// foot — the painter signing a picture of a piece of dung, which is the joke
// Mumon is already making in the commentary.
export default {
  id: ID,
  slug: 'dried-dung',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // nothing here makes a sound but the wind, so the drift plays in full
  ambience: ['wind:0.30', 'music'],
  camera: { distance: 10.5, target: [0.8, 1.05, 0.2], azimuth: 0.55, polar: 1.22 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.032);
    scene.add(makeLights());

    // THE STICK. Dry, crooked, a hand taller than it needs to be, standing in
    // swept ground. Three tapering segments with a slight kink at each joint,
    // because a perfectly straight stick reads as a post.
    const stick = new THREE.Group();
    stick.name = 'stick';
    const dryMat = toonMaterial({ color: WASH.mid, flat: true });
    const SEGS = [
      { h: 0.30, r0: 0.055, r1: 0.048, tilt: 0.03 },
      { h: 0.28, r0: 0.048, r1: 0.040, tilt: -0.07 },
      { h: 0.24, r0: 0.040, r1: 0.026, tilt: 0.10 },
    ];
    let y = 0;
    let node = stick;
    for (const [i, s] of SEGS.entries()) {
      const joint = new THREE.Group();
      joint.name = 'joint';
      joint.position.y = i === 0 ? 0 : y;
      joint.rotation.z = s.tilt;
      const geo = new THREE.CylinderGeometry(s.r1, s.r0, s.h, 6);
      geo.translate(0, s.h / 2, 0);
      const seg = new THREE.Mesh(geo, dryMat);
      seg.name = 'seg';
      joint.add(seg);
      node.add(joint);
      node = joint;
      y = s.h;
    }
    stick.position.set(0.8, 0, 0.2);
    scene.add(stick);

    // The seal, pressed into the dirt at its foot: a small vermillion disc,
    // flat to the ground, the only accent in the scene.
    const seal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.012, 4),
      toonMaterial({ color: ACCENT, flat: true }));
    seal.name = 'seal';
    seal.rotation.y = 0.4;
    seal.position.set(1.15, 0.008, 0.52);
    scene.add(seal);

    // Ummon, who said it, and the monk who asked. Set well apart: the space
    // between them is doing as much work as they are.
    const ummon = makeMonk({ height: 1.66, elder: true });
    ummon.position.set(-1.9, 0, -0.6);
    aimMonk(ummon, stick.position);
    scene.add(ummon);

    const monk = makeMonk({ height: 1.56 });
    monk.position.set(2.6, 0, 2.4);
    aimMonk(monk, ummon.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 2,                       // and those kept out at the fog line
      treeRing: [16, 24],
      rocks: 5,
      bushes: 3,
      keepout: [
        { x: 0.8, z: 0.2, r: 6.0 },   // the swept yard: nothing scatters into it
        { x: -1.9, z: -0.6, r: 1.2 },
        { x: 2.6, z: 2.4, r: 1.2 },
      ],
      // and the yard is swept to bare earth, which is the one thing this scene
      // has instead of scenery
      grassKeepout: [{ x: 0.8, z: 0.2, r: 5.2 }],
    });

    for (const [p, rx, rz, op] of [
      [ummon.position, 0.68, 0.52, 0.42],
      [monk.position, 0.62, 0.5, 0.40],
      [stick.position, 0.20, 0.16, 0.30],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 1.1, 0.4),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'stick-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.8, 0.45, 0.2);
    scene.add(hit);

    // ---- the moment: it is a stick ---------------------------------------
    // Touch it and it wobbles, dryly, and stops. There is nothing else in it.
    let camera = null;
    let clock = 0;
    let taps = 0;
    const knocks = [];

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      knocks.push(clock);
      if (knocks.length > 4) knocks.shift();
      taps++;
      audio && audio.knock({ force: 0.45 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        let a = 0;
        for (const t0 of knocks) {
          const t = clock - t0;
          if (t < 0) continue;
          a += 0.09 * Math.exp(-t / 0.5) * Math.sin(2 * Math.PI * t / 0.30);
        }
        stick.rotation.z = a;
        stick.rotation.x = a * 0.4;
      },
      fragment() {
        return { taps, wobble: +stick.rotation.z.toFixed(4) };
      },
      dispose() {},
    };
  },
};
