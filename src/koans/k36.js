import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, makePine,
  makeWalk, walkHeading, pathLength,
  makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 36;

// "When you meet a Zen master on the road you cannot talk to him, you cannot
// face him with silence. What are you going to do?"
//
// Both of the answers you have are taken away before you start, so the scene
// gives you the moment JUST AFTER: two travellers on the one road, each on his
// own side, already past one another — the meeting neither could open. Both
// keep walking — the master down into the near fog and up the road again, the
// traveller away into the far fog and back; touching the master only starts
// his approach over. You never get to face him and you never get to not face
// him.
//
// Both are solid ink. An earlier pass ghosted the master to half-opacity and
// Frank pulled it: he is not a spirit (case 35 is the one about souls), he is
// a man you failed to meet. The passing does the work the fade used to do.

const PASS = 17;          // seconds for the master to come on, past, and out — a slow, dreamlike walk (Frank: much slower)
const TRAV_PASS = 19;     // the traveller covers the same road a shade slower — an elder's pace
const SPAN = 0.68;        // the stretch of road parameter each of them walks per pass
const LANE = 0.45;        // how far each keeps to his own side of the road
const START_U = 0.66;     // first frame: just past the meeting — the moment the case is about
const TRAV_U0 = (0.30 - 0.04) / SPAN;   // and the traveller a stride up the road at t=0.30, as staged last round

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
    // in hand, keeping to his own side of the road and WALKING ON up it: the
    // meeting is already behind him, and he does not stop either. He stood
    // still in the last round; Frank's walk note put both of them in motion.
    const traveller = makeMonk({ height: 1.62, elder: true });
    const HERE = road.sample(0.30);       // where the book opens on him (keepout below)
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
    scene.add(shadow);                     // follows the traveller, placed below
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

    // ---- the moment: they go past ------------------------------------------
    // The master's walk parameter runs 0.72 → 0.04 along the road, carrying him
    // from the far fog, past the traveller on the other side, and out below
    // the camera; the traveller's runs the other way, 0.04 → 0.72, up into the
    // same fog. Both wrap and start over on their own, and touching the master
    // only makes him start over sooner. The book opens on START_U — the two of
    // them a stride past each other, the meeting already missed.
    //
    // Both walk with the kit gait (the souls' walk from case 35, extracted to
    // src/kit/walk.js): a footfall bob, a weight-shift roll, a slow heading
    // sway — driven by DISTANCE covered, so the step rhythm is the pace you
    // see. Each faces his own direction of travel, upright: walkHeading takes
    // the travel vector and turns the figure's true front (local +z) onto it.
    // Twice now a pass has had these two a quarter turn off the road (Frank:
    // "rotated weird", then "facing the wrong way") — both times the bug was
    // heading math assuming the wrong forward axis, and the second fix moved
    // the convention into the kit so it cannot drift per-case again.
    let camera = null;
    let clock = 0;
    let reaches = 0;
    let runStart = null;               // set from the first real clock reading
    let travStart = null;

    const roadLen = pathLength(road.sample);
    const walkM = makeWalk({ seed: ID, height: 1.68 });
    const walkT = makeWalk({ seed: ID + 1, height: 1.62 });

    // u = fraction of a pass; s = road distance covered since HIS clock began,
    // fed to the gait unwrapped so footfalls stay continuous across the wrap
    const placeMaster = (u, s) => {
      const t = 0.72 - u * SPAN;
      const p = road.sample(Math.max(0.02, Math.min(0.98, t)));
      // his own side of the road — the traveller keeps to +perp, he to -perp
      const x = p.x - p.perp.x * LANE, z = p.z - p.perp.z * LANE;
      master.position.x = x; master.position.z = z;
      // down the road: t falling means travel along MINUS the tangent, and
      // perp = (-dz, dx) gives the tangent back as (perp.z, -perp.x)
      walkM.apply(master, s, walkHeading(-p.perp.z, p.perp.x));
      hit.position.set(x, 1.0, z);
      masterShadow.position.set(x, 0, z);
    };
    const placeTraveller = (u, s) => {
      const t = 0.04 + u * SPAN;
      const p = road.sample(Math.max(0.02, Math.min(0.98, t)));
      const x = p.x + p.perp.x * LANE, z = p.z + p.perp.z * LANE;
      traveller.position.x = x; traveller.position.z = z;
      // up the road, the way he is going — past the man he did not meet
      walkT.apply(traveller, s, walkHeading(p.perp.z, -p.perp.x));
      shadow.position.set(x, 0, z);
    };
    placeMaster(START_U, START_U * SPAN * roadLen);
    placeTraveller(TRAV_U0, TRAV_U0 * SPAN * roadLen);

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
        if (travStart === null) travStart = clock - TRAV_U0 * TRAV_PASS;
        world.update(dt, simTime);
        const mProg = (clock - runStart) / PASS;         // passes walked, unwrapped
        placeMaster(((mProg % 1) + 1) % 1, mProg * SPAN * roadLen);
        const tProg = (clock - travStart) / TRAV_PASS;
        placeTraveller(((tProg % 1) + 1) % 1, tProg * SPAN * roadLen);
      },
      fragment() {
        const u = runStart === null ? START_U : ((((clock - runStart) / PASS) % 1) + 1) % 1;
        const v = travStart === null ? TRAV_U0 : ((((clock - travStart) / TRAV_PASS) % 1) + 1) % 1;
        return { reaches, walk: +u.toFixed(3), walkT: +v.toFixed(3) };
      },
      dispose() {},
    };
  },
};
