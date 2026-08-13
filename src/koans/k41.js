import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK_LIT, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makeCave, makeSnow, makePine, makeMonk, faceMonk,
  makeLights, washMaterial, plantRock,
} from '../kit/index.js';

const ID = 41;

// SENSITIVE CASE. The source text has Eka standing in the snow presenting his
// severed arm; the style guide handles all four of these through ink metaphor
// and never through literal harm, so nothing is severed and nobody is
// wounded here. What the scene shows of that night is one thing: a single
// vermillion seal pressed into the snow between the two of them. Whoever knows
// the story will know what it stands for. Whoever does not will see a red mark
// on a white ground, which is what an ink painter would have given them
// anyway.
//
// The rest is the exchange itself. "When I search my mind I cannot hold it."
// So: reach into the snow anywhere and something gathers under your hand —
// and it is gone before you can close on it. Every time. There is nothing to
// find, and the finding of nothing is the whole answer Bodhidharma gives.

const WISP = 1.5;

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.6, target: [0.3, 2.1, -3.15], heading: 39.5, pitch: 24 };
  export default {
  id: ID,
  slug: 'bodhidharma-pacifies-the-mind',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.34:pine', 'snow', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  // snow light: the air is thick and the world ends close
  scene.fog = new THREE.FogExp2(PAPER, 0.045);
  scene.add(makeLights());
  
  // the cave he sat in, facing its wall for nine years
  const cave = makeCave({ width: 3.0, height: 2.8, depth: 3.2, seed: ID });
  cave.position.set(-0.4, 0, -5.2);
  cave.rotation.y = 0.18;
  scene.add(cave);
  
  // BODHIDHARMA, turned to the wall — his back to the whole case.
  //
  // He used to sit at z -5.6, which is BEHIND the cave's throat: makeCave
  // fills the opening with an unlit pure-INK box (the honest way to paint an
  // absence of light — see cave.js), so an ink monk placed inside it was
  // ink-on-ink and simply gone. Frank: "we're supposed to be able to see
  // Buddha inside the cave, but we can't see anything — it's just a
  // completely solid thing." Two fixes, both needed: sit him ON the
  // threshold apron, just forward of the throat's face, so the black is
  // BEHIND him rather than around him; and lift his tone off ink so his
  // back reads as a shape against it. He is still inside the mouth, still
  // facing the wall, still the smallest thing in the frame.
  //
  // That lift used to be an EXPLICIT one — WASH.mid, a mid grey — and it made
  // him the one visibly pale person in the book (Frank: "the Buddha is not the
  // right colour, he's like a lighter grey"). It is unnecessary now: every
  // figure sits a step off ink, and the cave's throat is still an unlit box at
  // INK itself, so his lit bands stand at 46 and 73 against its flat 30. Only
  // his shadow side merges into the black behind him, which is what an ink
  // painting of a man in a cave mouth should do.
  // makeCave's throat is a SOLID box (an absence of light has to be opaque),
  // so he cannot be IN it — he sits in the room the mouth opens onto,
  // between the brow overhead and the black behind. That room only exists
  // because the cave is deeper now and its dark set further back: at 0.35
  // he is well under the brow and genuinely inside, rather than perched on
  // the lip (Frank: "he'd be further into the cave... it feels like there's
  // just a wall there, there's not any kind of depth to the cave").
  const CAVE = { x: -0.4, z: -5.2, yaw: 0.18 };
  const IN = 0.5;                       // along the cave's own axis, from its origin
  const bodhidharma = makeMonk({ height: 1.56, pose: 'sit', hat: false });
  bodhidharma.position.set(
  CAVE.x + Math.sin(CAVE.yaw) * IN,
  0.30,                                // the apron's top face
  CAVE.z + Math.cos(CAVE.yaw) * IN);
  faceMonk(bodhidharma, { x: -0.8, z: -8.0 });
  scene.add(bodhidharma);
  
  // EKA, outside in the snow — and MISSING ONE ARM. The text is what it is;
  // the diorama shows it the gentlest way it can (Frank's staging): one
  // sleeve simply gone from his side, and the arm itself lying in the snow a
  // little way off, with a small red mark where it left him. No wound on the
  // body, no gore — an absence and one seal, which is all the case needs.
  const eka = makeMonk({ height: 1.62 });
  eka.position.set(.6, 0, -2.3);
  faceMonk(eka, cave.position);
  // remove the arm on the side toward the cave (the hand he offered)
  const ekaArms = eka.children.filter((c) => c.name === 'arm');
  const goneArm = ekaArms.sort((a, b) => a.position.x - b.position.x)[0];  // his left
  if (goneArm) eka.remove(goneArm);
  scene.add(eka);
  
  // THE ARM, laid in the snow between Eka and the cave: a plain dark sleeve
  // lying on the ground, the cut end toward the seal.
  const arm = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8),
  // his own sleeve, so his own ink — at INK it was a darker object than the
  // man it came off
  washMaterial({ color: INK_LIT, flat: true }));
  arm.name = 'severed-arm';
  arm.rotation.z = Math.PI / 2;                 // lying flat
  arm.rotation.y = 0.6;
  arm.position.set(0.95, 0.07, -3.05);
  scene.add(arm);
  
  // THE BLOOD — the one bit of colour, right where the arm lies (Frank: it
  // was off to the side; it should be at the arm). Not much of it: one larger
  // pool at the cut end and a couple of small drops nearby, flat on the snow.
  // Read it as blood if you know the story, or as the painter's seal in white
  // if you don't.
  const bloodMat = washMaterial({ color: ACCENT, flat: true });
  const blood = new THREE.Group();
  blood.name = 'blood';
  const drop = (x, z, r, name) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 5), bloodMat);
  m.name = name;
  m.rotation.y = hash1(Math.round(x * 97 + z * 13), ID) * Math.PI;
  m.position.set(x, 0.011, z);
  blood.add(m);
};
    drop(0.86, -3.02, 0.115, 'seal');     // the larger pool, at the arm's cut end
    drop(1.06, -2.86, 0.05, 'drop');
    drop(0.70, -3.18, 0.055, 'drop');
    drop(0.96, -3.24, 0.038, 'drop');
    scene.add(blood);

    // The pine. It used to stand at (3.6, -3.4) in wash(0.55) — hard against
    // the right frame edge, stone-pale, cropped to a stack of faceted pads
    // that read as boulders piled beside the cave, with its lowest bough
    // hovering over the snow like a floating mound (Frank flagged both). Moved
    // to the open snow on the LEFT, where the whole silhouette fits the frame,
    // and dropped to the book's standard pine ink (WASH.dark) so it separates
    // from the rock instead of matching it. A tree again.
    const PINE = { x: -4.2, z: -3.2 };
    const pine = makePine({ height: 4.2, seed: ID, color: WASH.dark });
    pine.position.set(PINE.x, 0, PINE.z);
    scene.add(pine);

    // stone shoulders in the open snow, balancing the pine across the frame —
    // pale ground, dark rock, and the snowfall passing in front of both
    const b1 = plantRock(scene, { x: 3.9, z: -3.4, size: 1.8 });
    const b2 = plantRock(scene, { x: 2.8, z: -1.1, size: 1.0 });

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID,
      groundSeed: 21,
      // the earth has gone pale — this is the one scene in the book under snow
      groundColor: wash(0.06),
      trees: 3,
      treeRing: [9, 18],
      rocks: 7,
      bushes: 2,
      keepout: [
        { at: cave, r: 3.0 },
        { x: 1.5, z: -1.9, r: 1.2 },
        { x: PINE.x, z: PINE.z, r: 1.6 },
        { at: b1, r: 2.3 },
        { at: b2, r: 1.4 },
      ],
      // snow covers everything: no grass anywhere near the clearing
      grassKeepout: [{ x: 0.4, z: -3.0, r: 13 }],
    });

    // THE SNOW, falling. Paper-coloured, so it is nearly invisible against the
    // sky and unmistakable against the cave mouth and the figures.
    const snow = makeSnow({ count: 300, seed: ID, width: 30, depth: 30, height: 15 });
    snow.points.position.set(0.4, 0, -2.4);
    scene.add(snow.points);

    // ---- the moment: bring me your mind ----------------------------------
    // Anywhere on the ground. Something gathers, and cannot be held.
    const groundHit = new THREE.Mesh(
      new THREE.BoxGeometry(22, 0.2, 22),
      new THREE.MeshBasicMaterial({ visible: false }));
    groundHit.name = 'snow-hit';
    groundHit.position.set(0.4, 0.02, -2.0);
    scene.add(groundHit);

    const wispMat = washMaterial({ color: WASH.deep, flat: true });
    wispMat.transparent = true;
    wispMat.opacity = 0;
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), wispMat);
    wisp.name = 'wisp';
    wisp.visible = false;
    scene.add(wisp);

    let camera = null;
    let clock = 0;
    let grasps = 0;
    let graspAt = -99;

    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [groundHit]);
      if (!hit) return;
      if (clock - graspAt < WISP * 0.6) return;
      wisp.position.set(hit.point.x, 0.30, hit.point.z);
      graspAt = clock;
      grasps++;
      // barely a sound: what you reached for was never loud enough to have one
      audio && audio.chimeStrike({ tube: 4, force: 0.22, at: hit.point });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        snow.update(dt, simTime);

        const u = clamp01((clock - graspAt) / WISP);
        const a = (graspAt < -90 || u >= 1) ? 0 : Math.min(1, u / 0.22, (1 - u) / 0.55);
        const e = a * a * (3 - 2 * a);
        wispMat.opacity = 0.34 * e;
        wisp.visible = e > 0.01;
        // it rises and spreads as it goes, the way breath does in cold air
        wisp.scale.setScalar(0.55 + u * 0.9);
        wisp.position.y = 0.30 + u * 0.5;
      },
      fragment() {
        return {
          grasps,
          held: +wispMat.opacity.toFixed(3),
          // and it is always zero by the time it matters
          flakes: snow.count(),
        };
      },
      dispose() { snow.dispose(); },
    };
  },
};
