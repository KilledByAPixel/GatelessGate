import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, aimMonk, makeFan,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 48;

// The last case. A pupil asks where the one road of Nirvana begins, and Kembo
// raises his walking stick, draws the figure ONE in the air, and says: "Here
// it is."
//
// An open field, the road running out of it in both directions, and the stroke
// still hanging where he drew it — the only mark of its kind in the book,
// because it is the only time anyone in the Mumonkan actually makes a picture
// instead of talking about one. Touch it and he draws it again, left to right,
// at the speed a brush moves. It never stays drawn for long, which is right:
// the verse says that before the first step is taken the goal is reached, and
// a line that stayed up would turn into a signpost.
//
// Ummon's fan is the other half of the case — and the fan is what this staging
// leads with: both figures hold one (the pupil a small paper fan, Kembo a big
// red ōgi raised in place of the stick), so the last object in the collection
// is in every hand that answers.

const DRAW = 0.9;
const HOLD = 3.4;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'one-road-of-kembo',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.26', 'stroke', 'music'],
  mood: 'yo',      // it ends in the open, in daylight, with a line being drawn
  camera: { distance: 10.6, target: [0.8, 1.7, -0.4], azimuth: 0.55, polar: 1.23 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // the one road, going both ways out of the picture
    const road = makePath({ from: [7.0, 6.0], to: [-6.0, -16], width: 1.7, seed: ID, groundSeed: 21, wander: 0.45 });
    scene.add(road);

    // KEMBO, raising a great folding fan in the air — "Here it is." He held a
    // walking stick here for a while, but Frank traded it for a big ōgi: an
    // open paper wedge held up in the raised hand, face turned to the reader,
    // red like the stroke it draws. (It also folds the case's two halves into
    // one picture — Ummon's answer to the same question WAS a fan.)
    const KH = 1.68;
    const kembo = makeMonk({ height: KH, pose: 'raise' });
    kembo.position.set(-1.2, 0, -0.6);
    aimMonk(kembo, { x: 4.0, z: 2.6 });
    const raisedArm = kembo.children
      .filter((c) => c.name === 'arm')
      .sort((a, b) => b.position.x - a.position.x)[0];
    if (raisedArm) {
      const SLEEVE_L = 0.34 * KH;
      const bigFan = makeFan({
        radius: 0.42 * KH, angle: Math.PI * 0.78, handleLen: 0.13 * KH,
        color: ACCENT, seed: ID,
      });
      // grip sunk into the cuff, the wedge continuing the raised sleeve's line
      bigFan.position.y = -SLEEVE_L + 0.03 * KH;
      bigFan.rotation.z = Math.PI;      // opening out along the sleeve, not back down it
      bigFan.rotation.y = -0.65;        // spun on the sleeve's axis to show its face
      raisedArm.add(bigFan);
    }
    scene.add(kembo);

    // THE STROKE — the figure one, hanging in the air off the stick. A flat
    // slab, unoutlined, so it reads as a brush mark rather than as an object;
    // it is drawn by scaling from its left end, which is where a brush starts.
    const stroke = new THREE.Group();
    stroke.name = 'stroke';
    const STROKE_L = 1.35;
    const barGeo = new THREE.BoxGeometry(STROKE_L, 0.105, 0.035);
    barGeo.translate(STROKE_L / 2, 0, 0);        // grows from its left end
    const bar = new THREE.Mesh(barGeo, toonMaterial({ color: ACCENT, flat: true }));
    bar.name = 'stroke-bar';
    bar.userData.noOutline = true;
    stroke.add(bar);
    stroke.position.set(0.15, 1.95, -0.2);
    stroke.rotation.z = 0.04;                     // a hand's tilt, not a ruler's
    scene.add(stroke);

    // the other figure — Ummon, who answered the same question with a fan.
    // He HOLDS the fan up in his hand (Frank: an old-fashioned folding fan in
    // the other guy's hand), an open paper arc on a short handle.
    const PH = 1.6;
    const pupil = makeMonk({ height: PH });
    pupil.position.set(3.2, 0, 2.4);
    aimMonk(pupil, kembo.position);

    // same kit piece as Kembo's, at a hand-fan size and in paper tones — the
    // teacher's copy is the big red one, which is how the case reads on sight
    const fan = makeFan({ radius: 0.34, angle: Math.PI * 0.7, handleLen: 0.18, seed: ID + 1 });
    // set it in his raised-ish right hand, out in front of the chest
    fan.position.set(0.2 * PH, 0.58 * PH, 0.16 * PH);
    fan.rotation.z = -0.5;
    fan.rotation.y = 0.9;             // turned so the leaf shows its face, not its edge
    pupil.add(fan);
    scene.add(pupil);

    // a roadside stone, now just scenery
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 0.34, 7),
      toonMaterial({ color: WASH.stone, flat: true }));
    rock.name = 'rock';
    rock.position.set(-3.3, 0.17, 1.6);
    rock.rotation.y = 0.6;
    scene.add(rock);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...road.keepout(26, 1.4),
        { x: -1.2, z: -0.6, r: 1.3 },
        { x: 3.2, z: 2.4, r: 1.2 },
        { x: -3.3, z: 1.6, r: 1.0 },
      ],
      grassKeepout: road.keepout(28, 1.0),
    });

    for (const [p, rx, rz, op] of [
      [kembo.position, 0.7, 0.54, 0.42],
      [pupil.position, 0.62, 0.5, 0.40],
      [rock.position, 0.55, 0.44, 0.32],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(STROKE_L * 1.2, 0.6, 0.5),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'stroke-hit';
    hit.userData.noOutline = true;
    hit.position.set(STROKE_L / 2, 0, 0);
    stroke.add(hit);

    // ---- the moment: here it is ------------------------------------------
    let camera = null;
    let clock = 0;
    let drawnAt = 0;          // it is already drawn when you arrive
    let draws = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (clock - drawnAt < DRAW) return;
      drawnAt = clock;
      draws++;
      audio && audio.chimeStrike({ tube: 2, force: 0.55 });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);

        const t = clock - drawnAt;
        // the brush crosses, the mark stands a while, and the air takes it back
        const on = clamp01(t / DRAW);
        const off = clamp01((t - DRAW - HOLD) / 1.6);
        bar.scale.x = Math.max(0.0001, on * on * (3 - 2 * on));
        bar.visible = off < 0.999;
        if (bar.material) {
          bar.material.transparent = off > 0;
          bar.material.opacity = 1 - off;
        }
      },
      fragment() {
        return {
          draws,
          length: +bar.scale.x.toFixed(3),
          showing: bar.visible,
        };
      },
      dispose() {},
    };
  },
};
