import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT_DEEP } from '../palette.js';
import {
  composeWorld, makePath, makeGate, makeFlag, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 22;

// Ananda asks what else the Buddha handed on besides the robe. Kashapa answers
// by saying his name — "Ananda." "Yes, brother." — and then tells him to take
// down the preaching sign and put up his own. The whole transmission happens
// in the space of being called and answering.
//
// The preaching sign is the flagpole outside the hall, so this case is the
// book's second cloth scene after 29, and it uses the same flag: the kit piece
// carries its own hover-ruffle and its own click-to-still, so the behaviour
// arrived with the component rather than being written again here. That is the
// reuse rule doing exactly what it was written for.
export default {
  id: ID,
  slug: 'kashapa-s-preaching-sign',
  title: TEXT[ID].title,
  accent: ACCENT_DEEP,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.30', 'flag', 'music'],
  mood: 'yo',      // "This spring does not belong to the ordinary season."
  camera: { distance: 11.5, target: [0.9, 1.9, -0.2], azimuth: 0.55, polar: 1.24 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const path = makePath({ from: [-3.8, 8.4], to: [2.8, -18], width: 1.5, seed: ID, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    const gate = makeGate({ width: 2.9, height: 3.1 });
    gate.position.set(-0.9, 0, -3.4);
    gate.rotation.y = 0.24;
    scene.add(gate);

    // THE PREACHING SIGN — the banner that says whose hall this is, and the
    // one thing in the case that is about to change hands
    const flag = makeFlag({ seed: ID, poleH: 3.6, width: 1.6 });
    flag.group.position.set(2.2, 0, 0.3);
    scene.add(flag.group);

    // KASHAPA, who is handing it over, and ANANDA, who has just said yes
    const kashapa = makeMonk({ height: 1.68, elder: true });
    kashapa.position.set(-0.2, 0, 1.5);
    scene.add(kashapa);

    const ananda = makeMonk({ height: 1.60 });
    ananda.position.set(1.1, 0, 2.9);
    scene.add(ananda);
    aimMonk(kashapa, ananda.position);
    aimMonk(ananda, kashapa.position);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(-2.8, 0, 0.6);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.3),
        { x: gate.position.x, z: gate.position.z, r: 2.4 },
        { x: 2.2, z: 0.3, r: 1.6 },
        { x: -0.2, z: 1.5, r: 1.2 },
        { x: 1.1, z: 2.9, r: 1.2 },
        { x: -2.8, z: 0.6, r: 0.9 },
      ],
      grassKeepout: [
        ...path.keepout(26, 0.95),
        { x: gate.position.x, z: gate.position.z, r: 1.2 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [kashapa.position, 0.7, 0.54, 0.42],
      [ananda.position, 0.64, 0.5, 0.40],
      [flag.group.position, 0.55, 0.45, 0.36],
      [gate.position, 1.5, 0.5, 0.30],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the sign comes down ---------------------------------
    // Brush the banner and it ruffles; touch it and it stops flying. Both live
    // in the flag component (see case 29's note on restraint) — a stilled sign
    // is a hall with no teacher named on it, which is exactly the moment the
    // case is describing.
    let camera = null;
    let stills = 0;

    input.onHover(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (!hit) return;
      const local = flag.mesh.worldToLocal(hit.point.clone());
      flag.hoverAt(local.x, local.y);
    });

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [flag.mesh])) return;
      const on = flag.toggleWind();
      stills++;
      audio && audio.chimeStrike({ tube: on ? 3 : 0, force: 0.5 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        flag.update(dt, simTime);
      },
      fragment() {
        return {
          stills,
          windOn: flag.isWindOn(),
          windLevel: +flag.windLevel().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
        };
      },
      dispose() {},
    };
  },
};
