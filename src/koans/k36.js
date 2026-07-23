import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, aimMonk, makePine,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 36;

// "When you meet a Zen master on the road you cannot talk to him, you cannot
// face him with silence. What are you going to do?"
//
// Both of the answers you have are taken away before you start, so the scene
// gives you a road, a master standing in the middle of it, and one thing you
// can do: reach for him. He comes on, passes through where you are looking,
// re-forms on the far side, and keeps walking. You never get to face him and
// you never get to not face him.
//
// He is half-there from the first frame — not a ghost effect that triggers on
// touch, because a solid figure that suddenly went transparent would be a
// trick. This one was always like that.

const PASS = 17;          // seconds to come on, through, and out — a slow, dreamlike drift past (Frank: much slower)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'meeting-a-zen-master-on-the-road',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.24', 'music'],
  camera: { distance: 11.5, target: [0.5, 1.5, -0.6], azimuth: 0.55, polar: 1.23 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.032);
    scene.add(makeLights());

    // one road, running away into the fog in both directions
    const road = makePath({ from: [6.0, 7.0], to: [-5.5, -17], width: 1.6, seed: ID, groundSeed: 21, wander: 0.5 });
    scene.add(road);

    // YOU — or the traveller standing in for you — on the near stretch, staff
    // in hand, stopped
    const traveller = makeMonk({ height: 1.62, elder: true });
    const HERE = road.sample(0.30);
    traveller.position.set(HERE.x, 0, HERE.z);
    // facing up the road, into the oncoming figure — he has stopped BECAUSE of
    // the meeting, so he cannot be looking anywhere else
    const THERE = road.sample(0.72);
    aimMonk(traveller, { x: THERE.x, z: THERE.z });
    scene.add(traveller);
    // the traveller's staff stays plain ink now (Frank: the master is the seal,
    // not the staff)

    // THE MASTER, coming the other way, half-there and RED — he is the seal:
    // the one you cannot face or not-face, the thing the whole case is about.
    const master = makeMonk({ height: 1.68, color: ACCENT });
    master.name = 'master';
    master.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.42;
      o.material.depthWrite = false;
    });
    scene.add(master);

    // a pine at the roadside, so the passing has something to be measured
    // against
    const pine = makePine({ height: 4.0, seed: ID });
    const PP = road.sample(0.46);
    pine.position.set(PP.x + PP.perp.x * 2.6, 0, PP.z + PP.perp.z * 2.6);
    scene.add(pine);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...road.keepout(26, 1.5),
        { x: HERE.x, z: HERE.z, r: 1.3 },
        { x: pine.position.x, z: pine.position.z, r: 1.5 },
      ],
      grassKeepout: road.keepout(28, 1.0),
    });

    const shadow = makeBlobShadow({ radiusX: 0.68, radiusZ: 0.52, opacity: 0.42 });
    shadow.position.set(HERE.x, 0, HERE.z);
    scene.add(shadow);
    const pineShadow = makeBlobShadow({ radiusX: 0.8, radiusZ: 0.62, opacity: 0.30 });
    pineShadow.position.set(pine.position.x, 0, pine.position.z);
    scene.add(pineShadow);

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 2.0, 8),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'master-hit';
    hit.userData.noOutline = true;
    scene.add(hit);

    // ---- the moment: he goes through -------------------------------------
    // A single walk parameter runs 0.72 → 0.06 along the road, carrying him
    // from the far fog, through the traveller, and out past the camera. It
    // starts over on its own, and touching him only makes it start over sooner.
    let camera = null;
    let clock = 0;
    let reaches = 0;
    let runStart = 0;

    const place = (u) => {
      const t = 0.72 - u * 0.68;
      const p = road.sample(Math.max(0.02, Math.min(0.98, t)));
      master.position.set(p.x, 0, p.z);
      // facing back down the road, toward the traveller and past him
      master.rotation.y = Math.atan2(p.perp.x, -p.perp.z) + Math.PI / 2;
      hit.position.set(p.x, 1.0, p.z);
      // he thins as he arrives at the traveller and thickens again beyond —
      // you cannot look at him where he is closest
      const near = 1 - Math.min(1, Math.abs(u - 0.5) * 3.2);
      const op = 0.42 * (1 - near * 0.82);
      master.traverse((o) => { if (o.isMesh && o.material) o.material.opacity = op; });
      return op;
    };
    place(0);

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      reaches++;
      runStart = clock;                 // he starts the approach again
      audio && audio.chimeStrike({ tube: 3, force: 0.35 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        const u = ((clock - runStart) % PASS) / PASS;
        place(u);
      },
      fragment() {
        const u = ((clock - runStart) % PASS) / PASS;
        return {
          reaches,
          walk: +u.toFixed(3),
          faint: +(1 - Math.min(1, Math.abs(u - 0.5) * 3.2)).toFixed(3),
        };
      },
      dispose() {},
    };
  },
};
