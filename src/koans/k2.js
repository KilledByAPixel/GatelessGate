import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeMonk, faceMonk } from '../kit/monk.js';
import { makeFox } from '../kit/fox.js';
import { makeCave } from '../kit/cave.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 2;

// The staging. Not the corpse and not the pyre — the encounter: the fox out at
// the mouth of its cave, composed, looking back at the man who just freed it,
// and Hyakujo standing off with his staff and two monks who can see it now.
//
// Bearings are the kit's: a heading of ψ points along (sin ψ, cos ψ), so a
// figure's local +z lands on that compass line.
// Depth is doing real work here. The fox is small and it is the subject, so it
// sits forward, nearest the lens, and the monks recede behind it — the reverse
// of the obvious arrangement, where the standing figures crowd the front and
// the animal the whole case turns on ends up a red speck behind a robe.
//
// AND THEY ARE STRUNG ALONG ONE LINE, at bearing ~2.12. That is deliberate and
// it is the whole reason this staging holds: the rig lets the viewer drag from
// azimuth -0.35 to 1.45, so ANY two figures whose mutual bearing falls inside
// that span will eclipse each other somewhere in the drag. 2.12 is square to
// the middle of it, which puts every pair permanently off that span. Arranged
// by eye instead, the monks sat level with the fox in z and one of them wiped
// it off the screen entirely at the right-hand end of the orbit.
const CAVE = { x: -1.37, z: -2.88, yaw: 0.44 };
const FOX = { x: -0.67, z: -1.39, yaw: 1.40 };
const HYAKUJO = { x: 1.60, z: -2.75 };
const MONKS = [{ x: 2.74, z: -3.48 }, { x: 2.45, z: -2.61 }];

const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export default {
  id: ID,
  slug: 'hyakujo-s-fox',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'music'],

  // Framed low and a little left: aimed at the gap between the fox and the
  // monks rather than at anybody's head, and pitched so all four figures still
  // hold the frame at both ends of the drag the rig allows.
  // Pulled back and lifted. At distance 10 with the target down at 0.75 the lens
  // sat almost on the fox: the rock mass filled the top of the frame, Hyakujo was
  // cropped at the edge, and the encounter — a fox and a master regarding each
  // other — had no room to read as an encounter at all.
  camera: { distance: 14.5, target: [0.1, 1.35, -2.2], azimuth: 0.55, polar: 1.30 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // The mountainside, turned so the mouth faces the camera's home bearing and
    // the fox stands square in front of the opening rather than off beside it.
    // How much dark actually gets behind the fox depends on the pitch: drag the
    // camera down and it is backed by the black, at the home pitch the sightline
    // clears its back and lands on the threshold stone and the grass. Red on
    // paper is doing the real work of keeping it legible either way.
    const cave = makeCave({ width: 2.4, height: 2.4, depth: 1.9, seed: ID });
    cave.position.set(CAVE.x, 0, CAVE.z);
    cave.rotation.y = CAVE.yaw;
    scene.add(cave);

    // The fox. The one red thing here, and small enough to take ACCENT whole
    // rather than the deepened mix a whole animal usually needs.
    //
    // Built a size up from a real fox on purpose. Measured against the red dog
    // of case 1 — the book's own yardstick for how much frame a seal animal is
    // owed — a life-sized fox came out at barely half the presence, and this
    // one has to hold the shot against three standing figures. A fox a little
    // larger than a fox should be is also not the wrong note to strike here.
    const fox = makeFox({ height: 0.6, color: ACCENT, seed: ID });
    fox.group.position.set(FOX.x, 0, FOX.z);
    // stood broadside so the brush reads across the frame — a fox pointed at the
    // lens is a red smudge — with only the head come round to the monks
    fox.group.rotation.y = FOX.yaw;
    fox.setLook(bearing(FOX, HYAKUJO) - FOX.yaw);
    scene.add(fox.group);

    // Hyakujo, with the staff. He is not doing anything with it.
    const hyakujo = makeMonk({ height: 1.72, elder: true });
    hyakujo.position.set(HYAKUJO.x, 0, HYAKUJO.z);
    faceMonk(hyakujo, fox.group.position);
    scene.add(hyakujo);

    // and the monks who followed him round the mountain
    const monks = MONKS.map((m, i) => {
      const k = makeMonk({ height: 1.58 + i * 0.05, stout: 1 + i * 0.08 });
      k.position.set(m.x, 0, m.z);
      faceMonk(k, fox.group.position);
      scene.add(k);
      return k;
    });

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...cave.footprint(0.8),                       // the whole rock mass
        { x: FOX.x, z: FOX.z, r: 1.4 },
        { x: HYAKUJO.x, z: HYAKUJO.z, r: 1.2 },
        ...MONKS.map((m) => ({ x: m.x, z: m.z, r: 1.1 })),
      ],
      // only the cave's own stone floor actually covers ground. The fox is
      // sitting in the grass like any animal, and so are the monks.
      grassKeepout: cave.floor(0.15),
    });

    for (const [p, rx, rz, op] of [
      [{ x: CAVE.x, z: CAVE.z }, 2.6, 2.2, 0.22],
      [{ x: HYAKUJO.x, z: HYAKUJO.z }, 0.72, 0.56, 0.42],
      ...monks.map((k) => [k.position, 0.66, 0.5, 0.42]),
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    // the fox's own shadow lies along the fox, not along the world axes — it is
    // three times longer than it is wide and the difference shows
    const foxShadow = makeBlobShadow({ radiusX: 0.80, radiusZ: 0.28, opacity: 0.36 });
    foxShadow.position.set(FOX.x, 0.01, FOX.z);
    foxShadow.rotation.z = FOX.yaw - Math.PI / 2;
    scene.add(foxShadow);

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the fox notices you ---------------------------------
    // An ear, a turn of the head, one sweep of the brush, and then it is a fox
    // sitting outside a cave again. Nothing is asked of you and nothing is won.
    let camera = null;
    const foxMeshes = [];
    fox.group.traverse((o) => { if (o.isMesh && !o.userData.isOutline) foxMeshes.push(o); });

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, foxMeshes)) fox.notice();
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        fox.update(dt, simTime);
      },
      fragment() {
        return {
          headYaw: +fox.headYaw().toFixed(4),
          tailYaw: +fox.tailYaw().toFixed(4),
          stir: +fox.stir().toFixed(4),
          noticed: fox.noticed(),
        };
      },
      dispose() {},
    };
  },
};
