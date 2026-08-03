import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makePath } from '../kit/path.js';
import { makeHut } from '../kit/hut.js';
import { makeLantern } from '../kit/lantern.js';
import { makeBell } from '../kit/bell.js';
import { makeMonk, aimMonk, faceMonk } from '../kit/monk.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 16;

// the elder's turn is a bearing eased toward another bearing, so two helpers
// in faceMonk's convention (rotation.y = atan2(dx, dz) turns the BODY's own
// front, local +z, onto the target). It used to be aimMonk's (atan2(-dz, dx),
// which aims the pointing +x sleeve) — so the elder turning toward the bell
// ended up presenting his shoulder to it.
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// Ummon's question is the daily monastery moment itself: the bell sounds, and
// monks everywhere stop what they are doing and turn toward the hall. So the
// diorama is a monastery corner at that instant — the hall behind, the bonshō
// on its frame in the yard, and three monks caught mid-response: one already
// at the frame, one on the walk half-turned toward the sound, one just out of
// the hall door. Every orientation converges on the bell, which is the seal.
//
// The interaction is the summons itself — the first case in the book you can
// HEAR. Touch the bell and it swings and rings (audio.bell), and the elder on
// the walk finishes the turn he was caught in.
export default {
  id: ID,
  slug: 'bells-and-robes',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'bell' names the bonsho as an emitter: it has a real voice here, so the
  // density rule thins the swells around it without anyone mixing by hand
  ambience: ['wind:0.14', 'bell', 'music'],

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // The walk crosses the yard front-left to back-right, BETWEEN the hall and
    // the bell, so the court reads as ground people actually cross — and so a
    // monk on it is naturally broadside to the bell when the sound reaches him.
    const path = makePath({ from: [-3.4, 8.8], to: [4.2, -19.0], width: 1.4, seed: ID, groundSeed: 21, wander: 1.1 });
    scene.add(path);

    // the hall, back-left, its threshold facing the yard
    const hall = makeHut({ width: 3.4, height: 2.4, depth: 2.6 });
    hall.position.set(-3.6, 0, -5.0);
    hall.rotation.y = 0.62;
    scene.add(hall);

    // THE BELL — the seal, and the reason everyone in the scene is turning.
    // On its own frame near the front of the court, angled so neither the beam
    // nor the swing plane lines up with the hall behind it.
    const bell = makeBell({ height: 1.1, color: ACCENT, seed: ID });
    bell.group.position.set(2.3, 0, 0.7);
    bell.group.rotation.y = -0.5;
    scene.add(bell.group);

    // a stone lantern where the walk passes nearest the hall
    const lp = path.sample(0.50);
    const lantern = makeLantern({ height: 1.15 });
    lantern.position.set(lp.x - lp.perp.x * 1.1, 0, lp.z - lp.perp.z * 1.1);
    scene.add(lantern);

    // The monk already at the frame, sleeve raised toward the bronze — the one
    // whose answer to the wide world is simply to attend the bell.
    const near = makeMonk({ pose: 'point', height: 1.58 });
    near.position.set(0.9, 0, 0.0);
    aimMonk(near, bell.group.position);
    scene.add(near);

    // The elder on the walk, staff in hand, CAUGHT MID-TURN: he was walking up
    // the path when the bell went, and he is staged partway between his own
    // bearing and the bell's. Striking the bell finishes the turn for him.
    // (He is the elder because a plain kit monk is nearly symmetric — a turn
    // only reads on a figure with a staff to carry around.)
    const ep = path.sample(0.42);
    const elder = makeMonk({ height: 1.66, elder: true });
    elder.position.set(ep.x + ep.perp.x * 0.45, 0, ep.z + ep.perp.z * 0.45);
    const walkTo = path.sample(0.62);
    const yWalk = bearing(elder.position, { x: walkTo.x, z: walkTo.z });
    const yBell = bearing(elder.position, bell.group.position);
    const fullTurn = wrapPi(yBell - yWalk);
    elder.rotation.y = yWalk + fullTurn * 0.42;
    scene.add(elder);

    // and the monk just out of the hall door, robes on, facing the sound
    const front = { x: Math.sin(hall.rotation.y), z: Math.cos(hall.rotation.y) };
    const hallMonk = makeMonk({ height: 1.62, stout: 1.04 });
    hallMonk.position.set(hall.position.x + front.x * 1.9, 0, hall.position.z + front.z * 1.9);
    faceMonk(hallMonk, bell.group.position);
    scene.add(hallMonk);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(26, 1.4),
        { x: hall.position.x, z: hall.position.z, r: 3.4 },
        { x: bell.group.position.x, z: bell.group.position.z, r: 2.2 },
        { x: near.position.x, z: near.position.z, r: 1.2 },
        { x: elder.position.x, z: elder.position.z, r: 1.2 },
        { x: hallMonk.position.x, z: hallMonk.position.z, r: 1.2 },
        { x: lantern.position.x, z: lantern.position.z, r: 0.9 },
      ],
      // only what covers ground: the trodden walk, the hall's footprint, the
      // bell's stone pad. The monks stand in the grass like anyone answering
      // a bell would.
      grassKeepout: [
        ...path.keepout(28, 0.9),
        { x: hall.position.x, z: hall.position.z, r: 2.0 },
        { x: bell.group.position.x, z: bell.group.position.z, r: 0.9 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [near.position, 0.65, 0.50, 0.42],
      [elder.position, 0.70, 0.55, 0.42],
      [hallMonk.position, 0.65, 0.50, 0.40],
      [bell.group.position, 1.05, 0.78, 0.34],
      [hall.position, 2.2, 1.7, 0.30],
      [lantern.position, 0.40, 0.32, 0.35],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: answer the bell -------------------------------------
    // Tap the bell and it swings and RINGS — the first audible moment in the
    // book; the engine's bell was built for the sit timer and this is it rung
    // in the open. Tap again while it is still moving and the strike stacks —
    // that is still true here: the bonshō swings and audibly hums for several
    // seconds (see kit/bell.js's own decay), so a genuine re-strike sits well
    // outside the 0.5s cooldown below. CODE REVIEW CAUGHT (Task 5C): what was
    // missing was a floor under a HELD pointer or a fast tapper, which had no
    // limit at all — k49's idiom (`clock - lastRing > 0.5`).
    // The elder finishes his turn at the first sound. Nothing is scored.
    let camera = null;
    let clock = 0;
    let strikes = 0;
    let turning = false;
    let lastRing = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, bell.pickTargets())) return;
      if (clock - lastRing < 0.5) return;
      lastRing = clock;
      bell.strike();
      strikes++;
      turning = true;
      audio && audio.bell({ f0: 98, at: bell.group.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        bell.update(dt, simTime);
        if (turning) {
          const diff = wrapPi(yBell - elder.rotation.y);
          elder.rotation.y += diff * (1 - Math.exp(-2.6 * Math.max(0, dt || 0)));
        }
      },
      fragment() {
        const left = Math.abs(wrapPi(yBell - elder.rotation.y));
        const turn = 1 - Math.min(1, left / (Math.abs(fullTurn) || 1));
        return {
          strikes,
          swing: +bell.swinging().toFixed(4),
          turn: +turn.toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
