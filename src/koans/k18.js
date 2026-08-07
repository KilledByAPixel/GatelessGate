import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeScale, makeMonk, aimMonk, faceMonk,
  makeLights, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 18;

// A monk asks what Buddha is while Tozan happens to be weighing flax, and
// Tozan answers with the weight. The scene is therefore not a teaching hall
// but a working one: the steelyard, the flax, and a question arriving at the
// wrong moment.
//
// The balance is the whole joke. Push it however you like — it swings, it
// settles, and it says three pounds. It was always going to say three pounds.
export default {
  id: ID,
  slug: 'tozan-s-three-pounds',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'scale', 'music'],
  mood: 'yo',        // a plain answer on a working morning
  camera: { distance: 9.4, target: [1.1, 1.2, 0.5], azimuth: 0.55, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [-3.6, 8.4], to: [2.4, -18], width: 1.3, seed: ID, groundSeed: 21, wander: 1.1 });
    scene.add(path);

    // THE SCALE. Its pan hangs on the left of the beam; the flax rides in it.
    const scale = makeScale({ height: 1.4, reading: 3 });
    scale.group.position.set(1.2, 0, 0.6);
    scale.group.rotation.y = 0.42;
    scene.add(scale.group);

    // The three pounds themselves — the seal, riding in the pan. Small, held,
    // and the only warm thing in the yard: full accent is right at this size.
    const weighed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.13, 0.16, 9),
      toonMaterial({ color: ACCENT, flat: true }));
    weighed.name = 'flax';
    weighed.position.y = 0.10;
    scale.pan.add(weighed);

    // the rest of the crop, bundled on the ground where it was carried in
    const flaxMat = toonMaterial({ color: WASH.dry, flat: true });
    const bindMat = toonMaterial({ color: WASH.dark, flat: true });
    for (let i = 0; i < 4; i++) {
      const bundle = new THREE.Group();
      bundle.name = 'bundle';
      const len = 0.86 + hash1(i * 3 + 1, ID) * 0.22;
      const sheaf = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, len, 7), flaxMat);
      sheaf.name = 'sheaf';
      sheaf.rotation.z = Math.PI / 2;            // lying down, as cut flax lies
      bundle.add(sheaf);
      const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.05, 7), bindMat);
      tie.name = 'tie';
      tie.rotation.z = Math.PI / 2;
      tie.position.x = len * 0.16;
      bundle.add(tie);
      bundle.position.set(
        2.9 + hash1(i * 3 + 2, ID) * 1.0,
        0.14 + (i % 2) * 0.26,
        1.5 - hash1(i * 3 + 3, ID) * 1.1,
      );
      bundle.rotation.y = hash1(i * 3 + 4, ID) * Math.PI;
      bundle.rotation.z = (hash1(i * 3 + 5, ID) - 0.5) * 0.22;
      scene.add(bundle);
    }

    // Tozan at the beam, and the monk who picked this moment to ask
    const tozan = makeMonk({ height: 1.62, pose: 'point' });
    tozan.position.set(-0.5, 0, 1.1);
    aimMonk(tozan, scale.group.position);
    scene.add(tozan);

    const monk = makeMonk({ height: 1.56 });
    monk.position.set(0.4, 0, 3.2);
    faceMonk(monk, tozan.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.1),
        { x: 1.2, z: 0.6, r: 1.9 },
        { x: 3.3, z: 1.0, r: 1.4 },
        { at: tozan, r: 1.1 },
        { at: monk, r: 1.1 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: 1.2, z: 0.6, r: 0.9 },
      ],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: it always says the same thing ------------------------
    let camera = null;
    let nudges = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, scale.pickTargets())) return;
      // alternate which way it is pushed, so repeated taps rock it rather than
      // pumping it one way
      scale.disturb(nudges % 2 ? -1 : 1);
      nudges++;
      audio && audio.knock({ force: 0.4, at: scale.group.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        scale.update(dt, simTime);
      },
      fragment() {
        return {
          nudges,
          reading: scale.reading(),
          settling: +scale.settling().toFixed(4),
          angle: +scale.angle().toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
