import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  aimMonk, bearing, composeWorld, faceMonk, makeBell, makeCylinderChime,
  makeDrum, makeHut, makeLantern, makeMonk, makePath, wrapPi,
} from '../kit/index.js';
import { makeLights } from '../render/lights.js';

const ID = 16;

// the elder's turn is a bearing eased toward another bearing — wrapPi/bearing
// from the kit, faceMonk's convention. The local pair here used to be
// aimMonk's (atan2(-dz, dx), which aims the pointing +x sleeve) — so the
// elder turning toward the bell ended up presenting his shoulder to it.

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
// The framing. This case used to take the book's default shot implicitly, by
// naming no `camera:` at all. These are DEFAULT_HOME's own numbers, written
// out so the shot is tuned here like every other case's rather than by moving
// the book. composeWorld gets the same object as its `view`, so the
// scatter still refuses spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10, target: [-0.4, 1.35, 0.3], heading: -7.5, pitch: 18 };

export default {
  id: ID,
  slug: 'bells-and-robes',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'bell' names the bonsho as an emitter: it has a real voice here, so the
  // density rule thins the swells around it without anyone mixing by hand.
  // 'cylinder' names the small bronze hung under the hall's own eave — the
  // hall is a real lived-in building here, and a single quiet voice by its
  // door reads as the monastery's own everyday sound, distinct enough from
  // the bonsho (a single note, only occasionally wind-struck) that it never
  // competes with the summons that is this case's whole subject.
  ambience: ['wind:0.14', 'bell', 'cylinder', 'music'],

  camera: CAM,

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // The walk crosses the yard front-left to back-right, BETWEEN the hall and
    // the bell, so the court reads as ground people actually cross — and so a
    // monk on it is naturally broadside to the bell when the sound reaches him.
    const path = makePath({ from: [-8.0, 8.8], to: [12.4, -15.3], width: 1.4, seed: ID, groundSeed: 21, wander: 1.1 });
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
    bell.group.position.set(2.3, 0, -.7);
    bell.group.rotation.y = -0.1;
    scene.add(bell.group);

    // a stone lantern where the walk passes nearest the hall
    const lp = path.sample(0.30);
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
    elder.position.set(ep.x + ep.perp.x * -2.45, 0, ep.z + ep.perp.z * 3.45);
    const walkTo = path.sample(0.72);
    const yWalk = bearing(elder.position, { x: walkTo.x, z: walkTo.z });
    const yBell = bearing(elder.position, bell.group.position);
    const fullTurn = wrapPi(yBell - yWalk);
    elder.rotation.y = 5.4; // hacked to face away at first
    scene.add(elder);

    // and the monk just out of the hall door, robes on, facing the sound
    const front = { x: Math.sin(hall.rotation.y), z: Math.cos(hall.rotation.y) };

    // The temple pair: where a bell hangs, a drum stands (k13's, off duty).
    // By the hall's front corner, facing the bell across the yard — and
    // SILENT here on purpose: this case is about answering THE BELL, and a
    // second voice in the yard would blur the one sound the koan turns on.
    const drum = makeDrum({ radius: 0.5, seed: 16 });
    drum.group.position.set(-3.5, 0, -2.0);
    drum.group.rotation.y = 2.1;
    scene.add(drum.group);
    const hallMonk = makeMonk({ height: 1.62, stout: 1.04 });
    hallMonk.position.set(hall.position.x + front.x * 1.9, 0, hall.position.z + front.z * 1.9);
    faceMonk(hallMonk, bell.group.position);
    scene.add(hallMonk);

    // A single small bronze under the hall's own front eave, well clear of
    // the doorway (door spans |x| < ~0.78 at this width) and tucked close
    // to the wall — the everyday sound a lived-in monastery corner already
    // has, quite apart from the bonsho this case turns on. Hung as a child
    // of the hall so it stays square to the building at whatever angle the
    // scene places it, the same idiom case 29 uses for its gate.
    const eaveChime = makeCylinderChime({
      size: 0.7, seed: 16,
      onStrike: (note, force, pos) => audio && audio.cylinderStrike({ note, force, at: pos }),
    });
    eaveChime.group.position.set(1.3, 2.4, 1.65);
    //hall.add(eaveChime.group);

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      groundSeed: 21,
      trees: 3,
      keepout: [
        ...path.keepout(26, 1.4),
        { x: hall.position.x, z: hall.position.z, r: 3.4 },
        { x: bell.group.position.x, z: bell.group.position.z, r: 2.2 },
        { x: near.position.x, z: near.position.z, r: 1.2 },
        { x: elder.position.x, z: elder.position.z, r: 1.2 },
        { x: hallMonk.position.x, z: hallMonk.position.z, r: 1.2 },
        { x: lantern.position.x, z: lantern.position.z, r: 0.9 },
        { x: drum.group.position.x, z: drum.group.position.z, r: 0.9 },
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
      // the eave chime first: it hangs well clear of the bell's own pick
      // targets, but probing it first (and returning) keeps the two voices
      // from ever being ambiguous about which tap rang which one
      const chimeHit = eaveChime.pick(camera, input);
      if (chimeHit) { eaveChime.ring(0.75); return; }
      if (!input.raycastFirst(camera, bell.pickTargets())) return;
      if (clock - lastRing < 0.5) return;
      lastRing = clock;
      bell.strike();
      strikes++;
      turning = true;
      // the book's canonical bonshō — task-12's migration to the tuned
      // presets; this IS the case the temple preset is named for
      audio && audio.bell({ preset: 'temple', at: bell.group.position });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        bell.update(dt, simTime);
        eaveChime.setWindLevel(1);     // a steady yard breeze — see k47's furin
        eaveChime.update(dt, simTime);
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
          chimeStrikes: eaveChime.strikes(),
        };
      },
      dispose() {},
    };
  },
};
