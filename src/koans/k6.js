import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';

import {
  composeWorld, makeBuddha, makeMonk, faceMonk, makeFlower, makeAssembly,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { hash1 } from '../util/noise.js';
import { PAPER, ACCENT, WASH } from '../palette.js';

const ID = 6;

const PETAL_FALL = 5.0;     // seconds for a petal to reach the ground
const SMILE_IN = 1.4;

export default {
  id: ID,
  slug: 'buddha-twirls-a-flower',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12', 'music'],
  mood: 'yo',      // the flower and the smile — the gentlest case in the book

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // Vulture Peak: the Buddha raised on a low stone, the assembly below him.
    // The stone came down with the statue (overnight pass 2: he is the same
    // ordinary figure as everyone now, so the 1.5-radius platform of the
    // 2.35 colossus would read as a stage under a man).
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.1, 0.34, 9),
      toonMaterial({ color: WASH.stone, flat: true }));
    seat.name = 'seat';
    const SEAT_Z = -5.0;                  // far enough back that the assembly can sit between
    seat.position.set(1.2, 0.17, SEAT_Z);
    scene.add(seat);

    // ordinary monk scale — the raised stone, not his size, is what sets him
    // apart at the back of the scene
    const buddha = makeBuddha({ height: 1.6 });
    buddha.position.set(1.2, 0.34, SEAT_Z);
    scene.add(buddha);

    // The lotus, STANDING ON THE GROUND before the raised stone — the one
    // thing in the case that actually happens. It used to be "held" at his
    // waist, which from the shipped lens meant a red mass punched through his
    // torso (Frank: "way too big, going through his body — it has to be DOWN,
    // in front of him"). So it is down: planted in the open ground between
    // the stone and the assembly, on his centre line, where the sight line to
    // him passes well over it. Still deliberately big — at this staging
    // distance a real-scale lotus is a red dot — big is fine; intersecting
    // is not.
    const flower = makeFlower({ height: 0.5, bloom: 0.62, petals: 7 });
    const FLOWER_Z = SEAT_Z + 1.0;                   // just clear of the stone's skirt
    flower.position.set(1.2, 0, FLOWER_Z);
    flower.rotation.z = -0.14;
    scene.add(flower);

    // Mahakasyapa sits nearest, apart from the rest — the one who understands.
    const kasyapa = makeMonk({ pose: 'sit', height: 1.55 });
    kasyapa.position.set(3.05, 0, -0.7);
    faceMonk(kasyapa, buddha.position);
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
        { x: 1.2, z: SEAT_Z, r: 2.0 },   // the seat
        { x: 1.2, z: -2.2, r: 4.0 },     // the assembly
        { x: 3.05, z: -0.7, r: 1.2 },    // Kasyapa
      ],
      // the stone platform covers ground, and the meadow steps back from the
      // grounded lotus so the bloom is not buried in blades; the assembly
      // sits in the grass
      grassKeepout: [
        { x: 1.2, z: SEAT_Z, r: 1.2 },
        { x: 1.2, z: FLOWER_Z, r: 0.9 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [seat.position, 1.1, 0.85, 0.34],
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
      update(dt, simTime) {
        world.update(dt, simTime);

        // he twirls it. The case is named for the gesture, and it is the only
        // motion in the scene besides the grass.
        flower.rotation.y = simTime * 0.32;

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
