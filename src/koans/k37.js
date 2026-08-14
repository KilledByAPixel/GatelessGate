import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP } from '../palette.js';
import {
  composeWorld, makeBuffalo, makePen, makeMonk, faceMonk,
  makeLights, tapMeshes,
} from '../kit/index.js';

const ID = 37;

// HE TURNS ALL THE WAY ROUND. Tug the tail and the buffalo swings clockwise to
// face away, stops and shakes it, then carries on the same way round until he
// is standing exactly as he was — one full circle, always the same way round.
//
// Which is the koan, and it is better than the swish alone was. His head, horns
// and body pass through — everything passes through — and then his tail comes
// round after them and he is exactly where he started, with nothing having
// happened. A full circle also costs nothing to end: 2*PI is the same heading
// he began at, so the shape below can simply return 0 once it is over instead
// of holding a wound-up offset for the life of the page.
//
// Clockwise seen from above is DECREASING rotation.y — the right-hand rule
// about +y turns the other way, and getting this backwards is a bug you can
// only catch by looking.
const TURN_IN = 2.4;      // the first half, to face away
const SHAKE = 1.7;        // stopped, tail going
const TURN_OUT = 2.4;     // and round the rest of the way
const TURN_SPAN = TURN_IN + SHAKE + TURN_OUT;
const TURN_LEAN = 0.05;   // radians of bank into the turn: a heavy animal pivoting,
                          // not a model on a turntable. The legs do not step —
                          // makeBuffalo has no walk — so this is what carries the
                          // weight, and it is why the turn is slow.
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Turns completed, `u` seconds after the tug: 0 at rest, 0.5 while he stands
// facing away, 1 at the far end — which is the same heading as 0.
function turnAt(u) {
  if (!(u >= 0) || u >= TURN_SPAN) return 0;
  if (u < TURN_IN) return 0.5 * smooth(u / TURN_IN);
  if (u < TURN_IN + SHAKE) return 0.5;
  return 0.5 + 0.5 * smooth((u - TURN_IN - SHAKE) / TURN_OUT);
}
// how fast he is turning, as a fraction of full pace — what the bank rides on
function turnRate(u) {
  if (!(u >= 0) || u >= TURN_SPAN) return 0;
  if (u < TURN_IN) { const t = u / TURN_IN; return 6 * t * (1 - t); }
  if (u < TURN_IN + SHAKE) return 0;
  const t = (u - TURN_IN - SHAKE) / TURN_OUT;
  return 6 * t * (1 - t);
}
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 13.8, target: [1.45, 1.3, -1.5], heading: 29, pitch: 21 };
  export default {
  id: ID,
  slug: 'a-buffalo-passes-through-the-gate',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.2:broadleaf', 'music'],
  // Orbit around the BUFFALO. On the shared default target the pivot landed on
  // the middle of a fence panel, so the camera swung around a wall while the
  // subject drifted across frame — the scene appeared to rotate about nothing.
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: 56, pitch: 47 } }));
  
  // The enclosure. Three walls of lattice — and the fourth side is not missing
  // but a DOUBLE DOOR: one leaf standing shut, the other pushed ajar, the way a
  // gate stands after somebody slipped through and did not look back. Both
  // leaves standing wide read as too open, so one is shut. A wall that was
  // never built says nothing; a door left ajar says the pen has never once held
  // him. The shut leaf is the far corner, the ajar one the near — it opens
  // across the buffalo's own facing line, toward the lens.
  const PEN = { x: 1.0, z: -2.3, size: 5.4 };   // room to stand, not a crate
  const pen = makePen({ size: PEN.size, height: 1.9, open: '+x', panelsPerSide: 2, doors: [0, 0.62] });
  pen.position.set(PEN.x, 0, PEN.z);
  scene.add(pen);
  
  // He stands in the middle of his own pen, facing the side that is standing
  // open. Nothing is holding him. Red, because the buffalo IS this koan —
  // deepened, since full accent across an animal this size reads as glare.
  const buffalo = makeBuffalo({ height: 1.5, color: ACCENT_DEEP, tailColor: ACCENT });
  buffalo.group.position.set(PEN.x, 0, PEN.z);
  // +z is his forward, so +PI/2 turns him to face +x — the opening. Backed off
  // a little from square so the camera gets his hump and horns in three-quarter
  // instead of a flat profile, and the tail stays clear of the body.
  buffalo.group.rotation.y = Math.PI / 2 - 0.42;
  scene.add(buffalo.group);
  
  // a monk watching the impossible thing, set back so he doesn't fill the lens
  const monk = makeMonk({ height: 1.6 });
  monk.position.set(4.9, 0, 1.4);
  faceMonk(monk, buffalo.group.position);
  scene.add(monk);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 40,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...pen.footprint(1.0),                              // the three standing walls
  { x: PEN.x, z: PEN.z, r: PEN.size * 0.5 },          // nothing clutters the pen floor
  { x: monk.position.x, z: monk.position.z, r: 1.1 },
  ],
  // nothing here covers the ground — grass grows through a fence and around
  // hooves in life, so let it
  grassKeepout: [],
  });

  // ---- the moment: the whole animal --------------------------------------
  // Touch him and he goes all the way round (see the note at the top of the
  // file). It never passes. That is the whole koan, and nothing in the UI
  // says so.
  //
  // THE WHOLE ANIMAL IS THE TARGET. It was the TAIL alone — the one part of him
  // painted full ACCENT against his deepened body, so the small thing the
  // reader is invited to touch is the small thing the case is named for. A
  // lovely argument, and it meant the page was dead to anybody who did the
  // obvious thing: clicking the buffalo itself did nothing at all.
  //
  // Which is the whole lesson: a target chosen because it is thematically right
  // is still wrong if it is not the thing a hand goes to. He is a metre and a
  // half of animal and the tail is a few centimetres of it, swinging, at the
  // end furthest from the lens. Touch him anywhere.
  let camera = null;
  let clock = 0;
  let tugs = 0;
  let tuggedAt = -99;
  const BASE_Y = buffalo.group.rotation.y;
  const buffaloMeshes = tapMeshes(buffalo.group).filter((m) => m.material.visible !== false);
  const swishes = [];

  input.onTap(() => {
  if (!camera) return;
  const hit = input.raycastFirst(camera, buffaloMeshes);
  if (!hit) return;
  // let him finish the circle he is already walking
  if (clock - tuggedAt < TURN_SPAN) return;
  touched && touched();
  tuggedAt = clock;
  tugs++;
  buffalo.tail.impulse(1.2);
  // a heavier brush than a robe: this is a tail, and there is an animal
  // on the other end of it
  audio && audio.cloth({ force: 1.1, at: hit.point });
  // and again when he has got round and stopped, which is the shake — three
  // of them, spaced, so it reads as a tail being used rather than struck
  swishes.length = 0;
  for (let i = 0; i < 3; i++) swishes.push(clock + TURN_IN + 0.2 + i * 0.6);
  });

  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  const u = clock - tuggedAt;
  // clockwise from above is NEGATIVE rotation.y, and a full turn lands him
  // back on BASE_Y exactly — turnAt returns 0 once it is over, which IS
  // that heading, so nothing has to be unwound
  buffalo.group.rotation.y = BASE_Y - turnAt(u) * Math.PI * 2;
  buffalo.group.rotation.z = -turnRate(u) * TURN_LEAN;
  while (swishes.length && clock >= swishes[0]) {
  swishes.shift();
  const impulse = 1;
  buffalo.tail.impulse(impulse);
  audio && audio.cloth({ force: impulse, at: buffalo.group.position });
  }
  buffalo.update(dt, simTime);
  },
  fragment() {
  return {
  tailEnergy: +buffalo.tail.energy().toFixed(6),
  tugs,
  turned: +turnAt(clock - tuggedAt).toFixed(4),
  };
  },
  dispose() {},
};
  },
};
