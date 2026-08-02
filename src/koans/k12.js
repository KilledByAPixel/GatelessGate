import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makeCliff, makeMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

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
// The staff planted beside him is the seal: the one thing up here that is not
// him and not the weather.

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

    // ZUIGAN, alone, near the edge, facing out over the drop
    const zuigan = makeMonk({ height: 1.64 });
    zuigan.position.set(0.9, 0, -0.5);
    zuigan.rotation.y = .2;
    scene.add(zuigan);

    // his staff, planted in the rock beside him. NOT at (1.75, 0.5): the
    // shipped camera's sight line to Zuigan passes through that exact spot
    // (solve the camera ray — it crosses (1.75, 0.80, 0.55)), so the red shaft
    // used to slice through his robe. Offset perpendicular to that line, down
    // the lip he points along, where it reads planted and clear of him.
    const staff = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.034, 1.5, 7),
      toonMaterial({ color: ACCENT, flat: true }));
    staff.name = 'staff';
    staff.position.set(2.25, 0.72, 0.15);
    staff.rotation.z = 0.10;
    scene.add(staff);

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
      grassKeepout: [...cliff.voidFootprint(0.4)],
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
      // each line of the daily exercise is pitched a little lower than the last
      audio && audio.knock({ force: 0.9 - (line - 1) * 0.12 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

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
        return { calls, answers, line };
      },
      dispose() {},
    };
  },
};
