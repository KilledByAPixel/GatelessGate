import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER } from '../palette.js';
import {
  makeGround, makeMountains, makeForest, makeMonk, makeTree, makeGate, makeFlag,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 29;
const ACCENT = '#C73E3A';

export default {
  id: ID,
  slug: 'not-the-wind-not-the-flag',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.25'],

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.03);
    scene.add(makeLights());

    // a little world: rolling ground running into the fog, mountains and
    // forest in the distance — the temple gate stands at its center
    scene.add(makeGround({ seed: 21 }));
    scene.add(makeMountains({ count: 8, distance: 52, arcSpan: 3.6, seed: 31, color: '#C9C4B5' }));
    scene.add(makeMountains({ count: 5, distance: 33, arcSpan: 2.4, seed: 32, color: '#B4AF9F', hScale: 0.65 }));
    scene.add(makeForest({ count: 55, center: [-19, 0, -27], spread: 13, seed: 41 }));
    scene.add(makeForest({ count: 40, center: [16, 0, -31], spread: 14, seed: 42, color: '#757464' }));

    const nearTree = makeTree({ seed: 5 });
    nearTree.position.set(-4.6, 0, -3.2);
    scene.add(nearTree);

    const gate = makeGate({});
    gate.position.set(2.3, 0, -2.3);
    gate.rotation.y = 0.35;
    scene.add(gate);

    const flag = makeFlag({ seed: 11 });
    flag.group.position.set(3.0, 0, -0.7);
    scene.add(flag.group);

    // two monks in dialogue about the flag; one points up at it (case 29:
    // "the flag moves" / "the wind moves"). Staged forward and grouped with the
    // flag so the eye reads monk → monk → flag across the frame.
    const monkA = makeMonk({ pose: 'point' });
    monkA.position.set(1.7, 0, 1.3);
    monkA.rotation.y = 0.35;                // angled at the flag, arm raised toward it
    const monkB = makeMonk({});
    monkB.position.set(0.35, 0, 1.7);
    monkB.rotation.y = 1.75;               // turned toward monkA
    scene.add(monkA, monkB);

    for (const [p, rx, rz, op] of [
      [monkA.position, 0.7, 0.55, 0.42],
      [monkB.position, 0.7, 0.55, 0.42],
      [gate.position, 1.8, 0.75, 0.32],
      [flag.group.position, 0.55, 0.45, 0.36],
      [nearTree.position, 1.6, 1.3, 0.3],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.035, wobble: 0.7 });

    const baseWind = 0.25;
    let camera = null;

    // hover the cloth -> local puff; tap the cloth -> toggle the wind
    input.onHover(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const local = flag.mesh.worldToLocal(hit.point.clone());
        flag.hoverAt(local.x, local.y);
      }
    });
    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const on = flag.toggleWind();
        audio && audio.setWindLevel(on ? baseWind : 0);
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:' + baseWind]); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        flag.update(dt, simTime);
        audio && audio.setWindLevel(flag.windLevel() * baseWind);
      },
      fragment() {
        return {
          windOn: flag.isWindOn(),
          windLevel: +flag.windLevel().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
        };
      },
      dispose() {},
    };
  },
};
