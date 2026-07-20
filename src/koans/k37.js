import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER } from '../palette.js';
import {
  composeWorld, makeBuffalo, makeLattice, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 37;
const ACCENT = '#8A6A3B';

export default {
  id: ID,
  slug: 'a-buffalo-passes-through-the-enclosure',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.2'],
  music: 'slow-stone-breath-flute',

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the enclosure: a lattice fence running across the view
    const FENCE_Z = -0.6;
    for (let i = -1; i <= 1; i++) {
      const panel = makeLattice({ width: 2.6, height: 2.1, bars: 5 });
      panel.position.set(1.2 + i * 2.6, 0, FENCE_Z);
      scene.add(panel);
    }

    // The buffalo, caught halfway: horns, head and hooves already through the
    // far side, body and tail still on this one.
    const buffalo = makeBuffalo({ height: 1.35 });
    buffalo.group.position.set(1.0, 0, FENCE_Z + 0.72);
    // angled rather than square to the fence, so the stuck tail stays visible on
    // the near side instead of hiding behind the body
    buffalo.group.rotation.y = Math.PI - 0.42;
    scene.add(buffalo.group);

    // a monk watching the impossible thing, set back so he doesn't fill the lens
    const monk = makeMonk({ height: 1.6 });
    monk.position.set(4.5, 0, 0.4);
    aimMonk(monk, buffalo.group.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: 37,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: 1.2, z: FENCE_Z, r: 4.6 },   // the fence run
        { x: 1.0, z: 0.6, r: 2.4 },       // the buffalo's body
        { x: 4.5, z: 0.4, r: 1.1 },       // the monk
      ],
    });

    for (const [p, rx, rz, op] of [
      [buffalo.group.position, 1.3, 0.8, 0.4],
      [monk.position, 0.65, 0.5, 0.42],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.035, wobble: 0.7 });

    // ---- the moment: the tail --------------------------------------------
    // Tug it and it swishes. It never passes. That is the whole koan, and
    // nothing in the UI says so.
    let camera = null;
    let tugs = 0;
    const tailMeshes = [];
    buffalo.tail.group.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline) tailMeshes.push(o);
    });

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, tailMeshes)) {
        buffalo.tail.impulse(1.2);
        tugs++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.2']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        world.update(dt, simTime);
        buffalo.update(dt, simTime);
      },
      fragment() {
        return { tailEnergy: +buffalo.tail.energy().toFixed(6), tugs };
      },
      dispose() {},
    };
  },
};
