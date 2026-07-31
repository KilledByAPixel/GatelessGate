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
// gives you the moment JUST AFTER: two travellers on the one road, each on his
// own side, already past one another — the meeting neither could open. The
// master keeps walking, down into the near fog, and comes up the road again;
// touching him only starts the approach over. You never get to face him and
// you never get to not face him.
//
// Both are solid ink. An earlier pass ghosted the master to half-opacity and
// Frank pulled it: he is not a spirit (case 35 is the one about souls), he is
// a man you failed to meet. The passing does the work the fade used to do.

const PASS = 17;          // seconds to come on, past, and out — a slow, dreamlike walk (Frank: much slower)
const LANE = 0.45;        // how far each keeps to his own side of the road
const START_U = 0.66;     // first frame: just past the meeting — the moment the case is about

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
    // in hand, keeping to his own side of the road and walking on: the meeting
    // is already behind him
    const traveller = makeMonk({ height: 1.62, elder: true });
    const HERE = road.sample(0.30);
    traveller.position.set(HERE.x + HERE.perp.x * LANE, 0, HERE.z + HERE.perp.z * LANE);
    // facing up the road, the way he is going — past the man he did not meet
    const THERE = road.sample(0.72);
    aimMonk(traveller, { x: THERE.x + THERE.perp.x * LANE, z: THERE.z + THERE.perp.z * LANE });
    scene.add(traveller);
    // the traveller's staff stays plain ink now (Frank: the master is the seal,
    // not the staff)

    // THE MASTER, going the other way on the other side, solid and RED — he is
    // the seal: the one you cannot face or not-face, the thing the whole case
    // is about.
    const master = makeMonk({ height: 1.68, color: ACCENT });
    master.name = 'master';
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
    shadow.position.set(traveller.position.x, 0, traveller.position.z);
    scene.add(shadow);
    const masterShadow = makeBlobShadow({ radiusX: 0.68, radiusZ: 0.52, opacity: 0.42 });
    scene.add(masterShadow);
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

    // ---- the moment: he goes past -----------------------------------------
    // A single walk parameter runs 0.72 → 0.04 along the road, carrying him
    // from the far fog, past the traveller on the other side, and out below
    // the camera. It starts over on its own, and touching him only makes it
    // start over sooner. The book opens on START_U — the two of them a stride
    // past each other, the meeting already missed.
    let camera = null;
    let clock = 0;
    let reaches = 0;
    let runStart = null;               // set from the first real clock reading

    const place = (u) => {
      const t = 0.72 - u * 0.68;
      const p = road.sample(Math.max(0.02, Math.min(0.98, t)));
      // his own side of the road — the traveller keeps to +perp, he to -perp
      const x = p.x - p.perp.x * LANE, z = p.z - p.perp.z * LANE;
      master.position.set(x, 0, z);
      // facing back down the road, toward the traveller and past him
      master.rotation.y = Math.atan2(p.perp.x, -p.perp.z) + Math.PI / 2;
      hit.position.set(x, 1.0, z);
      masterShadow.position.set(x, 0, z);
    };
    place(START_U);

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
        if (runStart === null) runStart = clock - START_U * PASS;
        world.update(dt, simTime);
        const u = ((clock - runStart) % PASS) / PASS;
        place(u);
      },
      fragment() {
        const u = runStart === null ? START_U : ((clock - runStart) % PASS) / PASS;
        return { reaches, walk: +u.toFixed(3) };
      },
      dispose() {},
    };
  },
};
