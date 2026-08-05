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
// and thins the drift layer accordingly (src/audio/music.js's density rule:
// "the more a scene already sounds, the less the drift plays"). Repeated
// TWICE, not once and not four times (one per chime hanging under the
// lintel). density = min(3, 1 + 0.7*emitters) saturates at emitters >= 2.858,
// so 3 and 4 are literally identical to each other in effect — the honest
// choices were 1, 2, or capping the recipe's meaning outright. Four chimes
// answering the same wind IS busier than the single chime this case shipped
// with, which is why this is 2 and not 1; but it is not three times busier,
// three of the four are single tubes that fire far less often than the
// five-tube ring, so it is 2 and not 4 — the drift layer should thin, not
// nearly vanish (at 4 the mean gap goes 13s -> 39s, worst case 68s -> 120s;
// every OTHER case in the book tops out at 2 emitters, e.g. k7, k13, k49).
// Repeating the token at all is still mechanically safe: emitterCount() just
// filters and counts (src/audio/ambience_diff.js), it doesn't dedupe by type,
// and diffAmbience() still reports 'music' as a keep across a page turn on
// this recipe either way, so there's no restart, no seam.
const AMBIENCE = ['wind:' + BASE_WIND, 'furin', 'furin', 'music'];

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

    // The ring chime plus three single-tube furin, all hung under the same
    // lintel — Frank asked for "single wind chimes that can hang that could
    // get knocked individually ... a single tone. Much of them hanging":
    // several separate voices answering the same wind in their own time is
    // the koan's own argument (not the wind, not the flag) staged as sound.
    //
    // BURIED CHIME, FOUND DURING REVIEW: the ring used to hang at local
    // (1.2, 2.6, 0) — exactly on the right post's own axis (post x = +-width/2
    // = +-1.2, z = 0, same as the chime). Chasing why the task-7A brief's
    // suggested single position (x -1.2, the mirror) buried a chime inside
    // the LEFT post surfaced that the ring had been sitting inside the RIGHT
    // post the same way since the case was first staged: the post's radius at
    // y 2.6 is ~0.0913 (tapered from POST_BOTTOM_R 0.12 at the foot to
    // POST_TOP_R 0.09 at the top, src/kit/gate.js), and the ring's widest
    // point — the cap, 0.46*S = 0.078, rising toward ~0.096 lower in its hang
    // range — never exceeds that, for its whole vertical extent (y 2.6 down
    // to ~2.16, wholly inside the post's own 0-2.72 span). It had been
    // invisible, not merely close, since the day it was staged. Moved here
    // with the three singles rather than left where it was.
    //
    // POSITIONS, measured off src/kit/gate.js at this case's default width
    // (2.4) and height (2.6): the kasagi's overall footprint is
    // width*1.4 = 3.36, but only its flat CENTRE span is flush with
    // y = height+0.09 - KASAGI_H/2 = 2.6 — that span is
    // width*1.4 - 2*(width*1.4*0.24) = 1.7472 wide, so |x| < 0.8736 is flush
    // underside with no gap to the wood. Past that the kasagi's wing tilts
    // upward, and the posts stand at +-width/2 = +-1.2 under that wing. All
    // four chimes hang on the flat span, spread -0.79 to 0.80 (widened from
    // an earlier draft's -0.70..0.55 — see MAX-AMPLITUDE CHECK below for
    // why). "clear" below is edge-to-edge (real THREE.Box3 unions of the hit
    // drum and tag, not a hand estimate), at REST:
    //   ring     x -0.79  (S=0.17)  - 0.42 clear of single1, 0.20 clear of
    //            the left post, 0.08 clear of the flat span's own edge
    //   single1  x -0.17  (S=0.18, the DEEPEST single — see SIZES below)
    //            - 0.42 clear of single2
    //   single2  x  0.39  (S=0.12) - 0.31 clear of single3
    //   single3  x  0.80  (S=0.09, the HIGHEST single) - 0.26 clear of the
    //            right post, 0.07 clear of the flat span's own edge
    //
    // MAX-AMPLITUDE CHECK (task-swing-tune-brief.md: "a bigger fūrin swing
    // must not push tubes through the cap or through each other"). Every
    // piece of a furin — cord, cap, tubes, clapper, tag — is ONE rigid body
    // that pivots together at the hang point (none of them has its own
    // independent motion the way the bronze cylinder's clapper does), so a
    // bigger swing can never make a furin collide with ITSELF at any angle;
    // the real risk is external — a bigger swing displacing the whole rigid
    // assembly sideways, into a NEIGHBOUR.
    //
    // CODE REVIEW CAUGHT A REAL, MEASURED COLLISION in the first draft of
    // this check. It swung every chime the SAME direction — nearly the BEST
    // case, since adjacent chimes then displace together and the gap barely
    // changes. The actual worst case is COUNTER-phase (adjacent chimes
    // swung toward EACH OTHER), which needs no special engineering to
    // reach: two ordinary taps landing about half a period apart, or one
    // tap against an existing wind lean, both do it. Checked properly (real
    // module, VISIBLE meshes only — cord/tube/cap/clapper/tag, excluding
    // the invisible oversized pick targets, since a forgiving tap zone
    // overlapping another isn't a visual bug — each pair's own worst-case
    // sign combination, independent phases): at the FIRST draft's positions
    // (-0.70/-0.25/0.15/0.55) and SWING.maxOmegaFrac=0.85, a single plain
    // tap (theta=0.55) already put the ring and single1 visibly through
    // each other (gap -0.055), and the saturated-burst peak (theta=0.83)
    // put THREE of the four pairs through each other. Not a near miss.
    //
    // Fixed two ways together, since spacing alone did not fit inside the
    // gate's own post-to-post budget at the first draft's swing values:
    // SWING.maxOmegaFrac came down from 0.85 to 0.65 (see its own comment
    // in furin.js — still 2.17x the old 0.30, just no longer bigger than
    // the room under this gate), and every position here widened to use
    // the recovered space. Re-checked at both the single-tap peak
    // (theta=0.528, measured) and the new saturated-burst peak
    // (theta=0.627, measured) with the SAME counter-phase, visible-geometry
    // method:
    //   ring <-> single1:    0.130 clear (tap)   0.064 clear (burst)
    //   single1 <-> single2: 0.128 clear (tap)   0.073 clear (burst)
    //   single2 <-> single3: 0.096 clear (tap)   0.056 clear (burst)
    // every pair positive at both angles, with the tightest (single2<->
    // single3 at the burst peak) still a real 0.056 rad-equivalent margin,
    // not a hairline. Post clearance re-checked the same way: ring's own
    // worst-case reach at the burst peak stays 0.047 clear of the left
    // post's own surface, single3 stays 0.141 clear of the right post.
    // THIS ASSUMES SWING.maxOmegaFrac STAYS AT 0.65 — it is still a live,
    // owner-tunable starting point (dev/hanging-audition.html), and a much
    // bigger cap chosen later would need this check re-run, not assumed.
    //
    // TIE BEAM CLEARANCE: the nuki (src/kit/gate.js's cross-tie) sits at
    // y = height*0.78 = 2.028, top face at 2.098, spanning the same x range
    // as every chime here. A longer cord brings a chime's invisible pick drum
    // (the deepest point, 2.1*S below the hang point) closer to that face —
    // and swinging the assembly away from vertical only ever SHORTENS that
    // drop (cos(theta) < 1), so rest is the worst case for this particular
    // clearance (X position is irrelevant to it — the nuki spans the whole
    // width). The ring's own default cord (0.62, unchanged) already clears
    // it by only 0.040 — noted here rather than changed, since task-7A's
    // review scoped this to the singles. SIZES below set the singles' own
    // clearances (cord length is CORD_FRAC * SIZE, and size no longer
    // matches across the three): 0.048 / 0.188 / 0.259 — single1, the
    // biggest single, carries the tightest margin of the three (previously
    // single3, the deepest cord FRACTION, was tightest, back when every
    // single shared the same size). Unaffected by the X repositioning above.
    const RING_X = -0.79;
    const furin = makeFurin({
      seed: 29,
      onStrike: (tube, force, pos) => audio && audio.chimeStrike({ tube, force, at: pos }),
    });
    furin.group.position.set(RING_X, 2.6, 0);
    gate.add(furin.group);

    const SINGLE_X = [-0.17, 0.39, 0.80];
    // SIZES: PROBLEM 1, task-swing-tune-brief.md — "the lower ones are
    // bigger... probably the length, maybe a little bit of both." Each
    // single now hangs a DIFFERENT size and reports whatever note that size
    // implies (makeFurin's own noteForSize, kit/furin.js) — the case no
    // longer picks a note independent of geometry, it picks a size and the
    // note follows, matching audio.bell() and makeCylinderChime everywhere
    // else in the book. Chosen so the sounding notes land EXACTLY where the
    // previously-approved spread already sat (-1, 5, 9 — one scale step
    // below the ring's own five-note cluster, one step above it bridging the
    // next octave, and a further octave up from that bridge): 0.18 -> -1,
    // 0.12 -> 5, 0.09 -> 9 (noteForSize(0.18)===-1 etc., pinned in
    // tests/k29.test.js). The lowest (0.18) is exactly 2x the highest
    // (0.09) — the brief's own worked example for a ~2-octave spread ("the
    // lowest is about twice the length of the highest"), landed here by
    // solving for size, not by picking a round number and hoping.
    const SINGLE_SIZES = [0.18, 0.12, 0.09];
    const SINGLE_CORD = [0.42, 0.52, 0.60];   // see TIE BEAM CLEARANCE above
    const singles = SINGLE_X.map((x, i) => {
      const single = makeFurin({
        tubes: 1,
        size: SINGLE_SIZES[i],
        seed: 293 + i,                 // distinct, though inert once phase is explicit below
        cord: SINGLE_CORD[i],          // different string lengths -> different resting heights
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
      const chimeHit = furin.pick(camera, input);
      if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
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
