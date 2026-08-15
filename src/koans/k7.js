import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBasin, makeBowl, makeWater, makeMonk, faceMonk,
  makeOdoshi, makeLights, tapMeshes, plantRock
} from '../kit/index.js';

const ID = 7;
// The framing. This case used to take the book's default shot implicitly, by
// naming no `camera:` at all. These are DEFAULT_HOME's own numbers, written out
// so the shot is tuned here like every other case's rather than by moving the
// book. composeWorld gets the same object as its `view`, so the scatter still
// refuses spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.7, target: [1.2, 1.35, 0.55], heading: 47, pitch: 14 };

export default {
  id: ID,
  slug: 'joshu-washes-the-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // Used to declare water:0 — drips with no bed (a basin at rest is nearly
  // silent) — but that also scheduled random ambient drips, which are not
  // wanted (see makeWaterBed's comment in synths.js: the bed and its drip
  // schedule are switched off everywhere, not just here). A tap on the water
  // still answers with one (audio.drip(), below) — that response was never on
  // this token, only the ambient schedule was; the bowl answers as ceramic now,
  // not as somebody else's water. The shishi-odoshi is the yard's one declared
  // emitter.
  ambience: ['wind:0.14', 'odoshi', 'music'],
  // the first bright case: washing a bowl is domestic, morning work — yo, not
  // hirajoshi
  mood: 'yo',

  camera: CAM,

  build(ctx) {
    const { audio, input, touched } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights({ sun: { heading: 67, pitch: 36 } }));

    let rock = plantRock(scene, { x: -2, z: 1.5, size: 2, sink: -.2 });
    rock.rotation.y = 3;
    scene.add(rock);

    // a short approach to the threshold, so the ground reads as trodden
    const path = makePath({ from: [2.4, 9], to: [0.2, -20], width: 1.5, seed: 47, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    const path2 = makePath({ from: [-25, -2.4], to: [20, -1.2], width: 1.5, seed: 47, groundSeed: 21, wander: 2 });
    scene.add(path2);

    // the monastery threshold he has just entered
    const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, chimes: 15});
    hut.position.set(-1.4, 0, -4.2);
    hut.rotation.y = 0.15;
    scene.add(hut);

    // The stone basin, and the water in it. Taller than it is wide, or it reads
    // as a puddle rather than a basin — and OPEN, which it was not: it was a
    // solid cylinder whose top cap sealed the water 4cm underneath it, so there
    // was no water to see.
    const BASIN_H = 0.62;
    const basin = makeBasin({
      inner: 0.44, outer: 0.56, rim: BASIN_H, floor: 0.30, color: WASH.stone, segments: 12,
    });
    basin.position.set(3.15, 0, 1.5);
    scene.add(basin);

    // round, because the basin is: a square sheet also used to poke its corners
    // out through the stone
    const water = makeWater({ shape: 'round', size: 0.86, color: WASH.ground });
    water.group.position.set(3.15, BASIN_H - 0.10, 1.5);   // below the rim, clear of it
    scene.add(water.group);

    // the bowl, set down beside the basin where he left it
    const bowl = makeBowl({ radius: 0.19, color: ACCENT });   // the seal of this koan
    bowl.position.set(2.42, 0, 2.3);
    scene.add(bowl);

    // THE TWO OF THEM. The case is four lines of talk, so the picture is a
    // conversation: Joshu by his own basin, and the monk who has just walked
    // in. Before this there was one figure and no Joshu at all, which left the
    // scene a man standing next to a bowl.
    //
    // Joshu is the elder, and he keeps the old figure's spot — he belongs to
    // the yard, and standing him within reach of the basin and the bowl is what
    // makes "then wash your bowl" a thing said about what is already at his
    // feet rather than an instruction shouted across a field.
    const joshu = makeMonk({ height: 1.62, elder: true });
    joshu.position.set(1.55, 0, 1.75);
    scene.add(joshu);

    // The monk who has just entered the monastery, up the path from Joshu and a
    // little past him. 1.87 units apart, which is only 0.13 of half-frame
    // between them on screen — they read as two because they stand at different
    // DEPTHS, one nearer and larger, not because they are spread across the
    // frame.
    //
    // Worth knowing before moving either of them: at this camera's distance a
    // body is about 0.06 of half-frame wide, so world distance and screen
    // separation are very different currencies. An earlier pass put them a
    // conversational 1.5 apart at the SAME depth and they collapsed into one
    // figure with a shadow.
    const monk = makeMonk({ height: 1.56 });
    monk.position.set(1.8, 0, -.1);
    scene.add(monk);

    // Facing last, once both are placed, so neither aims at where the other
    // was going to be.
    faceMonk(joshu, monk.position);
    faceMonk(monk, joshu.position);

    // The shishi-odoshi, set back from the basin with its mouth turned toward
    // it. The distance is load-bearing: the tube reaches 0.7 when it tips, and
    // at the first placement (0.98 from the basin's axis) the mouth dipped
    // straight through the basin's wall. At 1.77 the tipped mouth clears the
    // stone by half a unit. Its knock is the yard's clock; a tap tips it early.
    const odoshi = makeOdoshi({
      seed: 7,
      onPour: () => audio && audio.pour({ at: odoshi.group.position }),
      onKnock: (force) => audio && audio.knock({ force, at: odoshi.group.position }),
    });
    odoshi.group.position.set(3.75, 0, .5);
    odoshi.group.rotation.y = -3.10;
    scene.add(odoshi.group);

    // (The monastery cat used to sit on the path here, eyeing the breakfast
    // bowl. It went when the second figure arrived: two monks and a cat in a
    // yard this size is a crowd, and the cat sat exactly where the conversation
    // now stands. It is still k14's cat and still turns up in the afterword; it
    // just does not live in this case any more.)

    const world = composeWorld(scene, {
      view: CAM,
      seed: 9,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.0),
        ...path2.keepout(24, 1.0),
        { at: hut, r: 3.0 },
        { at: basin, r: 1.5 },          // basin + bowl
        { at: joshu, r: 1.1 },
        { at: monk, r: 1.1 },
        { at: odoshi.group, r: 1.2 },   // the deer-scarer and its flume
      ],
      // the trail, the hut's footprint and the basin's stone cover ground;
      // the monk stands in the grass like anyone would
      grassKeepout: [
        ...path.keepout(24, 0.95),
        ...path2.keepout(24, 0.95),
        { at: hut, r: 1.9 },
        { at: basin, r: 0.62 },
      ],
    });

    // ---- the moment: the water answers as water, the bowl as a bowl ------
    let camera = null;
    let clock = 0;
    let rippled = 0;
    let rocked = 0;
    // the bowl's rock: same idiom as k21's dung wobble — recent tap times,
    // summed as decaying oscillations, driven from update()
    const rocks = [];
    const surface = water.group.children.find((c) => c.name === 'surface');
    const bowlMeshes = tapMeshes(bowl);

    // brushing the water stirs it — mini-ripples by pointer speed (the
    // water's breeze; see stir in src/kit/water.js). Silent: the drip is the tap's.
    input.onHover(() => {
      if (!camera || !surface) return;
      const hit = input.raycastFirst(camera, [surface]);
      if (!hit) return;
      const local = water.group.worldToLocal(hit.point.clone());
      water.stir(local.x, local.z);
    });

    input.onTap(() => {
      if (!camera) return;
      // the deer-scarer first: a tap tips it without waiting out the fill
      if (input.raycastFirst(camera, odoshi.pickTargets())) { odoshi.tip(); return; }
      // The bowl is ITS OWN thing now — it used to answer with a ripple in the
      // basin two steps away, a cause with somebody else's effect. Touched, it
      // rocks on its foot and clinks like the empty thing it is — the ceramic
      // touch voice, k40's vase being the precedent for fired clay.
      if (input.raycastFirst(camera, bowlMeshes)) {
        // THE BOWL IS THE FIND, and it is the only one on this page. The
        // deer-scarer and the basin both answer — this scene has three things
        // that do — but the koan is "go wash your bowl", and a mark earned by
        // tipping the odoshi would say the reader had found the case when they
        // had found the garden it sits in.
        touched && touched();
        rocks.push(clock);
        if (rocks.length > 4) rocks.shift();
        rocked++;
        audio && audio.ceramic({ force: 0.6, at: bowl.position });
        return;
      }
      // touching the water rings it where you touched
      const onWater = surface ? input.raycastFirst(camera, [surface]) : null;
      if (onWater) {
        // rings, but is not the find — see the bowl above
        const local = water.group.worldToLocal(onWater.point.clone());
        water.ripple(local.x, local.z);
        audio && audio.drip({ loud: true, at: onWater.point });   // the touch you see is the drop you hear
        rippled++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);
        odoshi.update(dt, simTime);
        // the bowl settles quicker than the dung pile — it is round-bottomed
        // and light, a quick chatter that dies
        let a = 0;
        for (const t0 of rocks) {
          const t = clock - t0;
          if (t < 0) continue;
          a += 0.16 * Math.exp(-t / 0.38) * Math.sin(2 * Math.PI * t / 0.22);
        }
        bowl.rotation.z = a;
        bowl.rotation.x = a * 0.55;
      },
      fragment() {
        return {
          ripples: water.rippleCount(), rippled, rocked,
          wobble: +bowl.rotation.z.toFixed(4), knocks: odoshi.knocks(),
        };
      },
      dispose() {},
    };
  },
};
