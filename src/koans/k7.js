import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeBasin, makeBowl, makeWater, makeMonk, faceMonk,
  makeOdoshi, makeCat, makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';

const ID = 7;
export default {
  id: ID,
  slug: 'joshu-washes-the-bowl',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // Used to declare water:0 — drips with no bed (a basin at rest is nearly
  // silent) — but that also scheduled random ambient drips, which Frank
  // decided he didn't want (see makeWaterBed's comment in synths.js: the
  // bed and its drip schedule are switched off everywhere, not just here).
  // A tap on the water still answers with one (audio.drip(), below) — that
  // response was never on this token, only the ambient schedule was; the
  // bowl answers as ceramic now, not as somebody else's water. The
  // shishi-odoshi is the yard's one declared emitter.
  ambience: ['wind:0.14', 'odoshi', 'music'],
  // the first bright case: washing a bowl is domestic, morning work — yo, not
  // hirajoshi
  mood: 'yo',

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // a short approach to the threshold, so the ground reads as trodden
    const path = makePath({ from: [2.4, 9], to: [0.2, -20], width: 1.5, seed: 47, groundSeed: 21, wander: 0.9 });
    scene.add(path);

    // the monastery threshold he has just entered
    const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4 });
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
    bowl.position.set(2.42, 0, 2.1);
    scene.add(bowl);

    // the monk who has eaten, and been told to go wash
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(1.55, 0, 1.75);
    faceMonk(monk, basin.position);
    scene.add(monk);

    // The shishi-odoshi, set back from the basin with its mouth turned toward
    // it. The distance is load-bearing: the tube reaches 0.7 when it tips,
    // and at the first placement (0.98 from the basin's axis) the mouth dipped
    // straight through the basin's wall — Frank watched it happen. At 1.77
    // the tipped mouth clears the stone by half a unit. Its knock is the
    // yard's clock; a tap tips it early.
    const odoshi = makeOdoshi({
      seed: 7,
      onPour: () => audio && audio.pour({ at: odoshi.group.position }),
      onKnock: (force) => audio && audio.knock({ force, at: odoshi.group.position }),
    });
    odoshi.group.position.set(3.75, 0, 0.15);
    odoshi.group.rotation.y = -2.70;
    scene.add(odoshi.group);

    // The monastery cat (k14's, on an ordinary morning — nothing hangs over
    // it here), sitting by the threshold with its eyes on the breakfast
    // bowl. Domestic, like everything in this case: someone ate, someone
    // washes up, the cat waits its turn.
    // ON the light path, deliberately — placement three. In the meadow the
    // grass swallowed it whole; on the hut's threshold it was ink against
    // ink. A dark cat needs the one pale surface in the yard, and sitting
    // in the middle of the walked road waiting for scraps is the most
    // cat thing about it.
    const cat = makeCat({ height: 0.32, seed: 7, pose: 'sit' });
    cat.group.position.set(1.35, 0.03, -0.5);
    faceMonk(cat.group, bowl.position);
    scene.add(cat.group);

    const world = composeWorld(scene, {
      seed: 7,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(24, 1.0),
        { at: hut, r: 3.0 },
        { at: basin, r: 1.5 },          // basin + bowl
        { at: monk, r: 1.1 },
        { at: odoshi.group, r: 1.2 },   // the deer-scarer and its flume
        { at: cat.group, r: 0.5 },
      ],
      // the trail, the hut's footprint and the basin's stone cover ground;
      // the monk stands in the grass like anyone would
      grassKeepout: [
        ...path.keepout(24, 0.95),
        { at: hut, r: 1.9 },
        { at: basin, r: 0.62 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [monk.position, 0.65, 0.5, 0.42],
      [basin.position, 0.8, 0.6, 0.36],
      [hut.position, 2.0, 1.5, 0.3],
      [odoshi.group.position, 0.7, 0.35, 0.32],
      [cat.group.position, 0.3, 0.22, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the water answers as water, the bowl as a bowl ------
    let camera = null;
    let clock = 0;
    let rippled = 0;
    let rocked = 0;
    // the bowl's rock: same idiom as k21's dung wobble — recent tap times,
    // summed as decaying oscillations, driven from update()
    const rocks = [];
    const surface = water.group.children.find((c) => c.name === 'surface');
    const bowlMeshes = [];
    bowl.traverse((o) => { if (o.isMesh && !o.userData.isOutline) bowlMeshes.push(o); });

    input.onTap(() => {
      if (!camera) return;
      // the deer-scarer first: a tap tips it without waiting out the fill
      if (input.raycastFirst(camera, odoshi.pickTargets())) { odoshi.tip(); return; }
      // the cat's stir travels with the cat (the kit rule): touched, it
      // shifts and resettles, no sound of its own — it is not this case's
      // instrument, just its company
      if (input.raycastFirst(camera, cat.meshes())) { cat.stir(); return; }
      // The bowl is ITS OWN thing now (Frank: "shake the bowl and make sound
      // for that instead of water") — it used to answer with a ripple in the
      // basin two steps away, a cause with somebody else's effect. Touched,
      // it rocks on its foot and clinks like the empty thing it is — the
      // ceramic touch voice, k40's vase being the precedent for fired clay.
      if (input.raycastFirst(camera, bowlMeshes)) {
        rocks.push(clock);
        if (rocks.length > 4) rocks.shift();
        rocked++;
        audio && audio.ceramic({ force: 0.6, at: bowl.position });
        return;
      }
      // touching the water rings it where you touched
      const onWater = surface ? input.raycastFirst(camera, [surface]) : null;
      if (onWater) {
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
        cat.update(dt, simTime);
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
