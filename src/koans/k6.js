import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, INK } from '../palette.js';
import {
  composeWorld, makeBuddha, makeMonk, aimMonk, makeFlower, makeAssembly,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { hash1 } from '../util/noise.js';

const ID = 6;
const ACCENT = '#D9A441';   // the flower's gold heart — the only warm note

const PETAL_FALL = 5.0;     // seconds for a petal to reach the ground
const SMILE_IN = 1.4;

export default {
  id: ID,
  slug: 'buddha-twirls-a-flower',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12'],
  music: 'stone-mistress',

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // Vulture Peak: the Buddha raised on a low stone, the assembly below him.
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.7, 0.34, 9),
      toonMaterial({ color: '#9B968A', flat: true }));
    seat.name = 'seat';
    const SEAT_Z = -5.0;                  // far enough back that the assembly can sit between
    seat.position.set(1.2, 0.17, SEAT_Z);
    scene.add(seat);

    const buddha = makeBuddha({ height: 2.35 });   // he must still read at the back of the scene
    buddha.position.set(1.2, 0.34, SEAT_Z);
    scene.add(buddha);

    // the held flower
    const flower = makeFlower({ height: 0.62, petals: 6 });
    flower.position.set(1.72, 1.30, SEAT_Z + 0.44);
    flower.rotation.z = -0.22;
    scene.add(flower);

    // Mahakasyapa sits nearest, apart from the rest — the one who understands.
    const kasyapa = makeMonk({ pose: 'sit', height: 1.55 });
    kasyapa.position.set(3.05, 0, -0.7);
    aimMonk(kasyapa, buddha.position);
    scene.add(kasyapa);

    // "A smile is an event": the ONLY face rendered anywhere in this book. It is
    // a bare arc, hidden until the petal falls.
    const smileMat = toonMaterial({ color: PAPER, flat: true });
    smileMat.fog = false;
    smileMat.transparent = true;
    smileMat.opacity = 0;
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.009, 6, 12, Math.PI), smileMat);
    smile.name = 'smile';
    smile.rotation.z = Math.PI;            // an upturned arc
    smile.position.set(0, 0.795 * 1.55, 0.088 * 1.55);
    smile.userData.noOutline = true;
    kasyapa.add(smile);

    // The rest of the assembly, one instanced crowd facing the seat. The arc
    // opens toward +z (the camera), so its centre must sit WELL BACK or the
    // front row looms in the lens as a wall of black cones.
    const assembly = makeAssembly({
      count: 10, radius: 2.3, center: [1.2, -2.2], facing: [1.2, SEAT_Z], spread: 1.4, seed: 6,
    });
    scene.add(assembly);

    const world = composeWorld(scene, {
      seed: 6,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: 1.2, z: SEAT_Z, r: 2.6 },   // the seat
        { x: 1.2, z: -2.2, r: 4.0 },     // the assembly
        { x: 3.05, z: -0.7, r: 1.2 },    // Kasyapa
      ],
    });

    for (const [p, rx, rz, op] of [
      [seat.position, 1.7, 1.2, 0.34],
      [kasyapa.position, 0.7, 0.55, 0.4],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the flower, and the smile --------------------------
    let camera = null;
    let dropped = 0;
    let smileT = 0;
    const falling = [];          // { mesh, age, x0, y0, z0, spin, drift }

    function releasePetal() {
      const petal = flower.dropPetal();
      if (!petal) return false;
      scene.add(petal);                       // reparented to the root; keeps its world spot
      falling.push({
        mesh: petal, age: 0,
        x0: petal.position.x, y0: petal.position.y, z0: petal.position.z,
        drift: (hash1(dropped * 3 + 1, 6) - 0.5) * 0.9,
        spin: (hash1(dropped * 3 + 2, 6) - 0.5) * 2.4,
      });
      dropped++;
      return true;
    }

    const flowerMeshes = [];
    flower.traverse((o) => { if (o.isMesh && !o.userData.isOutline) flowerMeshes.push(o); });
    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, flowerMeshes)) releasePetal();
    });

    let sinceAuto = 0;
    const AUTO_EVERY = 26;       // it happens on its own too, rarely, unhurried

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.12']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        world.update(dt, simTime);

        sinceAuto += dt;
        if (sinceAuto > AUTO_EVERY) { sinceAuto = 0; releasePetal(); }

        for (let i = falling.length - 1; i >= 0; i--) {
          const f = falling[i];
          f.age += dt;
          const t = Math.min(1, f.age / PETAL_FALL);
          // a leaf does not drop, it sways down
          f.mesh.position.set(
            f.x0 + Math.sin(f.age * 1.7) * 0.16 + f.drift * t,
            f.y0 - t * (f.y0 - 0.03),
            f.z0 + Math.cos(f.age * 1.3) * 0.12,
          );
          f.mesh.rotation.y += f.spin * dt;
          f.mesh.rotation.x = Math.sin(f.age * 2.1) * 0.5;
          if (t >= 1) falling.splice(i, 1);
        }

        // the smile arrives while a petal is in the air, and stays
        const airborne = falling.length > 0;
        if (airborne || smileT > 0) {
          smileT = Math.min(1, smileT + dt / SMILE_IN);
          smileMat.opacity = 0.9 * smileT;
        }
      },
      fragment() {
        return {
          petals: flower.children.filter((c) => c.name === 'petal').length,
          falling: falling.length,
          smile: +smileT.toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
