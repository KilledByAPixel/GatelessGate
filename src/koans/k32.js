import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, wash } from '../palette.js';
import {
  composeWorld, makeBuddha, makeMonk, faceMonk, makeAssembly,
  makeWildflowers, makeLights, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 32;

// "Without words, without the wordless, will you tell me truth?" — and the
// Buddha kept silence, and the philosopher thanked him for it.
//
// This WAS the book's second temporal case: 20 seconds of touching nothing and
// the philosopher bowed, and any tap reset the count. It was cut (Frank: "I'm
// not sure that one is the best concept either"), and measuring it said the
// same thing louder — the wait began the moment the page loaded, so reading the
// case text outlasted it and he bowed unprompted on essentially every visit.
// The one thing a tap could do was PREVENT the only event in the scene, which
// meant the interaction was invisible by construction: what the reader saw was
// a scripted bow, and touching the page made it not happen.
//
// Now you ask, and the Buddha does nothing, and the philosopher bows anyway.
// The BEAT below is the whole case — the pause where an answer doesn't come is
// the answer. Ask as often as you like; the tenth asking gets exactly what the
// first did (case 23's rule for a scene that refuses).

const BEAT = 1.1;         // silence, held, where the answer would have gone
const BOW_IN = 2.4;       // and then, slowly
const BOW_HOLD = 2.2;     // down there a while — a real bow, not a nod
const BOW_OUT = 3.0;      // and slower still coming up
const BOW_SPAN = BEAT + BOW_IN + BOW_HOLD + BOW_OUT;
const BOW = 0.62;         // radians at the waist

// The bow as a pure function of seconds since the asking, so nothing
// accumulates and a host that only ever calls update(dt) still gets the shape.
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function bowShape(u) {
  if (!(u >= BEAT) || u >= BOW_SPAN) return 0;
  const t = u - BEAT;
  if (t < BOW_IN) return smooth(t / BOW_IN);
  if (t < BOW_IN + BOW_HOLD) return 1;
  return 1 - smooth((t - BOW_IN - BOW_HOLD) / BOW_OUT);
}

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.5, target: [0.9, 1.5, -1.6], heading: 31.5, pitch: 17.2 };
  export default {
  id: ID,
  slug: 'a-philosopher-asks-buddha',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights());
  
  // a low stone seat, and the Buddha on it, saying nothing. Both came down
  // to human scale in overnight pass 2 — he is the same figure kit as the
  // philosopher facing him, and the silence reads better between equals.
  const seat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 1.0, 0.30, 9),
  toonMaterial({ color: wash(0.32), flat: true }));
  seat.name = 'seat';
  seat.position.set(0.6, 0.15, -3.6);
  scene.add(seat);
  
  const buddha = makeBuddha({ height: 1.6 });
  buddha.position.set(0.6, 0.30, -3.6);
  scene.add(buddha);
  
  // THE PHILOSOPHER, standing at a respectful distance, waiting for an answer
  // pose 'bow' hinges him at the sash: makeFigure hands back a group named
  // 'waist' carrying the torso, head and arms, and turning it forward IS the
  // bow. He is built upright; the movement below is the whole case.
  const philosopher = makeMonk({ height: 1.66, hat: false, stout: 1.05, pose: 'bow' });
  const philWaist = philosopher.getObjectByName('waist');
  philosopher.position.set(2.0, 0, 0.5);
  faceMonk(philosopher, buddha.position);
  scene.add(philosopher);
  
  // Ananda, off to the side, who will ask afterwards what just happened
  const ananda = makeMonk({ height: 1.58 });
  ananda.position.set(-2.3, 0, -0.9);
  faceMonk(ananda, buddha.position);
  scene.add(ananda);
  
  const assembly = makeAssembly({
  count: 6, radius: 2.2, center: [-0.6, 2.6], facing: [0.6, -3.6], spread: 1.2, seed: ID,
  });
  scene.add(assembly);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  { x: 0.6, z: -3.6, r: 2.4 },
  { at: philosopher, r: 1.2 },
  { at: ananda, r: 1.2 },
  { x: -0.6, z: 2.6, r: 3.0 },
  // clear the sightline: the home camera sits out around (6, 7), and a
  // scatter tree landed square between it and the Buddha (Frank couldn't
  // see anything). Keep the foreground between lens and seat open.
  { x: 3.6, z: 3.0, r: 4.6 },
  ],
  grassKeepout: [{ x: 0.6, z: -3.6, r: 1.5 }],
  });
  
  // White wildflowers through the meadow (Frank: "add flowers to the scene,
  // just white ones") — the kit's default whitish bloom, deliberately NOT
  // the accent: nothing in this case gets to speak, flowers included. They
  // nod; that is all the motion the stillness allows.
  const flowers = makeWildflowers({
  count: 120, radius: 16, rMin: 3.0, seed: ID, groundSeed: 21,
  keepout: [
  { x: 0.6, z: -3.6, r: 2.2 },     // the seat and the silence before it
  { at: philosopher, r: 0.9 },
  { at: ananda, r: 0.8 },
  { x: -0.6, z: 2.6, r: 2.8 },     // the assembly
  ],
  });
  scene.add(flowers.mesh);
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  // ---- the moment: ask, and be answered with nothing --------------------
  let clock = 0;
  let askedAt = -99;
  let asked = 0;
  let bows = 0;
  let sounded = true;      // the pending chime is already spent before the first asking

  // ANY tap asks — there is nothing here to hit, which is the point. Aiming
  // this at the Buddha would make the gesture a target-hunt, and the case is
  // not one: the question is put to the scene and the scene declines it.
  input.onTap(() => {
  if (clock - askedAt < BOW_SPAN) return;      // let the bow he already gave you finish
  askedAt = clock;
  asked++;
  sounded = false;
  });

  return {
  scene,
  // the module contract wants the hook, but nothing here aims a ray
  setCamera() {},
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  flowers.update(dt, simTime);

  const lean = bowShape(clock - askedAt);
  // FORWARD, at the waist. This was rotation.z on the whole figure, so
  // he listed sideways like a felled post (Frank: "he's bowing along the
  // wrong axis... he should be bowing forward, and ideally bent at the
  // waist"). Bodies front local +z and a positive turn about x carries
  // the chest that way, so this is a bow from the sash up.
  philWaist.rotation.x = BOW * lean;
  // the one sound in the case, at the bottom of the bow and not at the
  // tap: what is being marked is the thanking, not the asking
  if (!sounded && lean >= 1) {
  sounded = true;
  bows++;
  audio && audio.chimeStrike({ tube: 0, force: 0.5, at: philosopher.position });
  }
  },
  fragment() {
  return {
  asked,
  bows,
  since: +Math.min(999, clock - askedAt).toFixed(1),
  lean: +Math.abs(philWaist.rotation.x).toFixed(4),
};
      },
      dispose() {},
    };
  },
};
