import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeLantern, makeMonk, aimMonk, faceMonk, makeGate, makeFlag,
  makeLights, makeBlobShadow, addOutlines, makeFurin,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 29;

// The wind level the flag drives when its own animated level is at full — kept
// as a single constant so the ambience recipe below and the case's runtime math
// can never disagree about it.
const BASE_WIND = 0.25;

// The full ambience recipe, declared once. 'furin' carries no level of its own —
// the chime's real gain comes from furin.setWindLevel(flag.windLevel()) in the
// case's update loop — but its presence still matters: emitterCount() sees it
// and thins the drift layer accordingly. Repeated four times: the ring chime
// plus the three singles below are four separate objects that each make their
// own noise when the wind moves them, not one chime with more tubes, so the
// scene now has four emitters, not one — emitterCount() just filters and
// counts (src/audio/ambience_diff.js), it does not dedupe by type, so this is
// the honest way to tell it. Left as one 'furin' would keep the drift layer as
// loud as if only the ring were hanging, which undersells how much is now
// making sound under that lintel.
const AMBIENCE = ['wind:' + BASE_WIND, 'furin', 'furin', 'furin', 'furin', 'music'];

export default {
  id: ID,
  slug: 'not-the-wind-not-the-flag',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: AMBIENCE,

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.03);
    scene.add(makeLights());

    // the road to the temple runs from the foreground into the fog; everything
    // is placed ON it via path.sample so the gate spans the trail and the
    // lanterns flank it. The two monks argue on the road ("the flag moves" /
    // "the wind moves").
    const path = makePath({ from: [1.4, 9], to: [1.4, -34], width: 1.8, seed: 91, groundSeed: 21, wander: 1.3 });
    scene.add(path);

    // the gate straddles the path a little way up the road
    const gp = path.sample(0.27);
    const gate = makeGate({});
    gate.position.set(gp.x, 0, gp.z);
    gate.rotation.y = gp.heading;
    scene.add(gate);

    // stone lanterns flank the gate, just outside the posts, square to the path
    const lw = 1.55;
    const lanternA = makeLantern({});
    lanternA.position.set(gp.x + gp.perp.x * lw, 0, gp.z + gp.perp.z * lw);
    lanternA.rotation.y = gp.heading;
    const lanternB = makeLantern({ height: 1.0 });
    lanternB.position.set(gp.x - gp.perp.x * lw, 0, gp.z - gp.perp.z * lw);
    lanternB.rotation.y = gp.heading;
    scene.add(lanternA, lanternB);

    // the monks meet on the road near the camera. the flag stands on its own
    // pole out to monkA's side and a little forward, so monkA — the one who
    // insists "the flag moves" — points clearly across at it and monkB, arguing
    // "no, the wind," is on the far side and never blocks the line.
    const mp = path.sample(0.17);

    const flag = makeFlag({ seed: 11 });
    flag.group.position.set(mp.x + mp.perp.x * 2.4, 0, mp.z + mp.perp.z * 2.4 + 0.6);
    scene.add(flag.group);

    const monkA = makeMonk({ pose: 'point' });
    monkA.position.set(mp.x + mp.perp.x * 0.6, 0, mp.z + mp.perp.z * 0.6);
    aimMonk(monkA, flag.group.position);      // raised sleeve aims at the flag
    const monkB = makeMonk({ stout: 1.12 });
    monkB.position.set(mp.x - mp.perp.x * 0.8, 0, mp.z - mp.perp.z * 0.8);
    faceMonk(monkB, monkA.position);           // turns toward monkA — the argument
    scene.add(monkA, monkB);

    // the rest of the world: mountains, forest, midground trees, scatter —
    // shared grammar, kept off the staging and the path by keepouts
    const world = composeWorld(scene, {
      seed: 29,
      groundSeed: 21,
      keepout: [
        ...path.keepout(26, 1.15),             // the worn trail, masked along its whole run
        { x: mp.x, z: mp.z, r: 3.0 },          // the monks' argument
        { x: gp.x, z: gp.z, r: 3.6 },          // gate + lanterns
      ],
      // grass grows around the monks' feet and up to the gate posts; only the
      // trodden road actually clears it
      grassKeepout: path.keepout(26, 1.05),
    });

    for (const [p, rx, rz, op] of [
      [monkA.position, 0.7, 0.55, 0.42],
      [monkB.position, 0.7, 0.55, 0.42],
      [gate.position, 1.8, 0.75, 0.32],
      [flag.group.position, 0.55, 0.45, 0.36],
      [lanternA.position, 0.35, 0.3, 0.3],
      [lanternB.position, 0.35, 0.3, 0.3],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    // a wind chime under the lintel. Strikes are paced by the chime's own
    // weather; the wind still gates it, so stilling the flag stills the chime.
    const furin = makeFurin({
      seed: 29,
      onStrike: (tube, force, pos) => audio && audio.chimeStrike({ tube, force, at: pos }),
    });
    furin.group.position.set(1.2, 2.6, 0);
    gate.add(furin.group);

    // three single-tube furin hung along the same lintel — Frank asked for
    // "single wind chimes that can hang that could get knocked individually
    // ... a single tone. Much of them hanging": several separate voices
    // answering the same wind in their own time is the koan's own argument
    // (not the wind, not the flag) staged as sound.
    //
    // POSITIONS, measured off src/kit/gate.js at this case's default width
    // (2.4): the kasagi's overall footprint is width*1.4 = 3.36, but only
    // its flat CENTRE span is flush with y = height+0.09 - KASAGI_H/2 = 2.6
    // (exactly where the ring chime already hangs) — that span is width*1.4
    // - 2*(width*1.4*0.24) = 1.7472 wide, so |x| < 0.8736 is flush underside
    // with no gap to the wood. Past that the kasagi's wing tilts upward, and
    // the posts stand at +-width/2 = +-1.2 under that wing with a radius of
    // ~0.091 at y = 2.6 (tapered from 0.12 at the foot to 0.09 at the top) —
    // wider than a whole single's reach (~0.07 to the tag's outer edge). The
    // ring chime already hangs AT the right post (x 1.2); the brief's
    // suggested mirror at -1.2 would seat a single's entire body inside the
    // left post's own cylinder rather than beside it, so all three singles
    // stay on the flat span instead, spread -0.8 to 0.55: clear of both
    // posts (>=0.4 margin) and of the ring chime (>=0.65 margin).
    const SINGLE_X = [-0.8, -0.25, 0.55];
    // NOTES: THE GOTCHA — a tubes:1 chime always reports tube index 0 to
    // onStrike, so three singles wired the obvious way would all sound the
    // SAME note. The case has to choose the pitch itself (as k4.js and
    // k22.js already do), so onStrike below substitutes SINGLE_NOTES[i] for
    // the reported index. The ring already sounds CHIME.degree + 0..4, a
    // tight five-note cluster; -1 sits one scale step BELOW that cluster (a
    // deep single answering from underneath), 5 sits one step ABOVE it
    // (bridges into the next octave), and 9 is a further octave up from that
    // bridge — three individually-sited voices bracketing the ring's cluster
    // rather than folding into it.
    const SINGLE_NOTES = [-1, 5, 9];
    const singles = SINGLE_X.map((x, i) => {
      const single = makeFurin({
        tubes: 1,
        seed: 293 + i,                 // distinct, though inert once phase is explicit below
        cord: 0.45 + 0.2 * i,          // different string lengths -> different resting heights
        phase: 1.3 + 2.4 * i,          // own clock, so they never sway or strike in lockstep
        onStrike: (_, force, pos) => audio && audio.chimeStrike({ tube: SINGLE_NOTES[i], force, at: pos }),
      });
      single.group.position.set(x, 2.6, 0);
      gate.add(single.group);
      return single;
    });

    addOutlines(scene, { width: 0.035, wobble: 0.7 });

    const baseWind = BASE_WIND;
    let camera = null;

    // hover the cloth -> local puff; tap the cloth -> toggle the wind
    input.onHover(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const local = flag.mesh.worldToLocal(hit.point.clone());
        flag.hoverAt(local.x, local.y);
      }
    });
    input.onTap(() => {
      if (!camera) return;
      const chimeHit = furin.pick(camera, input);
      if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
      // each single is its own object with its own pick() — probed in turn
      // and returned on the first hit, so one tap can never ring more than
      // one chime even where two singles' forgiving whole-chime drums overlap
      for (const single of singles) {
        const singleHit = single.pick(camera, input);
        if (singleHit) { single.ring(0.75, singleHit.tube); return; }
      }
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const on = flag.toggleWind();
        audio && audio.setWindLevel(on ? baseWind : 0);
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      // the full recipe, not just wind: 'music' starts the drift layer, and
      // 'furin' has to be present here too so emitterCount() sees the chime
      // and thins the drift accordingly
      update(dt, simTime) {
        flag.update(dt, simTime);
        world.update(dt, simTime);            // drives the meadow's wind
        const level = flag.windLevel() * baseWind;
        audio && audio.setWindLevel(level);
        furin.setWindLevel(flag.windLevel());
        furin.update(dt, simTime);
        // the singles answer the same wind as the ring — stilling the flag
        // has to still all four, or the case's whole conceit breaks
        for (const single of singles) {
          single.setWindLevel(flag.windLevel());
          single.update(dt, simTime);
        }
      },
      fragment() {
        return {
          windOn: flag.isWindOn(),
          windLevel: +flag.windLevel().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
          strikes: furin.strikes(),
          // summed, not per-chime — a debug-panel fragment is finite numbers
          // and booleans only (tests/staging.test.js), no arrays
          singleStrikes: singles.reduce((n, s) => n + s.strikes(), 0),
        };
      },
      dispose() {},
    };
  },
};
