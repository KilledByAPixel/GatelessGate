import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBowl, makeWater, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 7;
export default {
  id: ID,
  slug: 'joshu-washes-the-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14'],
  music: 'stone-mistress',

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // a short approach to the threshold, so the ground reads as trodden
    const path = makePath({ from: [2.4, 9], to: [0.2, -20], width: 1.5, seed: 47, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    // the monastery threshold he has just entered
    const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4 });
    hut.position.set(-0.4, 0, -4.2);
    hut.rotation.y = 0.28;
    scene.add(hut);

    // the stone basin, and the water in it
    // taller than it is wide, or it reads as a puddle rather than a basin
    const BASIN_H = 0.62;
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.50, 0.56, BASIN_H, 12),
      toonMaterial({ color: WASH.stone, flat: true }));
    basin.name = 'basin';
    basin.position.set(2.15, BASIN_H / 2, 0.9);
    scene.add(basin);

    const water = makeWater({ size: 0.86, color: WASH.ground });
    water.group.position.set(2.15, BASIN_H - 0.04, 0.9);   // sunk just inside the rim
    scene.add(water.group);

    // the bowl, set down beside the basin where he left it
    const bowl = makeBowl({ radius: 0.19, color: ACCENT });   // the seal of this koan
    bowl.position.set(1.42, 0, 1.5);
    scene.add(bowl);

    // the monk who has eaten, and been told to go wash
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(0.55, 0, 1.75);
    aimMonk(monk, basin.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: 7,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.0),
        { x: -0.4, z: -4.2, r: 3.0 },   // the hut
        { x: 2.15, z: 0.9, r: 1.5 },    // basin + bowl
        { x: 0.55, z: 1.75, r: 1.1 },   // the monk
      ],
      // the trail, the hut's footprint and the basin's stone cover ground;
      // the monk stands in the grass like anyone would
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: -0.4, z: -4.2, r: 1.9 },
        { x: 2.15, z: 0.9, r: 0.62 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [monk.position, 0.65, 0.5, 0.42],
      [basin.position, 0.8, 0.6, 0.36],
      [hut.position, 2.0, 1.5, 0.3],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: touch the bowl, and the water answers ---------------
    let camera = null;
    let rippled = 0;
    const surface = water.group.children.find((c) => c.name === 'surface');
    const bowlMeshes = [];
    bowl.traverse((o) => { if (o.isMesh && !o.userData.isOutline) bowlMeshes.push(o); });

    input.onTap(() => {
      if (!camera) return;
      // touching the water rings it where you touched; touching the bowl rings
      // the middle, as if it had been set down
      const onWater = surface ? input.raycastFirst(camera, [surface]) : null;
      if (onWater) {
        const local = water.group.worldToLocal(onWater.point.clone());
        water.ripple(local.x, local.z);
        rippled++;
        return;
      }
      if (input.raycastFirst(camera, bowlMeshes)) {
        water.ripple(0, 0);
        rippled++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.14']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        world.update(dt, simTime);
        water.update(dt, simTime);
      },
      fragment() {
        return { ripples: water.rippleCount(), rippled };
      },
      dispose() {},
    };
  },
};
