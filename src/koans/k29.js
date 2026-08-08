import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeLantern, makeMonk, aimMonk, faceMonk, makeGate, makeFlag,
  makeLights, addOutlines, makeFurin,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 29;

// The wind level the flag drives when its own animated level is at full — kept
// as a single constant so the ambience recipe below and the case's runtime math
// can never disagree about it.
const BASE_WIND = 0.25;

// The full ambience recipe, declared once. 'furin' carries no level of its own —
// each chime's real gain comes from single.setWindLevel(flag.windLevel()) in
// the case's update loop — but its presence still matters: emitterCount() sees
// it and thins the drift layer accordingly (src/audio/music.js's density rule:
// "the more a scene already sounds, the less the drift plays"). Repeated
// TWICE, not once and not three times (one per chime hanging under the
// lintel). density = min(3, 1 + 0.7*emitters) saturates at emitters >= 2.858,
// so the third token is worth almost nothing anyway — the honest choices were
// 1 or 2. Three chimes answering the same wind IS busier than the single
// chime this case shipped with, which is why this is 2 and not 1; but three
// single tubes fire far less often than a five-tube ring did, so the drift
// layer should thin, not nearly vanish (every OTHER case in the book tops out
// at 2 emitters, e.g. k7, k13, k49). Repeating the token at all is still
// mechanically safe: emitterCount() just filters and counts
// (src/audio/ambience_diff.js), it doesn't dedupe by type, and diffAmbience()
// still reports 'music' as a keep across a page turn on this recipe either
// way, so there's no restart, no seam.
const AMBIENCE = ['wind:' + BASE_WIND, 'furin', 'furin', 'music'];

// The framing. This case used to take the book's default shot implicitly, by
// naming no `camera:` at all. These are DEFAULT_HOME's own numbers, written
// out so the shot is tuned here like every other case's rather than by moving
// the book (Frank). composeWorld gets the same object as its `view`, so the
// scatter still refuses spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.5, target: [1.2, 1.35, 0.3], heading: 31.5, pitch: 17.2 };

export default {
  id: ID,
  slug: 'not-the-wind-not-the-flag',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: AMBIENCE,

  camera: CAM,

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
    const path = makePath({ from: [1.4, 9], to: [7.4, -33.6], width: 1.8, seed: 91, groundSeed: 21, wander: 1.3 });
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
      view: CAM,
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

    // THREE single-tube fūrin under the gate's lintel, one size each —
    // Frank asked for "single wind chimes that can hang that could get
    // knocked individually ... a single tone. Much of them hanging": three
    // separate voices answering the same wind in their own time is the
    // koan's own argument (not the wind, not the flag) staged as sound.
    //
    // THE RING IS GONE, on Frank's own call after seeing it staged: "for
    // case twenty nine, let's get rid of the five-tube ring that's placed.
    // So it's just gonna have three, the three different sizes. That's what
    // it's gonna have." A five-note cluster and three single notes under one
    // beam was two ideas competing; three singles at three sizes is the one
    // idea, and the sizes are visible from the road. (Its removal also
    // returns 6 draws and the whole left end of the lintel, which is why
    // every position below could be respread.)
    //
    // BURIED CHIME, FOUND DURING AN EARLIER REVIEW and worth keeping on the
    // record: the ring used to hang at local (1.2, 2.6, 0) — exactly on the
    // right post's own axis (post x = +-width/2 = +-1.2, z = 0, same as the
    // chime), and the post's radius there (~0.0913, tapered from
    // POST_BOTTOM_R 0.12 to POST_TOP_R 0.09, src/kit/gate.js) exceeded the
    // ring's own widest point for its whole vertical extent. It had been
    // invisible, not merely close, since the day the case was staged. The
    // lesson generalises to anything hung on a gate: check the post radius
    // at the hang height, not at the foot.
    //
    // POSITIONS, measured off src/kit/gate.js at this case's default width
    // (2.4) and height (2.6): the kasagi's overall footprint is
    // width*1.4 = 3.36, but only its flat CENTRE span is flush with
    // y = height+0.09 - KASAGI_H/2 = 2.6 — that span is
    // width*1.4 - 2*(width*1.4*0.24) = 1.7472 wide, so |x| < 0.8736 is flush
    // underside with no gap to the wood. Past that the kasagi's wing tilts
    // upward, and the posts stand at +-width/2 = +-1.2 under that wing. All
    // three hang on the flat span, evenly spread across it now that the ring
    // no longer takes its left end.
    //
    // MAX-AMPLITUDE CHECK (task-swing-tune-brief.md: "a bigger fūrin swing
    // must not push tubes through the cap or through each other"). A fūrin's
    // cord, cap, tubes and tag are ONE rigid body pivoting at the hang
    // point, so a bigger swing can never make one collide with ITSELF; the
    // risk is external — the whole assembly displacing sideways into a
    // NEIGHBOUR. (The clapper does now swing independently inside that
    // assembly — see THE CLAPPER in kit/furin.js — but it is bounded to the
    // tubes' own clearance by a real collision, so it never widens the
    // silhouette this check measures.)
    //
    // A CODE REVIEW ONCE CAUGHT A REAL, MEASURED COLLISION here by noticing
    // that the check swung every chime the SAME direction — nearly the BEST
    // case, since adjacent chimes then displace together and the gap barely
    // changes. The worst case is COUNTER-phase (adjacent chimes swung toward
    // EACH OTHER), which needs no special engineering to reach: two ordinary
    // taps landing about half a period apart, or one tap against an existing
    // wind lean. tests/k29.test.js checks it that way — real module, VISIBLE
    // meshes only (the invisible oversized pick drums are allowed to
    // overlap; a forgiving tap zone is not a visual bug), every pair's own
    // worst-case sign combination — against the LIVE SWING.maxOmegaFrac
    // rather than a copied number, so raising the swing cap fails the test
    // rather than silently pushing two chimes through each other.
    //
    // TIE BEAM CLEARANCE: the nuki (src/kit/gate.js's cross-tie) sits at
    // y = height*0.78 = 2.028, top face at 2.098, spanning the same x range
    // as every chime here. Swinging away from vertical only ever SHORTENS a
    // chime's drop (cos(theta) < 1), so REST is the worst case for this
    // clearance, and X is irrelevant to it (the nuki spans the whole width).
    // SINGLE_CORD below is what sets it — see its own comment.
    const SINGLE_X = [-0.72, 0, 0.72];
    // SIZES: PROBLEM 1, task-swing-tune-brief.md — "the lower ones are
    // bigger... probably the length, maybe a little bit of both." Each
    // single hangs a DIFFERENT size and reports whatever note that size
    // implies (makeFurin's own noteForSize, kit/furin.js) — the case does
    // not pick a note independent of geometry, it picks a size and the note
    // follows, matching audio.bell() and makeCylinderChime everywhere else
    // in the book. Chosen so the sounding notes land on the spread already
    // approved by ear (-1, 5, 9): 0.18 -> -1, 0.12 -> 5, 0.09 -> 9
    // (pinned in tests/k29.test.js). The lowest (0.18) is exactly 2x the
    // highest (0.09) — the brief's own worked example for a ~2-octave
    // spread, landed here by solving for size rather than picking a round
    // number and hoping.
    const SINGLE_SIZES = [0.18, 0.12, 0.09];
    // ABSOLUTE cord lengths, in world units, not fractions of size — Frank,
    // watching three sizes hang side by side: "the small ones are not
    // hanging low enough." They weren't, and a size-relative cord is exactly
    // why: it gives the SMALLEST chime the SHORTEST string, so the one that
    // most needs to reach down to join the group is the one pinned tightest
    // to the beam.
    //
    // Solved so the three BELLS hang on one line — bottoms within 0.001 of
    // each other, at CORD + (0.18 + SINGLE_BODY_LEN)*size below the lintel —
    // rather than the paper below them, which is meant to vary. That reads
    // as one row of chimes at three sizes instead of three chimes at three
    // heights. Total reach including the tanzaku is CORD + 1.98*size, worst
    // 0.451 on the biggest, against the nuki's own 0.502 (TIE BEAM CLEARANCE
    // above; rest is the worst case, since swinging only shortens the drop).
    const SINGLE_CORD = [0.095, 0.156, 0.187];
    const singles = SINGLE_X.map((x, i) => {
      const single = makeFurin({
        tubes: 1,
        size: SINGLE_SIZES[i],
        seed: 293 + i,                 // distinct, though inert once phase is explicit below
        cordLength: SINGLE_CORD[i],
        phase: 1.3 + 2.4 * i,          // own clock, so they never sway or strike in lockstep
        onStrike: (tube, force, pos) => audio && audio.chimeStrike({ tube, force, at: pos }),
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
      // each single is its own object with its own pick() — probed in turn
      // and returned on the first hit. The `return` matters twice over: it
      // stops one tap from ringing more than one chime, AND it stops the
      // handler falling through to the flag-mesh check below and toggling
      // the wind on the same tap that just rang a chime (tests/k29.test.js
      // mutation-verifies this second consequence by deleting the return).
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
      // 'furin' has to be present here too so emitterCount() sees the chimes
      // and thins the drift accordingly
      update(dt, simTime) {
        flag.update(dt, simTime);
        world.update(dt, simTime);            // drives the meadow's wind
        const level = flag.windLevel() * baseWind;
        audio && audio.setWindLevel(level);
        // all three answer the same wind — stilling the flag has to still
        // every one of them, or the case's whole conceit breaks
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
          // summed, not per-chime — a debug-panel fragment is finite numbers
          // and booleans only (tests/staging.test.js), no arrays
          singleStrikes: singles.reduce((n, s) => n + s.strikes(), 0),
        };
      },
      dispose() {},
    };
  },
};
