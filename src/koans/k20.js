import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 20;

// "Why does the enlightened man not stand on his feet and explain himself?"
// And: "If the feet of enlightenment moved, the great ocean would overflow."
//
// So he does not move. He is a colossus stopped mid-stride on the road, and
// when you push him THE WORLD MOVES INSTEAD — the ground, the road, the
// mountains, the grass, everything except him lurches and settles back. He
// stays exactly where he is, because there is nowhere for him to go.
//
// Mechanically that is one group: everything the world grammar builds goes
// into `moving`, and the figure is parented to the scene root beside it.

const SHOVE = 0.34;      // metres the world gives
const PERIOD = 1.35;
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.9;

export default {
  id: ID,
  slug: 'the-enlightened-man',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.26', 'music'],
  camera: { distance: 15.0, target: [0.6, 2.4, -0.6], azimuth: 0.55, polar: 1.20 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // EVERYTHING THAT CAN BE MOVED
    const moving = new THREE.Group();
    moving.name = 'moving-world';
    scene.add(moving);

    const path = makePath({ from: [-5.0, 9.0], to: [4.0, -20], width: 1.8, seed: ID, groundSeed: 21, wander: 0.7 });
    moving.add(path);

    // THE COLOSSUS — mid-stride, one sleeve forward, and not going anywhere.
    // Nearly three times a man, in a value just off the ink so he reads as
    // stone rather than as a person in a black robe.
    const H = 4.4;
    const colossus = makeMonk({ height: H, stout: 1.12, color: wash(0.80), elder: true });
    colossus.position.set(0.4, 0, -0.8);
    aimMonk(colossus, { x: 5.0, z: 5.0 });
    // the staff is the seal: thin enough to take full accent at this size
    const staff = colossus.getObjectByName('staff');
    if (staff) staff.material = toonMaterial({ color: ACCENT, flat: true });
    // caught mid-stride: leaned into the step, one sleeve swung forward
    colossus.rotation.z = -0.05;
    const arms = [];
    colossus.traverse((o) => { if (o.name === 'arm') arms.push(o); });
    if (arms[0]) arms[0].rotation.x = -0.55;
    if (arms[1]) arms[1].rotation.x = 0.42;
    scene.add(colossus);

    // a traveller who stopped to look up at him, for scale
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(3.6, 0, 3.4);
    aimMonk(monk, colossus.position);
    moving.add(monk);

    // a stone marker at his feet, worn down by everyone who has tried
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.92, 0.3),
      toonMaterial({ color: WASH.stone, flat: true }));
    marker.name = 'marker';
    marker.position.set(-1.9, 0.46, 0.9);
    marker.rotation.y = 0.3;
    marker.rotation.z = 0.07;
    moving.add(marker);

    const world = composeWorld(moving, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...path.keepout(24, 1.4),
        { x: 0.4, z: -0.8, r: 2.6 },
        { x: 3.6, z: 3.4, r: 1.2 },
        { x: -1.9, z: 0.9, r: 0.9 },
      ],
      grassKeepout: path.keepout(26, 1.0),
    });

    for (const [p, rx, rz, op, parent] of [
      [colossus.position, 1.5, 1.0, 0.42, scene],
      [monk.position, 0.62, 0.5, 0.40, moving],
      [marker.position, 0.34, 0.26, 0.32, moving],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      parent.add(s);
    }

    addOutlines(scene, { width: 0.036, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, H, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'colossus-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.4, H / 2, -0.8);
    scene.add(hit);

    // ---- the moment: push him --------------------------------------------
    let camera = null;
    let clock = 0;
    let shoves = 0;
    const pushes = [];         // { t, dx, dz }

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      // the world gives along the line you pushed from, which is to say: away
      // from the camera
      const dir = new THREE.Vector3(0.4 - camera.position.x, 0, -0.8 - camera.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      pushes.push({ t: clock, dx: dir.x, dz: dir.z });
      if (pushes.length > 5) pushes.shift();
      shoves++;
      audio && audio.knock({ force: 0.9 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        while (pushes.length && clock - pushes[0].t > 8 * TAU) pushes.shift();

        let ox = 0, oz = 0;
        for (const p of pushes) {
          const t = clock - p.t;
          if (t < 0) continue;
          const e = SHOVE * Math.exp(-t / TAU) * Math.sin(OMEGA * t);
          ox += p.dx * e;
          oz += p.dz * e;
        }
        moving.position.set(ox, 0, oz);
      },
      fragment() {
        return {
          shoves,
          worldX: +moving.position.x.toFixed(4),
          worldZ: +moving.position.z.toFixed(4),
          // he has not moved, and never will
          manX: +colossus.position.x.toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
