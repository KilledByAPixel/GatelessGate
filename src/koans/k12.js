import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makeCliff, makeMonk,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';
import { makeButterflies } from '../kit/butterflies.js';
import { groundHeight } from '../kit/ground.js';

const ID = 12;

// Zuigan called out to himself every day. "Master." — "Yes, sir." — "Become
// sober." — "Yes, sir." — "Do not be deceived by others." — "Yes, sir; yes,
// sir." Mumon says he is running a puppet show with one mask calling and
// another answering.
//
// So there is one figure in the scene and nobody else in it at all — a ledge
// above a drop, which is the only staging that makes a voice come back. Call,
// and a moment later the answer arrives from out over the gorge in your own
// voice, a little quieter. Call three times and you get the whole exchange,
// and then it starts over, every day, the way he did it.
//
// The red butterflies over the open ground are the seal: the one thing up here
// that is not him and not the weather. His staff is his own, and ink.

const ECHO = 0.62;
const LINES = 3;

export default {
  id: ID,
  slug: 'zuigan-calls-his-own-master',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.32', 'echo', 'music'],
  mood: 'yo',      // it is a daily, cheerful, slightly ridiculous habit
  camera: { distance: 12.0, target: [0.6, 2.2, -0.6], azimuth: 0.70, polar: 1.20 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the ledge, and the air past it
    const cliff = makeCliff({ width: 13, drop: 6.5, depth: 2.6, seed: ID, origin: [0.4, -2.0], yaw: 0.22 });
    scene.add(cliff);

    // ZUIGAN, alone, near the edge. `elder` gives him the kit's own staff, held
    // the ordinary way and in his own ink — the free-standing vermillion shaft
    // that used to be planted beside him is gone (Frank: "get rid of the red
    // staff; maybe he could be holding a staff, a normal pose, but it won't be
    // red"). Nothing about the man is the seal any more.
    const zuigan = makeMonk({ height: 1.64, elder: true });
    zuigan.position.set(0.9, 0, -0.5);
    zuigan.rotation.y = .2;
    scene.add(zuigan);

    // THE BUTTERFLIES ARE THE SEAL now, and they play over the open ground the
    // lens is actually pointed at rather than tucked in beside him. The camera
    // stands at (7.8, 6.6, 8.0) and looks down the diagonal past his shoulder,
    // so the middle of the frame is the plain around (-3, -5); a ray down the
    // centre column lands there at every height. Seven of them over a wide disc
    // is a scattering across the whole open half of the picture rather than a
    // knot in one corner of it.
    const butterflies = makeButterflies({
      count: 7, seed: ID, color: ACCENT, size: 0.42,
      center: [-2.2, -4.4], radius: 5.0, height: [0.7, 2.6],
      groundFn: (x, z) => groundHeight(x, z, { seed: 21 }),
    });
    scene.add(butterflies.group);

    // The pine that used to stand on the lip at (-2.9, -0.4) is GONE — a
    // different species growing right beside the one figure, and it never
    // read as well as the ordinary trees (Frank: "get rid of it"). The rock
    // outcrop dresses that end of the ledge on its own now, and the world's
    // own trees keep the middle distance from going bare.
    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 3,
      treeRing: [11, 20],
      keepout: [
        ...cliff.footprint(1.0),
        ...cliff.voidFootprint(0.5),
        { x: 0.9, z: -0.5, r: 1.4 },
      ],
      // NO GRASS MASK AT ALL, and that took two goes to understand.
      //
      // The mask existed to keep grass from growing out over the drop. But this
      // case never carves its ground the way case 5 does: the cliff is a prop
      // standing ON a flat plain, and with drop 6.5 its face, skirt and every
      // mist bank hang BELOW y = 0 — under the ground, invisible. So there was
      // no drop on screen to keep grass off; there was only a bald patch,
      // covering more than half the near field, standing in for one.
      //
      // A ray down the centre column of the shipped lens proves it: from the
      // horizon down to his shoulder, every sample lands on plain ground at
      // y ≈ 0, out at (-3, -5) to (-12, -16). That is the whole middle of the
      // picture, and it was bare (Frank: "the grass is not where the camera is
      // looking — there's just an empty space there"). It is meadow now.
      grassKeepout: [],
    });

    for (const [p, rx, rz, op] of [
      [zuigan.position, 0.68, 0.52, 0.42],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 2.0, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'zuigan-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.9, 1.0, -0.5);
    scene.add(hit);

    // ---- the moment: call, and answer yourself ---------------------------
    let camera = null;
    let clock = 0;
    let line = 0;              // which of the three he is on
    let calls = 0;
    let answers = 0;
    let pending = -1;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (pending >= 0) return;
      line = (line % LINES) + 1;
      calls++;
      pending = clock + ECHO;
      butterflies.flit();               // a man shouting on a clifftop startles them
      // each line of the daily exercise is pitched a little lower than the last
      audio && audio.knock({ force: 0.9 - (line - 1) * 0.12 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        butterflies.update(dt, simTime);

        if (pending >= 0 && clock >= pending) {
          pending = -1;
          answers++;
          // "Yes, sir." — the same voice, from further away
          audio && audio.knock({ force: 0.30 });
          if (line >= LINES) line = 0;      // and tomorrow he does it again
        }

        // he leans into the call and settles back
        const since = calls ? clock - (pending >= 0 ? pending - ECHO : clock) : 99;
        const lean = pending >= 0 ? Math.max(0, 1 - since / ECHO) : 0;
        zuigan.rotation.z = -0.07 * lean;
      },
      fragment() {
        return { calls, answers, line, flutter: +butterflies.energy().toFixed(4) };
      },
      dispose() {},
    };
  },
};
