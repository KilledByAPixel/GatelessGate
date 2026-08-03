import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeRack, makeLantern, makeMonk, faceMonk,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 44;

// "When you have a staff, I will give it to you. If you have no staff, I will
// take it away from you."
//
// The rack outside the hall is the only prop the case needs, and it is built
// so it can never settle: touch it holding a staff and one is given, touch it
// holding none and the one you do not have is taken. Given, taken, given.
// The behaviour lives in the kit piece, so the paradox travels with it.
export default {
  id: ID,
  slug: 'basho-s-staff',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'rack', 'music'],
  camera: { distance: 9.2, target: [0.9, 1.15, 0.6], azimuth: 0.55, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [3.4, 8.6], to: [-1.0, -18], width: 1.4, seed: ID, groundSeed: 21, wander: 1.0 });
    scene.add(path);

    // the hall the rack stands outside of — a staff rack belongs by a door
    const hall = makeHut({ width: 3.2, height: 2.4, depth: 2.5 });
    hall.position.set(-1.6, 0, -4.6);
    hall.rotation.y = 0.42;
    scene.add(hall);

    // THE RACK, with the staff in it. Accent, because the staff is the case.
    const rack = makeRack({ height: 1.3, staffColor: ACCENT, holding: true });
    rack.group.position.set(0.9, 0, 0.6);
    rack.group.rotation.y = 0.5;
    scene.add(rack.group);

    // Basho beside it, empty-handed — he is the one doing the giving and the
    // taking, so he cannot be carrying one himself
    const basho = makeMonk({ height: 1.66 });
    basho.position.set(-1.2, 0, 1.4);
    faceMonk(basho, rack.group.position);
    scene.add(basho);

    // the disciple, come to be given or relieved of something
    const disciple = makeMonk({ height: 1.56 });
    disciple.position.set(2.9, 0, 2.0);
    faceMonk(disciple, rack.group.position);
    scene.add(disciple);

    const lantern = makeLantern({ height: 1.05 });
    lantern.position.set(-3.0, 0, -1.4);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.2),
        { x: hall.position.x, z: hall.position.z, r: 3.2 },
        { x: 0.9, z: 0.6, r: 1.5 },
        { at: basho, r: 1.1 },
        { at: disciple, r: 1.1 },
        { at: lantern, r: 0.9 },
      ],
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { x: hall.position.x, z: hall.position.z, r: 2.0 },
        { x: 0.9, z: 0.6, r: 0.9 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [rack.group.position, 0.6, 0.4, 0.32],
      [basho.position, 0.68, 0.52, 0.42],
      [disciple.position, 0.62, 0.5, 0.40],
      [hall.position, 2.1, 1.6, 0.30],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: given, taken, given ---------------------------------
    let camera = null;
    let swaps = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, rack.pickTargets())) return;
      const given = rack.toggle();
      swaps++;
      // wood set down, or wood lifted away
      audio && audio.knock({ force: given ? 0.6 : 0.35, at: rack.group.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        rack.update(dt, simTime);
      },
      fragment() {
        return {
          swaps,
          holding: rack.holding(),
          presence: +rack.presence().toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
