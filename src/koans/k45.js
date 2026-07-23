import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 45;

// "The past and future Buddhas, both are his servants. Who is he?" — and
// Mumon says that if you realize who he is, it is like meeting your own father
// on a busy street: you would not need to ask anyone whether you were right.
//
// So he is in the scene, and he is standing behind you. Not hidden somewhere
// clever — behind the camera, continuously, wherever the camera goes. He is
// facing the same way you are, so what there is to see is his back.
//
// He LAGS, and that is the whole mechanic. Orbit slowly and he keeps station
// out of frame. Swing the camera round quickly and he cannot get out of the
// way in time, and for a second or so he is there at the edge of the picture,
// walking away, before he slides out again. You can do it as often as you
// like. You never get in front of him.

const LAG = 1.15;          // e-folding rate of his keeping-up, per second
const BEHIND = 4.2;        // how far back he stands
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default {
  id: ID,
  slug: 'who-is-he',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22', 'music'],
  camera: { distance: 11.0, target: [0.4, 1.5, -0.6], azimuth: 0.55, polar: 1.24 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.034);      // dusk: he is easy to lose
    scene.add(makeLights());

    const road = makePath({ from: [5.6, 7.4], to: [-4.8, -17], width: 1.6, seed: ID, groundSeed: 21, wander: 0.6 });
    scene.add(road);

    // a lantern on the road, so the emptiness in front of you has a middle
    const lantern = makeLantern({ height: 1.2 });
    const lp = road.sample(0.42);
    lantern.position.set(lp.x + lp.perp.x * 1.3, 0, lp.z + lp.perp.z * 1.3);
    scene.add(lantern);

    // a marker stone with a vermillion character cut into it — the one warm
    // mark on the road, and the only thing here that will hold still
    const stone = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 1.0, 0.34),
      toonMaterial({ color: WASH.stone, flat: true }));
    stone.name = 'marker';
    stone.position.set(-1.9, 0.5, 1.4);
    stone.rotation.y = 0.4;
    scene.add(stone);
    const cut = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.20, 0.02),
      toonMaterial({ color: ACCENT, flat: true }));
    cut.name = 'cut';
    cut.position.set(0, 0.20, 0.18);
    stone.add(cut);

    // HIM. Placed in the first frame at a plausible spot, then handed over to
    // the camera for the rest of his existence.
    const him = makeMonk({ height: 1.66 });
    him.name = 'him';
    him.position.set(2.0, 0, 6.0);
    scene.add(him);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...road.keepout(26, 1.4),
        { x: lantern.position.x, z: lantern.position.z, r: 0.9 },
        { x: -1.9, z: 1.4, r: 0.9 },
      ],
      grassKeepout: road.keepout(28, 1.0),
    });

    // his shadow travels with him, so it is parented to him rather than laid
    // on the ground where he happened to start
    const shadow = makeBlobShadow({ radiusX: 0.66, radiusZ: 0.5, opacity: 0.36 });
    shadow.position.y = 0.01;
    him.add(shadow);

    const lanternShadow = makeBlobShadow({ radiusX: 0.4, radiusZ: 0.32, opacity: 0.34 });
    lanternShadow.position.set(lantern.position.x, 0, lantern.position.z);
    scene.add(lanternShadow);

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.9, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'him-hit';
    hit.userData.noOutline = true;
    hit.position.y = 0.95;
    him.add(hit);

    // ---- the moment: turn round ------------------------------------------
    let camera = null;
    let clock = 0;
    let glimpses = 0;
    let seen = false;
    let caught = 0;
    let lastChime = -99;

    const fwd = new THREE.Vector3();
    const want = new THREE.Vector3();
    const ndc = new THREE.Vector3();

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      caught++;
      if (clock - lastChime > 0.6) {
        lastChime = clock;
        // you did not catch him. Something sounds a long way off.
        audio && audio.chimeStrike({ tube: 0, force: 0.3 });
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        if (!camera) return;
        const step = Math.max(0, dt || 0);

        // where "behind you" is, right now
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, -1);
        fwd.normalize();
        want.copy(camera.position).addScaledVector(fwd, -BEHIND);
        want.y = 0;
        // ...but never out in the mountains
        const r = Math.hypot(want.x, want.z);
        if (r > 16) { want.x *= 16 / r; want.z *= 16 / r; }

        // he keeps up, but not quite
        const k = 1 - Math.exp(-LAG * step);
        him.position.x += (want.x - him.position.x) * k;
        him.position.z += (want.z - him.position.z) * k;
        // facing the way you are facing: what there is to see is his back
        him.rotation.y = Math.atan2(-fwd.z, fwd.x) + Math.PI;

        // did that put him in the picture?
        ndc.copy(him.position);
        ndc.y = 1.0;
        ndc.project(camera);
        const inFrame = ndc.z > 0 && ndc.z < 1 && Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1;
        if (inFrame && !seen) glimpses++;
        seen = inFrame;
      },
      fragment() {
        return {
          glimpses,
          seen,
          caught,
          lag: +clamp(him.position.distanceTo(want), 0, 99).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
