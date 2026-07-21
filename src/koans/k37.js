import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP } from '../palette.js';
import {
  composeWorld, makeBuffalo, makePen, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 37;
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

    // The enclosure. Three walls of lattice and one side standing wide open —
    // the buffalo could simply walk out. Instead it has forced itself through
    // the bars, and now cannot get its tail through. The open gate has to be in
    // frame or the joke doesn't land.
    const PEN = { x: 1.0, z: -2.3, size: 4.6 };
    const pen = makePen({ size: PEN.size, height: 1.9, open: '+x', panelsPerSide: 2 });
    pen.position.set(PEN.x, 0, PEN.z);
    scene.add(pen);
    const NEAR_WALL_Z = PEN.z + PEN.size / 2;      // the wall it came through

    // Head, horns, shoulders and hooves are already out on this side; the tail
    // is still back among the bars. Red, because the buffalo IS this koan —
    // deepened, since full accent across an animal this size reads as glare.
    // Placed so the BODY STRADDLES the wall: the tail root has to end up behind
    // the lattice or the whole thing reads as an animal standing beside a fence.
    // A lattice is mostly holes, which is what lets the overlap read as passing
    // through rather than as clipping.
    const buffalo = makeBuffalo({ height: 1.5, color: ACCENT_DEEP, tailColor: ACCENT });
    buffalo.group.position.set(0.5, 0, NEAR_WALL_Z + 0.55);
    // turned off-square so we get the hump in profile and the tail stays clear
    // of the body instead of hiding behind it
    buffalo.group.rotation.y = 0.34;
    scene.add(buffalo.group);

    // a monk watching the impossible thing, set back so he doesn't fill the lens
    const monk = makeMonk({ height: 1.6 });
    monk.position.set(4.9, 0, 1.4);
    aimMonk(monk, buffalo.group.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: 37,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...pen.footprint(1.0),                              // the three standing walls
        { x: buffalo.group.position.x, z: buffalo.group.position.z, r: 2.2 },
        { x: monk.position.x, z: monk.position.z, r: 1.1 },
      ],
      // nothing here covers the ground — grass grows through a fence and around
      // hooves in life, so let it
      grassKeepout: [],
    });

    for (const [p, rx, rz, op] of [
      [buffalo.group.position, 1.4, 0.9, 0.4],
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
