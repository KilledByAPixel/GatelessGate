import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, wash } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeVeranda } from '../kit/veranda.js';
import { makeScreen } from '../kit/screen.js';
import { makeMonk, aimMonk } from '../kit/monk.js';
import { makeAssembly } from '../kit/assembly.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 26;

// The hall stands square to the world with its bay facing -z, out over the
// country; the camera sits inside with the assembly and looks out through it.
const FRONT = -1.4;        // the post line, and the plane the screen hangs in
const DECK = 0.34;         // floor height — everyone on the veranda stands on this
const SCREEN_W = 4.4;
const SCREEN_H = 2.45;

export default {
  id: ID,
  slug: 'two-monks-roll-up-the-screen',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14'],

  // Framed from inside the hall, low and nearly square to the bay: the reveal
  // only reads if the eye can travel THROUGH the opening to the far mountains,
  // and a high three-quarter shot looks down into the grass instead.
  camera: { distance: 10.5, target: [0, 1.35, -0.3], azimuth: 0.28, polar: 1.37 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    const veranda = makeVeranda({ width: 4.8, depth: 4.4, height: 3.3, deck: DECK });
    veranda.position.set(0, 0, FRONT);
    scene.add(veranda);

    // THE SCREEN. The one red thing here, and a big surface — full accent across
    // four metres of bamboo stops reading as a seal and starts reading as glare,
    // so it takes the deeper mix. It fills the bay: when it is down the country
    // is shut out, and that is the whole of the case.
    const screen = makeScreen({
      width: SCREEN_W, height: SCREEN_H, slats: 11,
      color: ACCENT_DEEP, cordDrop: 1.07, seed: ID,
    });
    screen.group.position.set(0, DECK, FRONT);
    scene.add(screen.group);

    // The two monks, one at each cord, sleeves raised to it. Which of them
    // gained and which lost is not something the staging is allowed to answer,
    // so they are built identically but for a hand's breadth of height.
    const monks = [];
    for (const side of [-1, 1]) {
      const m = makeMonk({ pose: 'point', height: side < 0 ? 1.6 : 1.58 });
      // Standing where the raised sleeve can actually close on the cord — it
      // only spans about 0.63 — and far enough off the slats that neither his
      // hem nor his hand is buried in them.
      m.position.set(side * 1.46, DECK, -0.88);
      // aimMonk turns the RAISED sleeve (local +x) onto a target, so each monk
      // is aimed at his own cord rather than at the screen in general.
      const cord = screen.cords.find((c) => Math.sign(c.position.x) === side);
      aimMonk(m, {
        x: screen.group.position.x + cord.position.x,
        z: screen.group.position.z + cord.position.z,
      });
      scene.add(m);
      monks.push(m);
    }

    // Hogen, seated a little back on the centre line, facing the bay. A seated
    // monk's front is local +z (the sleeves fold that way), so he is turned by
    // hand rather than with aimMonk, which aims the pointing sleeve instead.
    const hogen = makeMonk({ pose: 'sit', height: 1.62, stout: 1.08, elder: true });
    hogen.position.set(0.45, DECK, 0.5);
    hogen.rotation.y = Math.PI + 0.16;
    scene.add(hogen);

    // the rest of the assembly, waiting for a lecture that has not started:
    // set to one side so the teacher is not lost behind a crowd of cones
    const assembly = makeAssembly({
      count: 5, radius: 0.95, center: [-1.35, 1.5], facing: [0, FRONT], spread: 0.4, seed: ID,
    });
    assembly.position.y = DECK;
    scene.add(assembly);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: 0, z: 0.8, r: 5.0 },        // the veranda and everyone on it
        { x: 0, z: -3.6, r: 3.6 },       // the ground just outside the bay
        // and the corridor the eye travels once the screen is up — a scatter
        // tree parked in the opening would be the only thing anyone looked at
        { x: -0.9, z: -8.0, r: 3.8 },
        { x: -1.8, z: -13.5, r: 4.0 },
      ],
      // only the floor covers ground. The monks stand in boards, not in grass,
      // and everything outside the hall keeps its meadow.
      grassKeepout: veranda.footprint(),
      // The default bands are scattered across a wide arc and leave the country
      // straight ahead empty — so the bay opened onto nothing but grass. This
      // hall faces a mountain: a third band, narrow and centred on the corridor
      // the eye travels, so the thing the screen was hiding is actually there.
      mountains: [
        { count: 8, distance: 52, arcSpan: 3.6, color: wash(0.16) },
        { count: 5, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.65 },
        { count: 4, distance: 27, arcCenter: -0.06, arcSpan: 0.9, color: wash(0.32), hScale: 0.62 },
      ],
    });

    // the hall's own shadow spills past the boards; the figures cast onto them
    const verandaShadow = makeBlobShadow({ radiusX: 2.9, radiusZ: 2.7, opacity: 0.30 });
    verandaShadow.position.set(0, 0.012, 0.8);
    scene.add(verandaShadow);
    for (const [p, rx, rz, op] of [
      [monks[0].position, 0.62, 0.48, 0.40],
      [monks[1].position, 0.62, 0.48, 0.40],
      [hogen.position, 0.72, 0.58, 0.38],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.set(p.x, DECK + 0.012, p.z);
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the screen goes up, and the sky is there ---------------
    // Tap it and it rolls; tap it again and it comes down. Nothing is scored and
    // nothing is announced — the payoff is only that the country appears.
    let camera = null;
    let pulls = 0;
    let rang = false;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, screen.pickTargets())) return;
      screen.toggle();
      pulls++;
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.14']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        world.update(dt, simTime);
        screen.update(dt, simTime);
        // one soft strike as the opening clears, none on the way back down
        if (!rang && screen.rolled() > 0.8) {
          audio && audio.bell({ f0: 150, gain: 0.45 });
          rang = true;
        }
        if (screen.rolled() < 0.2) rang = false;
      },
      fragment() {
        return {
          roll: +screen.rolled().toFixed(4),
          cover: +screen.coverHeight().toFixed(4),
          up: screen.isUp(),
          pulls,
        };
      },
      dispose() {},
    };
  },
};
