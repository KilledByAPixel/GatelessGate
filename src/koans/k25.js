import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import {
  composeWorld, makeVeranda, makeAssembly, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 25;

// Kyozan DREAMS that he goes to Maitreya's Pure Land, finds himself in the
// third seat, is announced as the one who will preach, stands up, hits the
// gavel and says the truth is above words and thought — and then Mumon asks
// whether he preached or not.
//
// It is the only case in the book that is not happening. So this is the only
// diorama built on dream rules: the fog closes to nearly nothing, the ground
// is a pale suggestion under a floor that is standing in cloud, and the whole
// hall breathes very slightly out of true — a rocking too slow to catch in the
// act but never quite still.
//
// The gavel works. Striking it deepens the wobble, which is what happens when
// you assert something inside a dream.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'preaching-from-the-third-seat',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'gavel', 'music'],
  camera: { distance: 11.0, target: [0.4, 2.0, -1.6], azimuth: 0.55, polar: 1.24 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    // the dream's weather: everything past the hall is already gone
    scene.fog = new THREE.FogExp2(PAPER, 0.060);
    scene.add(makeLights());

    // EVERYTHING THAT IS DREAMING — one group, rocked as a whole
    const hall = new THREE.Group();
    hall.name = 'dream';
    scene.add(hall);

    // the cloud the floor is standing on: flat pale discs, no edges anywhere
    const cloud = new THREE.Group();
    cloud.name = 'cloud';
    for (let i = 0; i < 5; i++) {
      const r = 3.4 + i * 0.9;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 0.94, 0.10, 13),
        toonMaterial({ color: wash(0.09 - i * 0.012), flat: true }));
      disc.name = 'cloud-disc';
      disc.userData.noOutline = true;         // cloud has no contour
      disc.position.set((i % 2 ? 0.5 : -0.4) * i * 0.4, -0.18 - i * 0.12, -1.4 + i * 0.3);
      cloud.add(disc);
    }
    hall.add(cloud);

    const veranda = makeVeranda({ width: 5.4, depth: 4.4, height: 3.4 });
    veranda.position.set(0.2, 0.32, -4.0);
    hall.add(veranda);

    // the seats: three low platforms, and Kyozan standing at the third
    const seats = [];
    for (let i = 0; i < 3; i++) {
      const seat = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.20, 1.05),
        toonMaterial({ color: i === 2 ? WASH.stone : wash(0.26), flat: true }));
      seat.name = 'seat';
      seat.position.set(-1.9 + i * 1.75, 0.42, -2.2);
      hall.add(seat);
      seats.push(seat);
    }

    const kyozan = makeMonk({ height: 1.62, pose: 'raise' });
    kyozan.position.set(seats[2].position.x, 0.52, seats[2].position.z);
    aimMonk(kyozan, { x: 1.0, z: 4.0 });
    hall.add(kyozan);

    // the two who are already seated
    for (let i = 0; i < 2; i++) {
      const sitter = makeMonk({ height: 1.42, pose: 'sit' });
      sitter.position.set(seats[i].position.x, 0.52, seats[i].position.z);
      aimMonk(sitter, { x: 0.6, z: 4.0 });
      hall.add(sitter);
    }

    // THE GAVEL and its block, on a stand before the third seat — the seal,
    // and the one thing in the dream you can act on
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, 0.4),
      toonMaterial({ color: WASH.dark, flat: true }));
    stand.name = 'stand';
    stand.position.set(seats[2].position.x, 0.73, seats[2].position.z + 1.15);
    hall.add(stand);

    const gavel = new THREE.Group();
    gavel.name = 'gavel';
    gavel.position.copy(stand.position);
    gavel.position.y += 0.24;
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.24, 8),
      toonMaterial({ color: ACCENT, flat: true }));
    head.name = 'gavel-head';
    head.rotation.z = Math.PI / 2;
    gavel.add(head);
    hall.add(gavel);

    // the audience, out in the cloud where the floor stops
    const assembly = makeAssembly({
      count: 8, radius: 2.6, center: [0.4, 1.9], facing: [0.2, -3.0], spread: 1.3, seed: ID,
    });
    assembly.position.y = 0.34;
    hall.add(assembly);

    const world = composeWorld(hall, {
      seed: ID,
      groundSeed: 21,
      trees: 2,
      treeRing: [17, 24],
      rocks: 4,
      bushes: 3,
      keepout: [{ x: 0.2, z: -2.0, r: 8.0 }],
      grassKeepout: [{ x: 0.2, z: -2.0, r: 7.4 }],
    });

    const blob = makeBlobShadow({ radiusX: 2.6, radiusZ: 2.2, opacity: 0.18 });
    blob.position.set(0.2, 0, -2.0);
    hall.add(blob);

    addOutlines(scene, { width: 0.030, wobble: 0.8 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.7, 0.8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'gavel-hit';
    hit.userData.noOutline = true;
    hit.position.copy(gavel.position);
    hall.add(hit);

    // ---- the moment: strike the gavel, inside a dream ---------------------
    // The dream rocks very slightly, and ONLY on its own — striking the gavel
    // never touches the world. An earlier cut grew the wobble on every click,
    // which read as the camera being knocked out of place the more you tapped
    // (Frank's bug). The strike is a sound and a small LOCAL bounce of the
    // gavel now; the world is left alone.
    const BASE = 0.006;        // the faint rocking that never stops, unchanging
    const GAVEL_Y = stand.position.y + 0.24;
    let camera = null;
    let clock = 0;
    let strikes = 0;
    let struckAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      struckAt = clock;
      strikes++;
      audio && audio.knock({ force: 0.7 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        // constant, click-independent dream drift — nothing here reads `strikes`
        hall.rotation.z = Math.sin(clock * 0.31) * BASE;
        hall.rotation.x = Math.sin(clock * 0.23 + 1.1) * BASE * 0.8;
        hall.position.y = Math.sin(clock * 0.19 + 2.2) * BASE * 3.0;

        // the gavel gives a small LOCAL bounce when struck — it moves, the
        // world does not
        const t = clock - struckAt;
        const bounce = t >= 0 && t < 1 ? 0.12 * Math.exp(-t / 0.18) * Math.abs(Math.sin(t * 22)) : 0;
        gavel.position.y = GAVEL_Y + bounce;
      },
      fragment() {
        return {
          strikes,
          rock: +hall.rotation.z.toFixed(5),
          bounce: +(gavel.position.y - GAVEL_Y).toFixed(5),
        };
      },
      dispose() {},
    };
  },
};
