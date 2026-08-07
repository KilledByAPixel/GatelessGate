import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_LIGHT, wash } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makePath } from '../kit/path.js';
import { makeMonk, faceMonk } from '../kit/monk.js';
import { makeDog } from '../kit/dog.js';
import { makeMoon } from '../kit/moon.js';
import { makeWildflowers } from '../kit/wildflowers.js';
import { makeLights } from '../render/toon.js';
import { addOutlines } from '../render/outlines.js';

const ID = 19;
const BASE_WIND = 0.20;
const GLOW_DUR = 5.2;     // seconds for the whole shift of light
const BREEZE_TAU = 1.7;   // how long a crossing breath stays in the sound

// Every other case in this book has a thing at its centre — a dog, a flower, a
// bowl, a flag, a buffalo — and the red seal goes on that thing. Case 19 has
// nothing. It is two monks on a road talking about roads, and there is no object
// to make red.
//
// So this diorama illustrates the VERSE instead of the exchange:
//
//     In spring, hundreds of flowers; in autumn, a harvest moon;
//     In summer, a refreshing breeze; in winter, snow will accompany you.
//
// which gives the case two seals rather than one, and both of them are weather:
// the wildflowers along the verge (ACCENT — each bloom is a few pixels) and the
// moon over the hills (ACCENT_LIGHT — see the note at the moon itself). The
// meadow itself stays on the grey wash, as always.
//
// The blooms went out for a while and butterflies took the line instead; they
// are back and the butterflies have gone to case 12 (Frank, round 12). Spring
// is the FIRST line of the verse and autumn the second, so having them in the
// same picture is the point — flowers on the ground, the moon over the ridge.
export default {
  id: ID,
  slug: 'everyday-life-is-the-path',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.20', 'music'],
  mood: 'yo',      // chores in the sun; ordinary mind is the way

  // Wider, and lower, than the standard diorama shot. This is a landscape, not
  // a tableau: the road has to have room to run away into the hills, and the
  // camera has to sit near enough to horizontal that there is sky above the
  // ridge for the moon to stand in. polar 1.42 puts the horizon at roughly
  // three-fifths of the frame height, leaving a band of paper along the top.
  // The target sits off to the right of the two figures on purpose. Everything
  // near shifts left in frame with it while the moon, seventy units out, barely
  // moves at all — so the walkers end up low and left and the moon high and
  // right, instead of the two of them stacked up the centre line.
  camera: { distance: 14.6, target: [1.5, 1.75, -1.3], azimuth: 0.42, polar: 1.42 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // The road. It enters at the bottom right of frame and leaves on a diagonal
    // toward the far left, so it reads as going somewhere rather than pointing
    // at the lens — and so the moon can sit off its vanishing point instead of
    // being skewered by it.
    const path = makePath({
      from: [4.2, 8.5], to: [-12.8, -27.7],
      width: 1.5, seed: 19, groundSeed: 21, wander: 1.15,
    });
    scene.add(path);

    // Two men walking, mid-sentence. Nansen leads with his staff, still facing
    // up the road — he is answering without stopping, which is the whole of what
    // he says. Joshu is half a step behind and turned toward him.
    const np = path.sample(0.235);
    const jp = path.sample(0.205);
    const nansen = makeMonk({ height: 1.68, elder: true });
    nansen.position.set(np.x + np.perp.x * 0.40, 0, np.z + np.perp.z * 0.40);
    const upRoad = path.sample(0.42);
    faceMonk(nansen, { x: upRoad.x, z: upRoad.z });

    const joshu = makeMonk({ height: 1.56 });
    joshu.position.set(jp.x - jp.perp.x * 0.46, 0, jp.z - jp.perp.z * 0.46);
    faceMonk(joshu, nansen.position);
    scene.add(nansen, joshu);

    // An ordinary dog, trotting a few steps behind the two of them — k1's
    // koan animal on its day off. In its home case it carries the accent
    // and the whole question; here it is INK, unremarkable, walking the
    // same road everyone walks. That is the case: ordinary mind is the way.
    const dog = makeDog({ height: 0.5, seed: 19 });
    const dp = path.sample(0.155);
    dog.position.set(dp.x + dp.perp.x * 0.18, 0, dp.z + dp.perp.z * 0.18);
    faceMonk(dog, joshu.position);
    scene.add(dog);

    // The harvest moon: beyond the mountains and low, just clear of the ridge.
    // Its bearing sits a few degrees right of where the road runs out, so the
    // eye travels up the road and arrives at it.
    // 60 out rather than 70: the camera's far plane is 100, and the debug lens
    // slider pulls the rig back as far as ~36 units when it is wound all the way
    // to a long lens. Any further and the disc starts clipping at that setting.
    const MOON_BEARING = -0.28;
    // ACCENT_LIGHT, and it took two goes to get here. ACCENT_DEEP read as a hole
    // punched in the sky; full ACCENT was still a dark brick disc. The moon is
    // the one thing in the book that EMITS, and an unlit flat fill has no
    // highlights to carry it — so it needs a tone lifted toward the paper rather
    // than the large-mass rule that governs everything reflective. Sunk toward
    // the ridgeline too: a harvest moon is low.
    const moon = makeMoon({ radius: 2.7, color: ACCENT_LIGHT, distance: 60, height: 6.4, azimuth: MOON_BEARING });
    scene.add(moon);

    // Wildflower drifts along the verge, plus a few out in the meadow so the
    // blooms are not one tidy corridor either side of the track. `color` puts
    // the accent on the HEADS only — the kit gives every stem the meadow's own
    // dry wash, which is what stops a red drift reading as red grass.
    const verge = [];
    for (let i = 0; i <= 15; i++) {
      const p = path.sample(0.04 + (i / 15) * 0.46);
      verge.push({ x: p.x, z: p.z });
    }
    verge.push({ x: -5.6, z: 2.4 }, { x: 6.0, z: -3.4 }, { x: -2.4, z: -7.6 }, { x: 7.2, z: 3.2 });

    const flowers = makeWildflowers({
      count: 130, radius: 19, seed: 19, groundSeed: 21, color: ACCENT,
      along: verge, spread: 2.3,
      // the only thing blooms are kept out of is the worn track itself and the
      // two pairs of feet — they grow right up to both. The circle chain has to
      // be dense enough to actually OVERLAP along a 40-unit road: at r = 0.8 the
      // spacing must stay under 1.6, or blooms sprout through the gaps between
      // the circles and stand in the middle of the track.
      keepout: [
        ...path.keepout(40, 0.80),
        { x: nansen.position.x, z: nansen.position.z, r: 0.42 },
        { x: joshu.position.x, z: joshu.position.z, r: 0.42 },
        { x: dog.position.x, z: dog.position.z, r: 0.38 },
      ],
    });
    scene.add(flowers.mesh);

    const world = composeWorld(scene, {
      seed: 19,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...path.keepout(26, 1.5),                                       // the whole run of the road
        { x: nansen.position.x, z: nansen.position.z, r: 1.7 },
        { x: joshu.position.x, z: joshu.position.z, r: 1.7 },
      ],
      // stingy, on purpose: only the trodden track clears the grass. The monks
      // walk in it and the grass grows right up to its rim.
      grassKeepout: path.keepout(30, 0.95),

      // THE RIDGELINE IS SHAPED AROUND THE MOON, and it has to be.
      //
      // The stock bands are cones up to 22 tall and 35 wide sitting 30-50 out.
      // Fog washes them almost to paper, so they read as ghosts — but a ghost
      // still writes depth, and with the default arc there is no gap anywhere in
      // the -z hemisphere wide enough for the disc to stand in. The moon simply
      // vanished behind an invisible pale slope.
      //
      // So: a LOW far ridge across the middle, where the road runs out and the
      // moon stands, and the tall country pushed to either side where it frames
      // the shot instead of filling it. Hills, in the evening haze, which is
      // what the verse asks for anyway.
      mountains: [
        { count: 7, distance: 58, arcCenter: MOON_BEARING, arcSpan: 1.5, color: wash(0.13), hScale: 0.30 },
        { count: 5, distance: 47, arcCenter: -1.55, arcSpan: 1.5, color: wash(0.17), hScale: 0.80 },
        { count: 4, distance: 45, arcCenter: 0.95, arcSpan: 1.5, color: wash(0.20), hScale: 0.75 },
      ],
      // AND SO IS THE FOG LINE. The stands used to sit at a flat y and duck
      // under the sightline by accident; once forests started standing on
      // the real terrain (the sunk-trees fix), the left stand's trees rode
      // an upslope into the moon at the left end of the drag — this case's
      // own occlusion net caught it. The left stand steps back and away
      // from the corridor; the right one was never near it.
      forests: [
        { center: [-26, 0, -24], spread: 10, count: 55 },
        { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
      ],
    });

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the weather ------------------------------------------
    // Touch the meadow and a breath crosses it — in the sound, and in the
    // blooms, which lean away from where you touched and come back. Touch the
    // moon and the light shifts, and the same breath crosses from up there.
    //
    // Neither is a puzzle and neither is a goal. It is an evening walk; the only
    // thing to find is that the place answers when you touch it.
    let camera = null;
    let glowPhase = -1;
    let breeze = 0;
    let touches = 0;
    const ground = scene.getObjectByName('ground');
    const meadow = ground ? [flowers.mesh, ground] : [flowers.mesh];

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, [moon])) {
        if (glowPhase < 0) glowPhase = 0;
        flowers.gustAt(moon.position.x * 0.10, moon.position.z * 0.10, 0.30);
        breeze = 1;
        touches++;
        return;
      }
      const hit = input.raycastFirst(camera, meadow);
      if (hit) {
        flowers.gustAt(hit.point.x, hit.point.z, 0.44);
        breeze = 1;
        touches++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);           // drives the meadow's wind
        flowers.update(dt, simTime);

        if (glowPhase >= 0) {
          glowPhase += dt;
          const t = glowPhase / GLOW_DUR;
          if (t >= 1) { glowPhase = -1; moon.setGlow(0); }
          else {
            const e = t < 0.24 ? t / 0.24 : 1 - (t - 0.24) / 0.76;
            moon.setGlow(e * e * (3 - 2 * e));
          }
        }

        // snap to rest rather than decaying asymptotically forever, so the wind
        // level settles on an exact value instead of creeping
        breeze *= Math.exp(-dt / BREEZE_TAU);
        if (breeze < 1e-3) breeze = 0;
        audio && audio.setWindLevel(BASE_WIND * (1 + 0.8 * breeze));
      },
      fragment() {
        return {
          glow: +moon.glow().toFixed(4),
          lean: +flowers.lean().toFixed(4),
          gusts: flowers.gustCount(),
          blooms: flowers.blooms,
          breeze: +breeze.toFixed(4),
          touches,
        };
      },
      dispose() {},
    };
  },
};
