import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makeFan,
  makeWater, makeSand, makeFoam,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { groundHeight } from '../kit/ground.js';

const ID = 48;

// THE EASTERN SEA (Frank's pick, scene-pass spec §5: "there is already a
// good spot for it and it mentions sea in the text"). Ummon's half of the
// case strikes the carp of the eastern sea one blow — so the sea is IN the
// koan, and it lies where the scene always had its open side: past the far
// end of the one road. The road tapers out across the sand and ends at the
// water, which is the whole geography of the case in one line — the one
// road of Nirvana runs into the eastern sea. Kit and constants are case
// 20's coast, but the sheet is INK, not red: one accent per koan, and
// k48's belongs to the fan and the stroke.
const SHORE = { dx: 0, dz: -1, dist: 16, width: 4, sea: -0.35, depth: 1.4 };
// keep scatter, grass and trees off the beach and out of the water — case
// 20's three-row idiom, moved out to this coast's waterline
const SEA_KEEP = [
  ...[-24, -16, -8, 0, 8, 16, 24].map((x) => ({ x, z: -18, r: 6 })),
  ...[-24, -12, 0, 12, 24].map((x) => ({ x, z: -28, r: 14 })),
  ...[-18, -6, 6, 18].map((x) => ({ x, z: -42, r: 16 })),
];

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
// leads with: Kembo raises a big red ōgi in place of the stick. ONE fan only
// (Frank, round 2: "we only want one person to have a fan; there's a weird
// fan floating in front of the other figure") — the pupil's small paper copy
// is gone and his hands are simply empty, which is the right state for the
// one who is still asking.

const DRAW = 0.9;
const HOLD = 3.4;
// the stroke's hit box is nested under the stroke group, which carries its
// own hand's-tilt rotation — reused rather than allocated per tap
const scratchPos = new THREE.Vector3();

export default {
  id: ID,
  slug: 'one-road-of-kembo',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'water:0.55' is the surf bed (case 20's), breathing with the swell via
  // setWaterSwell below; the wind goes pine like every coast in the book.
  ambience: ['wind:0.26:pine', 'water:0.55', 'stroke', 'music'],
  mood: 'yo',      // it ends in the open, in daylight, with a line being drawn
  // Lowered a touch when the sea arrived (polar 1.23 -> 1.31, target down):
  // the case is a field scene no longer — the upper frame belongs to the
  // eastern sea dissolving into paper, k20's own low-lens lesson.
  camera: { distance: 11.2, target: [0.8, 1.45, -0.4], azimuth: 0.55, polar: 1.31 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // The one road — and now it has somewhere to go: down the field, across
    // the sand, ending AT the eastern sea. It drapes over the SHORED ground
    // (its own groundFn), or its last stretch would stand on the unshored
    // height and pitch up over the beach dip like a tent.
    const road = makePath({
      from: [7.0, 6.0], to: [-6.0, -16], width: 1.7, seed: ID, groundSeed: 21, wander: 0.45,
      groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
    });
    scene.add(road);

    // KEMBO, raising a great folding fan in the air — "Here it is." He held a
    // walking stick here for a while, but Frank traded it for a big ōgi: an
    // open paper wedge held up in the raised hand, face turned to the reader,
    // red like the stroke it draws. (It also folds the case's two halves into
    // one picture — Ummon's answer to the same question WAS a fan.)
    const KH = 1.68;
    const kembo = makeMonk({ height: KH, pose: 'raise' });
    kembo.position.set(-1.2, 0, -0.6);
    faceMonk(kembo, { x: 4.0, z: 2.6 });
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

    // the pupil, empty-handed — he asked the question; the fan is the answer,
    // and only the one who answers holds it
    const PH = 1.6;
    const pupil = makeMonk({ height: PH });
    pupil.position.set(3.2, 0, 2.4);
    faceMonk(pupil, kembo.position);
    scene.add(pupil);

    // a roadside stone, now just scenery
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 0.34, 7),
      toonMaterial({ color: WASH.stone, flat: true }));
    rock.name = 'rock';
    rock.position.set(-3.3, 0.17, 1.6);
    rock.rotation.y = 0.6;
    scene.add(rock);

    // ---- the eastern sea -------------------------------------------------
    // Case 20's coast, in this case's own dress: an ink sea, transparent in
    // the shallows so the sand shows through, deepening seaward, the far
    // fade owned by the fog. Three crossing swells break the crests up.
    const water = makeWater({
      // wash(0.68) — genuinely DARK ink (higher wash = darker; k39's pond
      // sits at 0.72). Two lighter tries read as mudflat: at this grazing
      // angle the fog eats a pale sheet whole (case 20 recorded the same
      // failure). Dark ink under white glints says water.
      shape: 'square', size: 150, color: wash(0.68), seed: ID,
      opacity: 1, segments: 64,
      // A tighter ramp than case 20's: red survives 20% visibility through
      // the fog, grey doesn't — so the ink must arrive within the narrow
      // strip the grazing camera actually sees. Full depth by ~5 out.
      alphaRamp: (x, z) => {
        const s = 43 - z;                             // seaward distance past the waterline
        const t = Math.max(0, Math.min(1, s / 5));
        return 0.3 + 0.62 * t * t * (3 - 2 * t);
      },
      drift: [
        { dx: 0, dz: 1, amp: 0.045, wavelength: 8, period: 6 },
        { dx: 0.2764, dz: 0.9611, amp: 0.022, wavelength: 5.2, period: 4.6 },
        { dx: -0.3429, dz: 0.9394, amp: 0.017, wavelength: 3.4, period: 3.5 },
      ],
    });
    water.group.position.set(0, SHORE.sea, -(SHORE.dist + 43));
    scene.add(water.group);

    // wet sand a step darker than the earth, so the foam has contrast
    const sand = makeSand({ shore: SHORE, seed: ID, groundSeed: 21, color: wash(0.30) });
    scene.add(sand);

    // the wave-ends, riding the sheet's own surface (the koi idiom)
    const foam = makeFoam({
      shore: SHORE, seed: ID, groundSeed: 21,
      surfaceAt: (x, z, t) => SHORE.sea + water.heightAt(x, z + (SHORE.dist + 43), t),
    });
    foam.mesh.renderOrder = 1;
    scene.add(foam.mesh);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      shore: SHORE,
      // grass must plant on the TRUE shored surface, or tufts near the
      // feathered keepout edge stand on the unshored height (case 20's find)
      groundFn: (x, z) => groundHeight(x, z, { seed: 21, shore: SHORE }),
      trees: 4,
      // the land at the reader's back and sides — nothing stands in the sea
      mountains: [
        { count: 7, distance: 52, arcCenter: Math.PI, arcSpan: 3.6, color: wash(0.16) },
        { count: 4, distance: 34, arcCenter: -2.1, arcSpan: 1.3, color: wash(0.28), hScale: 0.65 },
      ],
      forests: [
        { center: [-20, 0, 2], spread: 10, count: 40 },
        { center: [17, 0, 6], spread: 9, count: 30, color: wash(0.55) },
      ],
      keepout: [
        ...road.keepout(26, 1.4),
        { at: kembo, r: 1.3 },
        { at: pupil, r: 1.2 },
        { at: rock, r: 1.0 },
        ...SEA_KEEP,
      ],
      grassKeepout: [
        ...road.keepout(28, 1.0),
        ...SEA_KEEP,
      ],
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
      audio && audio.chimeStrike({ tube: 2, force: 0.55, at: hit.getWorldPosition(scratchPos) });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);
        foam.update(dt, simTime);
        // the surf breathes with the sea it belongs to (case 20's idiom):
        // read the true surface at the waterline and hand the bed 0..1
        if (audio && audio.setWaterSwell) {
          const h = water.heightAt(0, 43, clock);   // the guarded clock, never raw simTime
          audio.setWaterSwell(Math.max(0, Math.min(1, 0.5 + h / 0.17)));
        }

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
