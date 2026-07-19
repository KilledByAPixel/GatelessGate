import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER } from '../palette.js';
import {
  composeWorld, makePath, makeLantern, makeMonk, aimMonk, makeGate, makeFlag,
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

    // the road to the temple runs from the foreground into the fog; everything
    // is placed ON it via path.sample so the gate spans the trail and the
    // lanterns flank it. The two monks argue on the road ("the flag moves" /
    // "the wind moves").
    const path = makePath({ from: [1.4, 9], to: [1.4, -34], width: 1.8, seed: 91, groundSeed: 21, wander: 1.3 });
    scene.add(path);

    // the gate straddles the path a little way up the road
    const gp = path.sample(0.27);
    const gate = makeGate({});
    gate.position.set(gp.x, 0, gp.z);
    gate.rotation.y = gp.heading;
    scene.add(gate);

    // stone lanterns flank the gate, just outside the posts, square to the path
    const lw = 1.55;
    const lanternA = makeLantern({});
    lanternA.position.set(gp.x + gp.perp.x * lw, 0, gp.z + gp.perp.z * lw);
    lanternA.rotation.y = gp.heading;
    const lanternB = makeLantern({ height: 1.0 });
    lanternB.position.set(gp.x - gp.perp.x * lw, 0, gp.z - gp.perp.z * lw);
    lanternB.rotation.y = gp.heading;
    scene.add(lanternA, lanternB);

    // the monks meet on the road near the camera. the flag stands on its own
    // pole out to monkA's side and a little forward, so monkA — the one who
    // insists "the flag moves" — points clearly across at it and monkB, arguing
    // "no, the wind," is on the far side and never blocks the line.
    const mp = path.sample(0.17);

    const flag = makeFlag({ seed: 11 });
    flag.group.position.set(mp.x + mp.perp.x * 2.4, 0, mp.z + mp.perp.z * 2.4 + 0.6);
    scene.add(flag.group);

    const monkA = makeMonk({ pose: 'point' });
    monkA.position.set(mp.x + mp.perp.x * 0.6, 0, mp.z + mp.perp.z * 0.6);
    aimMonk(monkA, flag.group.position);      // raised sleeve aims at the flag
    const monkB = makeMonk({ stout: 1.12 });
    monkB.position.set(mp.x - mp.perp.x * 0.8, 0, mp.z - mp.perp.z * 0.8);
    aimMonk(monkB, monkA.position);           // turns toward monkA — the argument
    scene.add(monkA, monkB);

    // the rest of the world: mountains, forest, midground trees, scatter —
    // shared grammar, kept off the staging and the path by keepouts
    composeWorld(scene, {
      seed: 29,
      groundSeed: 21,
      keepout: [
        { x: mp.x, z: mp.z, r: 3.0 },          // the monks' argument
        { x: gp.x, z: gp.z, r: 3.6 },          // gate + lanterns
        { x: flag.group.position.x, z: flag.group.position.z, r: 1.4 },
        { x: 1.4, z: -12, r: 3.4 },            // the path's run to the fog
        { x: 1.4, z: 6, r: 2.8 },              // path foreground
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
