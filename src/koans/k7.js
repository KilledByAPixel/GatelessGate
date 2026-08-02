import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBasin, makeBowl, makeWater, makeMonk, faceMonk,
  makeOdoshi, makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 7;
export default {
  id: ID,
  slug: 'joshu-washes-the-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // water:0 = drips with no bed (a basin at rest is nearly silent). The
  // shishi-odoshi is the yard's second emitter, so the swells thin further
  // here than anywhere — this garden already keeps its own time.
  ambience: ['wind:0.14', 'water:0', 'odoshi', 'music'],
  // the first bright case: washing a bowl is domestic, morning work — yo, not
  // hirajoshi
  mood: 'yo',

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
    hut.position.set(-1.4, 0, -4.2);
    hut.rotation.y = 0.15;
    scene.add(hut);

    // The stone basin, and the water in it. Taller than it is wide, or it reads
    // as a puddle rather than a basin — and OPEN, which it was not: it was a
    // solid cylinder whose top cap sealed the water 4cm underneath it, so there
    // was no water to see.
    const BASIN_H = 0.62;
    const basin = makeBasin({
      inner: 0.44, outer: 0.56, rim: BASIN_H, floor: 0.30, color: WASH.stone, segments: 12,
    });
    basin.position.set(3.15, 0, 1.5);
    scene.add(basin);

    // round, because the basin is: a square sheet also used to poke its corners
    // out through the stone
    const water = makeWater({ shape: 'round', size: 0.86, color: WASH.ground });
    water.group.position.set(3.15, BASIN_H - 0.10, 1.5);   // below the rim, clear of it
    scene.add(water.group);

    // the bowl, set down beside the basin where he left it
    const bowl = makeBowl({ radius: 0.19, color: ACCENT });   // the seal of this koan
    bowl.position.set(2.42, 0, 2.1);
    scene.add(bowl);

    // the monk who has eaten, and been told to go wash
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(1.55, 0, 1.75);
    faceMonk(monk, basin.position);
    scene.add(monk);

    // The shishi-odoshi, set back from the basin with its mouth turned toward
    // it. The distance is load-bearing: the tube reaches 0.7 when it tips,
    // and at the first placement (0.98 from the basin's axis) the mouth dipped
    // straight through the basin's wall — Frank watched it happen. At 1.77
    // the tipped mouth clears the stone by half a unit. Its knock is the
    // yard's clock; a tap tips it early.
    const odoshi = makeOdoshi({
      seed: 7,
      onPour: () => audio && audio.pour(),
      onKnock: (force) => audio && audio.knock({ force }),
    });
    odoshi.group.position.set(3.75, 0, 0.15);
    odoshi.group.rotation.y = -2.70;
    scene.add(odoshi.group);

    const world = composeWorld(scene, {
      seed: 7,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.0),
        { x: -0.4, z: -4.2, r: 3.0 },   // the hut
        { x: 2.15, z: 0.9, r: 1.5 },    // basin + bowl
        { x: 0.55, z: 1.75, r: 1.1 },   // the monk
        { x: 3.75, z: 0.15, r: 1.2 },   // the deer-scarer and its flume
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
      [odoshi.group.position, 0.7, 0.35, 0.32],
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
      // the deer-scarer first: a tap tips it without waiting out the fill
      if (input.raycastFirst(camera, odoshi.pickTargets())) { odoshi.tip(); return; }
      // touching the water rings it where you touched; touching the bowl rings
      // the middle, as if it had been set down
      const onWater = surface ? input.raycastFirst(camera, [surface]) : null;
      if (onWater) {
        const local = water.group.worldToLocal(onWater.point.clone());
        water.ripple(local.x, local.z);
        audio && audio.drip({ loud: true });   // the touch you see is the drop you hear
        rippled++;
        return;
      }
      if (input.raycastFirst(camera, bowlMeshes)) {
        water.ripple(0, 0);
        audio && audio.drip({ loud: true });
        rippled++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        water.update(dt, simTime);
        odoshi.update(dt, simTime);
      },
      fragment() {
        return { ripples: water.rippleCount(), rippled, knocks: odoshi.knocks() };
      },
      dispose() {},
    };
  },
};
