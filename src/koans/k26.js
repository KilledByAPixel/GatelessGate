import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, wash } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeVeranda } from '../kit/veranda.js';
import { makeScreen } from '../kit/screen.js';
import { makeFan } from '../kit/fan.js';
import { makeMonk, aimMonk } from '../kit/monk.js';
import { makeAssembly } from '../kit/assembly.js';
import { makeLights } from '../render/toon.js';
import { addOutlines } from '../render/outlines.js';

const ID = 26;

// The hall stands square to the world with its bay facing -z, out over the
// country; the camera sits inside with the assembly and looks out through it.
const FRONT = -1.4;        // the post line, and the plane the screen hangs in
const DECK = 0.34;         // floor height — everyone on the veranda stands on this
const SCREEN_W = 4.4;
const SCREEN_H = 2.45;

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 14.0, target: [0, 1.55, -0.6], heading: 16, pitch: 13.8 };
  export default {
  id: ID,
  slug: 'two-monks-roll-up-the-screen',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'music'],
  mood: 'yo',      // morning light through rolled blinds
  
  // Framed from inside the hall, low and nearly square to the bay: the reveal
  // only reads if the eye can travel THROUGH the opening to the far mountains,
  // and a high three-quarter shot looks down into the grass instead.
  // Sat back off the veranda. At 10.5 the lens was inside the bay with the eave
  // cutting the top of frame — and this case only works if you can see the screen
  // AND the country it is shutting out, because the reveal is the whole payoff.
  camera: CAM,
  
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
  //
  // onClack is the roll's own voice — see THE CLATTER in kit/screen.js — a
  // quiet run of bamboo knocks at a rate that follows the roll rather than
  // one sound marking the moment. `at` is the position the component
  // already reports in WORLD space (getWorldPosition on the rail, inside
  // screen.js), not read back here — this group is not nested under
  // anything else, but the component owns the behaviour and its own
  // placement rather than handing this case a local position to get wrong.
  const screen = makeScreen({
  width: SCREEN_W, height: SCREEN_H, slats: 11,
  color: ACCENT_DEEP, cordDrop: 1.07, seed: ID,
  onClack: (force, at) => audio && audio.knock({ force, at }),
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
  
  // A fan (k48's, in its plain dress — there it is the koan's own
  // gesture) set down open on the deck boards, off to the side where
  // somebody left it when the blinds needed rolling. Laid flat: an open
  // fan on the floor is a pause in the middle of a chore. Ink-washed —
  // the kit's paper-tone leaf vanished against the pale boards.
  // z must stay in FRONT of the screen plane (FRONT = -1.4): the first
  // spot, -2.35, put it INSIDE the shut bay, invisible behind the blinds.
  const fan = makeFan({ radius: 0.5, color: wash(0.42), seed: 26 });
  fan.rotation.x = -Math.PI / 2;
  fan.rotation.z = 0.7;
  fan.position.set(1.85, DECK + 0.015, -0.35);
  scene.add(fan);
  
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
  view: CAM,
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
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  // ---- the moment: the screen goes up, and the sky is there ---------------
  // Tap it and it rolls; tap it again and it comes down. Nothing is scored and
  // nothing is announced — the payoff is only that the country appears. The
  // roll used to mark its own arrival with a struck bell (preset 'hand') —
  // a stand-in from before the kit had a voice for the thing actually
  // making the sound. What is actually moving is bamboo winding onto a
  // rail, not a temple fixture beside it, so that one-shot is gone: the
  // screen now speaks through its own onClack (above) the whole time it is
  // moving, which is the sound this object should have been making all
  // along, not an event added on top of it.
  let camera = null;
  let pulls = 0;
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, screen.pickTargets())) return;
  screen.toggle();
  pulls++;
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);
  screen.update(dt, simTime);
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
