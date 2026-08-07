import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makePath } from '../kit/path.js';
import { makeMonk, aimMonk } from '../kit/monk.js';
import { makeBundle } from '../kit/bundle.js';
import { tapMeshes } from '../kit/pick.js';
import { toonMaterial, makeLights } from '../render/toon.js';
import { addOutlines } from '../render/outlines.js';
import { hash1 } from '../util/noise.js';

const ID = 23;

// THE STAGING IS AN ABSENCE.
//
// The case has three presences — the patriarch, the pursuer, the treasure —
// and the scene keeps only two. The patriarch has already withdrawn: the trail
// he left by runs on over the pass and into the fog, and nothing stands on it.
// Playing his half of the encounter with a figure would turn the koan into a
// standoff; playing it with empty road turns it into what it is, a man alone
// with the thing he thought he wanted.
//
// So: high country. A mountain trail wanders through from the near foreground
// and runs out toward the ranges. A flat-topped stone waits a step off its
// west edge, the folded robe on the stone, the bowl on the robe. E-myo has
// come off the road to it and stopped one pace short, sleeve out, hand not
// yet on the cloth — mid-reach is the whole pose, because the next instant of
// the story (he pulls, it does not come) is what the tap is for.
//
// The pair stand along bearing 2.12 from each other — square to the middle of
// the drag range for home heading 31.5, k2's rule — so E-myo never eclipses
// the stone anywhere in the orbit (min separation ~5 degrees, at the far right
// of the drag).
const TRAIL = { from: [1.6, 9], to: [-3.2, -20], width: 1.35, wander: 1.85 };
const STONE_T = 0.35;      // where along the trail the stone waits
const STONE_OFF = -1.05;   // a step off the trail's west edge
const APPROACH = 2.12;     // bearing E-myo -> stone (see above)
const PACE = 1.38;         // how far short of it he has stopped
const STONE_H = 0.52;
const STONE_R = 0.44;      // top radius — the flat the bundle sits on
const EMYO_H = 1.6;

// E-myo's reach. pose:'point' raises the sleeve toward the sky — right for
// indicating a flag or an oak, wrong for a hand closing on a low stone — so
// the case flattens the raised sleeve until its line runs from the shoulder to
// the robe itself. Derived from the same constants monk.js builds with (via
// the hem-direction identity: rotation.z = PI/2 + elevation).
const SLEEVE_DOWN = (span, targetY) => {
  const shX = 0.115 * EMYO_H, shY = 0.60 * EMYO_H;
  return Math.PI / 2 + Math.atan2(targetY - shY, (span - 0.10) - shX);
};

// And the reach is not steady. "Trembling for shame he said: I came wanting
// the teaching" — a couple of small incommensurate sines, a few milliradians,
// so the held sleeve carries the tremor without the pose ever changing.
const STIR = (t) => 0.007 * (0.62 * Math.sin(t * 11.3) + 0.38 * Math.sin(t * 6.7 + 2.1));

export default {
  id: ID,
  slug: 'do-not-think-good-do-not-think-not-good',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.22:pine', 'music'],   // high open country — more wind than the meadows

  // Close framing for a small subject (k3's precedent): the treasure is a
  // 0.4-unit stack on a half-unit stone. Numbers baked from the staged
  // positions — stone (0.09, -0.81), E-myo (-1.08, -0.09) — with the target
  // biased toward the bundle and lifted to the line between his chest and it.
  camera: { distance: 9.6, target: [-0.3, 0.92, -0.6], heading: 31.5, pitch: 20.1 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the trail over the mountain, wandering harder than a temple approach —
    // by the time it reaches this stone it has been climbing all day
    const path = makePath({
      from: TRAIL.from, to: TRAIL.to, width: TRAIL.width,
      seed: ID, groundSeed: 21, wander: TRAIL.wander,
    });
    scene.add(path);

    // the stone, placed FROM the trail so it stays on the verge however the
    // wander is retuned
    const sp = path.sample(STONE_T);
    const STONE = { x: sp.x + sp.perp.x * STONE_OFF, z: sp.z + sp.perp.z * STONE_OFF };
    const EMYO = {
      x: STONE.x - Math.sin(APPROACH) * PACE,
      z: STONE.z - Math.cos(APPROACH) * PACE,
    };

    // A squat faceted block with a dead-flat top: an altar the road happened
    // to provide. Column-jittered like the ranges so the silhouette breaks,
    // but y is never touched — the treasure needs a level table.
    const SEG = 9;
    const stoneGeo = new THREE.CylinderGeometry(STONE_R, STONE_R * 1.41, STONE_H, SEG);
    const spos = stoneGeo.attributes.position;
    for (let vi = 0; vi < spos.count; vi++) {
      const x = spos.getX(vi), z = spos.getZ(vi);
      if (Math.hypot(x, z) < 1e-4) continue;
      const ang = Math.atan2(z, x);
      const col = Math.round(((ang + Math.PI) / (2 * Math.PI)) * SEG) % SEG;
      const k = 1 + (hash1(col * 13 + 1, ID * 7) - 0.5) * 0.24;
      spos.setX(vi, x * k);
      spos.setZ(vi, z * k);
    }
    stoneGeo.computeVertexNormals();
    const stone = new THREE.Mesh(stoneGeo, toonMaterial({ color: WASH.stone, flat: true }));
    stone.name = 'stone';
    stone.position.set(STONE.x, STONE_H / 2, STONE.z);
    stone.rotation.y = 0.7;
    scene.add(stone);

    // the treasure: the robe takes the seal whole — small, held, and the thing
    // the case turns on — and the bowl stays its own quiet grey (case 7's bowl
    // was red; two red bowls two cases apart would read as a repeat)
    // Robe AND bowl both red — Frank's call. The pair together is the treasure
    // of succession; a grey bowl on a red robe read as the robe mattering more,
    // and the koan hands down both or neither.
    const bundle = makeBundle({ width: 0.46, color: ACCENT, bowlColor: ACCENT, seed: ID });
    bundle.group.position.set(STONE.x, STONE_H, STONE.z);
    bundle.group.rotation.y = 0.35;
    scene.add(bundle.group);

    // E-myo, one pace short, in the grass — he came off the road for this.
    // Leaned a few degrees into the reach; the tap plays the pull itself.
    const emyo = makeMonk({ height: EMYO_H, stout: 1.04, pose: 'point' });
    emyo.position.set(EMYO.x, 0, EMYO.z);
    aimMonk(emyo, { x: STONE.x, z: STONE.z });
    emyo.rotation.z = -0.06;
    scene.add(emyo);

    // flatten the raised sleeve onto the line from his shoulder to the robe.
    // The posed arm is the one pose:'point' swung past vertical; its stock
    // rotation.y (0.15) is zeroed so the reach reads clean in profile.
    const reach = emyo.children
      .filter((c) => c.name === 'arm')
      .sort((a, b) => b.rotation.z - a.rotation.z)[0];
    const span = Math.hypot(STONE.x - EMYO.x, STONE.z - EMYO.z);
    const REACH_Z = SLEEVE_DOWN(span, STONE_H + 0.10);
    reach.rotation.set(0, 0, REACH_Z);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      // High and sparse: two trees where the meadow cases keep five, twice the
      // stone. The country does the talking here.
      trees: 2,
      rocks: 20,
      bushes: 4,
      keepout: [
        ...path.keepout(26, 1.25),
        { x: STONE.x, z: STONE.z, r: 1.6 },
        { x: EMYO.x, z: EMYO.z, r: 1.2 },
        // the right-hand end of the camera arc dips inside the tree ring
        // (z < 6, r ~ 8) — nothing gets to stand between the lens and the stone
        { x: 7.5, z: 0.7, r: 3.2 },
        { x: 5.9, z: 3.6, r: 3.0 },
      ],
      // stingy, per the house grammar: only the trodden trail and the stone's
      // own footprint clear the meadow. E-myo stands in the grass.
      grassKeepout: [
        ...path.keepout(30, 0.9),
        { x: STONE.x, z: STONE.z, r: 0.78 },
      ],
      // Thin, pushed-back timber — up here the forests are below us.
      forests: [
        { center: [-22, 0, -27], spread: 11, count: 26 },
        { center: [17, 0, -32], spread: 10, count: 16, color: wash(0.55) },
      ],
      // The ranges close in: the stock two bands plus near shoulders either
      // side of the pass the trail runs out toward (k19's precedent for
      // shaping the ridgeline; bands kept wide so no seam of empty paper
      // opens between them).
      mountains: [
        { count: 9, distance: 50, arcSpan: 3.8, color: wash(0.15) },
        { count: 6, distance: 34, arcSpan: 3.0, color: wash(0.26), hScale: 0.68 },
        { count: 3, distance: 28, arcCenter: -1.15, arcSpan: 1.3, color: wash(0.34), hScale: 0.5 },
        { count: 3, distance: 29, arcCenter: 0.85, arcSpan: 1.5, color: wash(0.31), hScale: 0.55 },
      ],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: take them now ---------------------------------------
    // Tap the treasure and it obliges with everything it has: a degree and a
    // half of lean toward the hand, and then stillness. It never lifts, never
    // slides, and the tenth attempt gets exactly what the first did. The
    // stone counts as the treasure for the tap — at nine units they are one
    // small thing on the page.
    let camera = null;
    let taps = 0;
    let stirNow = 0;
    let clock = 0;           // the house simTime guard — see update()
    const grabMeshes = [stone, ...tapMeshes(bundle.group)];

    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, grabMeshes);
      if (!hit) return;
      taps++;
      bundle.budge(APPROACH + Math.PI);   // it leans toward the pull, and declines
      audio && audio.cloth({ force: 0.9, at: hit.point });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        bundle.update(dt, simTime);
        stirNow = STIR(clock);      // the guarded clock: raw NaN simTime would land in a transform
        reach.rotation.z = REACH_Z + stirNow;
      },
      fragment() {
        return {
          taps,
          budges: bundle.budges(),
          tilt: +bundle.tilt().toFixed(4),
          stir: +stirNow.toFixed(4),
        };
      },
      dispose() {},
    };
  },
};
