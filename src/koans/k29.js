import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER } from '../palette.js';
import {
  composeWorld, makePath, makeLantern, makeMonk, makeGate, makeFlag,
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

    // the road to the temple: two monks argue on the path where it passes the
    // gate and its flag ("the flag moves" / "the wind moves")
    const gate = makeGate({});
    gate.position.set(2.3, 0, -2.3);
    gate.rotation.y = 0.35;
    scene.add(gate);

    // the path runs from the foreground, under the gate, off into the fog
    scene.add(makePath({ from: [0.6, 9], to: [3.4, -34], width: 1.7, seed: 91, groundSeed: 21 }));

    // stone lanterns flank the gate
    const lanternA = makeLantern({});
    lanternA.position.set(0.9, 0, -2.9);
    lanternA.rotation.y = 0.4;
    const lanternB = makeLantern({ height: 1.0 });
    lanternB.position.set(4.4, 0, -3.4);
    lanternB.rotation.y = -0.3;
    scene.add(lanternA, lanternB);

    const flag = makeFlag({ seed: 11 });
    flag.group.position.set(4.8, 0, 0.4);
    scene.add(flag.group);

    const monkA = makeMonk({ pose: 'point' });
    monkA.position.set(1.7, 0, 1.3);
    monkA.rotation.y = 0.35;                // angled at the flag, sleeve raised toward it
    const monkB = makeMonk({ stout: 1.12 });
    monkB.position.set(0.35, 0, 1.7);
    monkB.rotation.y = 1.75;               // turned toward monkA
    scene.add(monkA, monkB);

    // the rest of the world: mountains, forest, midground trees, scatter —
    // shared grammar, kept off the staging and the path by keepouts
    composeWorld(scene, {
      seed: 29,
      groundSeed: 21,
      keepout: [
        { x: 1, z: 1.4, r: 3.2 },     // the monks' argument
        { x: 2.3, z: -2.3, r: 3.4 },  // gate + lanterns
        { x: 4.8, z: 0.4, r: 1.4 },   // flag
        { x: 2, z: -12, r: 3.2 },     // the path's run to the fog
        { x: 1.4, z: 5.5, r: 2.6 },   // path foreground
      ],
    });

    for (const [p, rx, rz, op] of [
      [monkA.position, 0.7, 0.55, 0.42],
      [monkB.position, 0.7, 0.55, 0.42],
      [gate.position, 1.8, 0.75, 0.32],
      [flag.group.position, 0.55, 0.45, 0.36],
      [lanternA.position, 0.35, 0.3, 0.3],
      [lanternB.position, 0.35, 0.3, 0.3],
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
