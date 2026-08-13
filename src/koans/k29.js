import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeLantern, makeMonk, aimMonk, faceMonk, makeGate, makeFlag,
  makeLights, makeFurin, setFoliageWeather, foliageWind,
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
// naming no `camera:` at all. These are DEFAULT_HOME's own numbers, written out
// so the shot is tuned here like every other case's rather than by moving the
// book. composeWorld gets the same object as its `view`, so the scatter still
// refuses spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.5, target: [2.75, 1.35, 0.55], heading: 36.5, pitch: 17.2 };

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
    const gp = path.sample(0.31);
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

    // THREE single-tube fūrin under the gate's lintel, one size each — three
    // separate voices answering the same wind in their own time, which is the
    // koan's own argument (not the wind, not the flag) staged as sound. A
    // five-tube ring hung here too for a while; a cluster and three single
    // notes under one beam was two ideas competing.
    //
    // ANYTHING HUNG ON A GATE: CHECK THE POST RADIUS AT THE HANG HEIGHT, not at
    // the foot. The ring used to hang exactly on the right post's own axis,
    // where the taper still left the post wider than the chime for its whole
    // vertical extent — it had been invisible, not merely close, since the day
    // the case was staged.
    //
    // POSITIONS are measured off src/kit/gate.js rather than typed: only the
    // kasagi's flat CENTRE span is flush underside with no gap to the wood, and
    // past that its wings tilt up over the posts. All three hang on that span.
    //
    // MAX-AMPLITUDE CHECK. A fūrin's cord, cap, tubes and tag are ONE rigid
    // body pivoting at the hang point, so a bigger swing can never make one
    // collide with ITSELF; the risk is external — the whole assembly displacing
    // sideways into a NEIGHBOUR. (The clapper swings independently inside that
    // assembly, but a real collision bounds it to the tubes' own clearance, so
    // it never widens the silhouette this measures.)
    //
    // THE WORST CASE IS COUNTER-PHASE, and a check that swings every chime the
    // SAME way measures nearly the BEST one — adjacent chimes displace together
    // and the gap barely changes. Counter-phase needs no contrivance to reach:
    // two ordinary taps half a period apart, or one tap against a wind lean. A
    // real, measured collision hid behind the easier check once.
    // tests/k29.test.js does it properly — real module, VISIBLE meshes only
    // (oversized pick drums may overlap; a forgiving tap zone is not a visual
    // bug), every pair's own worst-case sign combination, against the LIVE
    // SWING.maxOmegaFrac rather than a copied number — so raising the swing cap
    // fails the test instead of silently pushing two chimes through each other.
    //
    // TIE BEAM CLEARANCE: the nuki spans the same x range as every chime, so x
    // is irrelevant to it, and swinging off vertical only ever SHORTENS a
    // chime's drop — REST is the worst case. SINGLE_CORD below is what sets it.
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
    // ABSOLUTE cord lengths, in world units, not fractions of size. Hung side
    // by side, the small ones did not reach low enough, and a size-relative
    // cord is exactly why: it gives the SMALLEST chime the SHORTEST string, so
    // the one that most needs to reach down to join the group is the one pinned
    // tightest to the beam.
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

    const baseWind = BASE_WIND;
    let camera = null;

    // ---- THE WHOLE SCENE'S WIND, not just the flag's ---------------------
    // Stopping the flag used to stop the flag, the chimes and the sound, and
    // leave the meadow laying over and the trees working away behind it
    // — the wind went on visibly moving the grass and the trees. On a page
    // whose entire argument is what the wind is and is not,
    // a still flag over a moving meadow is the case refuting itself.
    //
    // Both fields are held only WHILE the flag is not at full wind, and handed
    // back exactly on the way out — the same contract case 20's squall keeps
    // with the same two sliders, and the reason `base` is sampled at the moment
    // of taking over rather than at build: the workbench's own values are what
    // the page is wearing, and dragging a slider mid-page must still land.
    //
    // The grass field is this scene's own object; the FOLIAGE wind is one
    // module-level uniform shared by every tree in the book (kit/foliage.js),
    // so leaving it down would follow the reader to the next page. It does not,
    // twice over: the release below hands it back the moment the flag comes up,
    // and dispose() hands it back if the reader leaves the page with the flag
    // still down. (debug.apply() would also rewrite it on the next page build,
    // but a case should not need the workbench to clean up after it.)
    //
    // IT DOES NOT GO TO ZERO. A dead-still meadow and dead-still trees read as
    // the picture having crashed rather than as the wind having dropped — the
    // page simply looks frozen. A tenth still reads plainly as stopped next to
    // the flag's own full lean, and the page stays alive.
    //
    // The floor is on the two FIELDS only. The chimes and the audible wind
    // still go all the way to silence with the flag: that is Mumon's argument
    // staged as sound and it is what the case is for — and at a tenth of a
    // wind a fūrin would barely speak anyway.
    const STILL = 0.1;
    const grass = world.grass;
    let held = false;
    let grassBase = 1;
    let treeBase = 1;
    const sample = () => {
      grassBase = grass && grass.wind ? grass.wind() : 1;
      treeBase = foliageWind();
    };
    const release = () => {
      held = false;
      grass && grass.setWind(grassBase);
      setFoliageWeather({ wind: treeBase });
    };
    function weather(level) {
      // what the fields answer: full wind at the flag's full lean, never below
      // a tenth of it
      const scale = STILL + (1 - STILL) * level;
      if (scale > 0.999) {
        // free: whatever the sliders say IS the weather, and it is what we
        // will hand back
        if (held) release(); else sample();
        return;
      }
      if (!held) { held = true; sample(); }
      grass && grass.setWind(grassBase * scale);
      setFoliageWeather({ wind: treeBase * scale });
    }

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
        // the toggle itself was silent — the wind's own bed ramps too slowly to
        // read as an acknowledgment, and the toggle needs feedback either way
        // it goes. One breath, at the cloth, both directions.
        audio && audio.breath({ force: 0.7, at: hit.point });
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
        // and the meadow and the wood answer it too. Order against
        // world.update is free: both of these are uniforms, read at draw.
        weather(flag.windLevel());
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
          // the same wind reaching the other two things that show it
          grassWind: +(grass && grass.wind ? grass.wind() : 0).toFixed(4),
          treeWind: +foliageWind().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
          // summed, not per-chime — a debug-panel fragment is finite numbers
          // and booleans only (tests/staging.test.js), no arrays
          singleStrikes: singles.reduce((n, s) => n + s.strikes(), 0),
        };
      },
      // the trees' wind is one uniform shared by the whole book, so a reader
      // who turns this page with the flag still down must not take a stilled
      // wood with them
      dispose() { if (held) release(); },
    };
  },
};
