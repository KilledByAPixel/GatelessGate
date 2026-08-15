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

const WISP = 2.6;         // seconds from the grasp to gone
// How far it climbs in that time. Measured against this case's own lens rather
// than guessed: the camera sits 10.6 out at pitch 24 looking at y 2.1, and a
// point on the ground under it leaves the top of a 16:9 frame somewhere around
// y = 7. Eight puts it clear with room for a narrow reading pane, which is
// taller in world terms and therefore harder to escape, not easier.
const RISE = 8.0;
// The three notes a grasp can make. The top of the chime — small tubes, high
// and short — because the whole point is that what you caught was too slight to
// have a sound of its own. Neighbours rather than a spread: this is one thing
// happening again, not three different things.
const WISP_TUBES = [4, 3, 2];

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.6, target: [1, 1.8, -3.15], heading: 39.5, pitch: 10.5 };
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
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  // snow light: the air is thick and the world ends close
  scene.fog = new THREE.FogExp2(PAPER, 0.045);
  // A winter sun: low, and behind the snow rather than on it, so the
  // ground carries the light and the figures are dark against it.
  scene.add(makeLights({ sun: { heading: 89, pitch: 32 } }));
  
  // the cave he sat in, facing its wall for nine years
  const cave = makeCave({ width: 3.0, height: 2.8, depth: 3.2, seed: ID });
  cave.position.set(-0.4, 0, -5.2);
  cave.rotation.y = 0.18;
  scene.add(cave);
  
  // BODHIDHARMA, turned to the wall — his back to the whole case.
  //
  // He used to sit at z -5.6, which is BEHIND the cave's throat: makeCave fills
  // the opening with an unlit pure-INK box (the honest way to paint an absence
  // of light — see cave.js), so an ink monk placed inside it was ink-on-ink and
  // simply gone — the cave read as a completely solid thing with nobody in it.
  // Two fixes, both needed: sit him ON the threshold apron, just forward of the
  // throat's face, so the black is BEHIND him rather than around him; and lift
  // his tone off ink so his back reads as a shape against it. He is still
  // inside the mouth, still facing the wall, still the smallest thing in the
  // frame.
  //
  // That lift used to be an EXPLICIT one — WASH.mid, a mid grey — and it made
  // him the one visibly pale person in the book. It is unnecessary now: every
  // figure sits a step off ink, and the cave's throat is still an unlit box at
  // INK itself, so his lit bands stand at 46 and 73 against its flat 30. Only
  // his shadow side merges into the black behind him, which is what an ink
  // painting of a man in a cave mouth should do. makeCave's throat is a SOLID
  // box (an absence of light has to be opaque), so he cannot be IN it — he sits
  // in the room the mouth opens onto, between the brow overhead and the black
  // behind. That room only exists because the cave is deeper now and its dark
  // set further back: at 0.35 he is well under the brow and genuinely inside,
  // rather than perched on the lip, with the cave reading as a wall rather than
  // as depth.
  const CAVE = { x: -0.4, z: -5.2, yaw: 0.18 };
  const IN = 0.5;                       // along the cave's own axis, from its origin
  const bodhidharma = makeMonk({ height: 1.56, pose: 'sit', hat: false });
  bodhidharma.position.set(
  CAVE.x + Math.sin(CAVE.yaw) * IN,
  0.30,                                // the apron's top face
  CAVE.z + Math.cos(CAVE.yaw) * IN);
  faceMonk(bodhidharma, { x: -0.8, z: -8.0 });
  scene.add(bodhidharma);
  
  // EKA, outside in the snow — and MISSING ONE ARM. The text is what it is; the
  // diorama shows it the gentlest way it can: one sleeve simply gone from his
  // side, and the arm itself lying in the snow a little way off, with a small
  // red mark where it left him. No wound on the body, no gore — an absence and
  // one seal, which is all the case needs.
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
  
  // THE BLOOD — the one bit of colour, right where the arm lies rather than off
  // to the side. Not much of it: one larger pool at the cut end and a couple of
  // small drops nearby, flat on the snow. Read it as blood if you know the
  // story, or as the painter's seal in white if you don't.
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
    // the right frame edge, stone-pale, cropped to a stack of faceted pads that
    // read as boulders piled beside the cave, with its lowest bough hovering
    // over the snow like a floating mound. Moved to the open snow on the LEFT,
    // where the whole silhouette fits the frame, and dropped to the book's
    // standard pine ink (WASH.dark) so it separates from the rock instead of
    // matching it. A tree again.
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
      trees: 9,
      treeKind: 'pine',
      treeRing: [9, 18],
      rocks: 7,
      bushes: 5,
      grass:0, // no grass
      keepout: [
        { at: cave, r: 3.0 },
      ],
      // snow covers everything: no grass anywhere near the clearing
      //grassKeepout: [{ x: 0.4, z: -3.0, r: 20 }],
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

    // A POOL OF THEM, not one. The case used to refuse a second touch until the
    // first wisp had most of its life behind it — which on a page whose whole
    // answer is "reach again, there is still nothing there" is the one refusal
    // it should not be making — several can be in the air at once rather than a
    // second tap doing nothing. Six is past what anybody taps in one wisp's
    // life; the oldest is reused after that, which is the water kit's
    // ripple-pool idiom and cannot run out.
    //
    // Each carries its OWN material, because each is at its own point in its
    // own fade — one shared material would put every wisp on the newest one's
    // opacity. Six extra draws on a page that has room for them.
    const WISPS = 6;
    const wisps = [];
    for (let i = 0; i < WISPS; i++) {
      const m = washMaterial({ color: WASH.deep, flat: true });
      m.transparent = true;
      m.opacity = 0;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.30, 10, 8), m);
      mesh.name = 'wisp';
      mesh.visible = false;
      scene.add(mesh);
      wisps.push({ mesh, mat: m, at: -99 });
    }

    let camera = null;
    let clock = 0;
    let grasps = 0;
    let next = 0;

    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [groundHit]);
      if (!hit) return;
      touched && touched();
      // one per touch, and no cooldown at all: the only guard left is the pool
      // rotation, and reaching six times inside one wisp's life is a reader
      // hammering the page rather than reading it — they get the oldest back.
      const w = wisps[next];
      next = (next + 1) % WISPS;
      w.mesh.position.set(hit.point.x, 0.30, hit.point.z);
      w.at = clock;
      grasps++;
      // BARELY A SOUND, and not the same one twice — what you reached for was
      // never loud enough to have a voice of its own, so what you get is one of
      // three small notes off the top of the chime rather than the same tube
      // every time — a choice between a few near notes. With several wisps in
      // the air at once the single repeated note read as a UI click; three
      // near-neighbours read as the same small thing happening again.
      //
      // Seeded from the count, like everything else in this book that varies:
      // no Math.random outside src/audio, so the same page grasped the same
      // number of times sounds the same.
      const tube = WISP_TUBES[Math.floor(hash1(grasps * 5 + 3, ID) * WISP_TUBES.length) % WISP_TUBES.length];
      audio && audio.chimeStrike({ tube, force: 0.22, at: hit.point });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        snow.update(dt, simTime);

        // IT LEAVES. The wisp used to lift half a unit and spread as it faded,
        // the way breath does in cold air — which is a lovely thing to watch
        // and read as a small cloud hanging where you put it. What this wants
        // is the GOING itself: up into the air, shrinking away off the top of
        // the screen. Which is also nearer the case — you were asked to bring
        // your mind and hand it over, and what you reached for went up out of
        // the picture instead of dispersing politely at chest height.
        //
        // Three curves, and the ORDER of them is the whole effect: it goes UP
        // fast and keeps going (RISE takes it clear of the frame), it SHRINKS
        // the whole way, and it only fades at the very end — so what you follow
        // is a thing leaving, not a thing dissolving. Fading it early would put
        // the vanishing back at chest height, which is what this replaced.
        // each on its own clock, which is the whole of what the pool buys
        for (const w of wisps) {
          const u = clamp01((clock - w.at) / WISP);
          const gone = w.at < -90 || u >= 1;
          const held = gone ? 0 : Math.min(1, u / 0.22, (1 - u) / 0.18);
          const e = held * held * (3 - 2 * held);
          w.mat.opacity = 0.34 * e;
          w.mesh.visible = e > 0.01;
          // accelerating away, rather than easing to a stop at the top: it is
          // being carried off, and a wisp that decelerates reads as arriving
          // somewhere
          w.mesh.scale.setScalar(gone ? 0.55 : 0.55 * (1 - 0.82 * u));
          w.mesh.position.y = 0.30 + RISE * u * u;
        }
      },
      fragment() {
        return {
          grasps,
          // the strongest of them, so a single number still means "how much is
          // there right now" with several of them in the air at once
          held: +Math.max(...wisps.map((w) => w.mat.opacity)).toFixed(3),
          // ...and how many are up. Nothing is ever HELD, whatever the count.
          aloft: wisps.filter((w) => w.mesh.visible).length,
          flakes: snow.count(),
        };
      },
      dispose() { snow.dispose(); },
    };
  },
};
