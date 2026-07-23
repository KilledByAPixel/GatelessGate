import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 31;

// Every traveller who asks the old woman the road to Taizan gets the same four
// words — "Go straight ahead" — and the moment they walk on she says to
// herself that this one is a common church-goer too. Joshu goes and asks and
// gets the identical answer, comes back, and announces he has investigated her.
//
// The answer is a machine, so the scene is built around the giving of it: her
// tea stall at the fork, the road running past, and the arm she raises. Ask
// her as many times as you like. The arm goes up, the same way, at the same
// speed, and points the same direction, whoever is standing there.

const POINT = 1.5;        // seconds: raise, hold, and back down
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'joshu-investigates',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.20', 'stall', 'music'],
  mood: 'yo',
  camera: { distance: 10.4, target: [0.7, 1.3, -0.2], azimuth: 0.55, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the road, and the branch of it that goes on to Taizan
    const road = makePath({ from: [5.4, 7.6], to: [-4.4, -16], width: 1.6, seed: ID, groundSeed: 21, wander: 0.6 });
    scene.add(road);
    const branch = makePath({ from: [0.6, -2.2], to: [9.0, -14], width: 1.1, seed: ID * 3, groundSeed: 21, wander: 0.9 });
    scene.add(branch);

    // the tea stall at the fork: a hut with an awning over a bench
    const stall = makeHut({ width: 2.6, height: 2.0, depth: 2.1 });
    stall.position.set(-2.6, 0, -2.6);
    stall.rotation.y = 0.7;
    scene.add(stall);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.07, 1.3),
      toonMaterial({ color: WASH.dry, flat: true }));
    awning.name = 'awning';
    awning.position.set(-1.5, 1.75, -1.7);
    awning.rotation.set(0.16, 0.7, 0);
    scene.add(awning);

    const bench = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.09, 0.42),
      toonMaterial({ color: WASH.dark, flat: true }));
    bench.name = 'bench';
    bench.position.set(-1.4, 0.42, -1.5);
    bench.rotation.y = 0.7;
    scene.add(bench);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.42, 0.32),
        toonMaterial({ color: WASH.dark, flat: true }));
      leg.name = 'leg';
      leg.position.set(-1.4 + sx * 0.62 * Math.cos(0.7), 0.21, -1.5 - sx * 0.62 * Math.sin(0.7));
      leg.rotation.y = 0.7;
      scene.add(leg);
    }

    // two cups on the bench — the tea nobody in this case ever drinks
    for (const [i, off] of [[0, -0.35], [1, 0.3]].entries()) {
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.045, 0.075, 8),
        toonMaterial({ color: ACCENT, flat: true }));
      cup.name = 'cup';
      cup.position.set(-1.4 + off[1] * Math.cos(0.7), 0.50, -1.5 - off[1] * Math.sin(0.7));
      scene.add(cup);
    }

    // THE OLD WOMAN, at her stall, with the answer ready
    const woman = makeMonk({ height: 1.5, hat: false, stout: 1.08, pose: 'point' });
    const WOMAN = new THREE.Vector3(-0.7, 0, -0.9);
    woman.position.copy(WOMAN);
    // she points UP THE ROAD, not at whoever asked — that is the whole joke
    aimMonk(woman, { x: -4.4, z: -16 });
    scene.add(woman);
    const arm = woman.children
      .filter((c) => c.name === 'arm')
      .find((c) => Math.abs(c.rotation.z) > 1);
    const ARM_REST = arm ? arm.rotation.z : 0;

    // and the traveller currently receiving it
    const traveller = makeMonk({ height: 1.6, elder: true });
    traveller.position.set(2.4, 0, 1.5);
    aimMonk(traveller, WOMAN);
    scene.add(traveller);

    const lantern = makeLantern({ height: 1.0 });
    lantern.position.set(1.0, 0, -3.2);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...road.keepout(24, 1.3),
        ...branch.keepout(18, 1.1),
        { x: stall.position.x, z: stall.position.z, r: 2.8 },
        { x: WOMAN.x, z: WOMAN.z, r: 1.2 },
        { x: 2.4, z: 1.5, r: 1.2 },
        { x: 1.0, z: -3.2, r: 0.9 },
      ],
      grassKeepout: [
        ...road.keepout(26, 1.0),
        ...branch.keepout(18, 0.9),
        { x: stall.position.x, z: stall.position.z, r: 1.8 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [WOMAN, 0.62, 0.5, 0.42],
      [traveller.position, 0.66, 0.5, 0.42],
      [stall.position, 1.8, 1.4, 0.30],
      [lantern.position, 0.36, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.8, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'woman-hit';
    hit.userData.noOutline = true;
    hit.position.set(WOMAN.x, 0.9, WOMAN.z);
    scene.add(hit);

    // ---- the moment: ask her ---------------------------------------------
    let camera = null;
    let clock = 0;
    let asked = 0;
    let askedAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (clock - askedAt < POINT) return;
      askedAt = clock;
      asked++;
      // the same four words, at the same volume, for everybody
      audio && audio.knock({ force: 0.5 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        const u = askedAt > -99 ? clamp01((clock - askedAt) / POINT) : 1;
        // up quickly, held, and lowered — identical every time
        const lift = (u >= 1) ? 0 : Math.min(1, u / 0.16, (1 - u) / 0.42);
        const e = lift * lift * (3 - 2 * lift);
        if (arm) arm.rotation.z = ARM_REST + 0.30 * e;
      },
      fragment() {
        return {
          asked,
          // whatever the count, the answer is the same size
          lift: arm ? +(arm.rotation.z - ARM_REST).toFixed(4) : 0,
        };
      },
      dispose() {},
    };
  },
};
