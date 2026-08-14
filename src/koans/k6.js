import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';

import {
  composeWorld, makeBuddha, makeMonk, faceMonk, makeFlower, makeAssembly, makeCat,
  makeLights, washMaterial, tapMeshes,
} from '../kit/index.js';
import { hash1 } from '../util/noise.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';

const ID = 6;

const PETAL_FALL = 5.0;     // seconds for a petal to reach the ground

// the tumble, composed onto each petal's release pose — reused rather than
// allocated per petal per frame
const _spin = new THREE.Euler();
const _tumble = new THREE.Quaternion();

// NO SMILE. Kasyapa used to grow one while a petal was in the air — a bare
// paper arc on his head, the one face rendered anywhere in this book, faded in
// over 1.4s and left there. It was cut. It was the design doc's original hook
// for this case and it does not survive contact with the shipped figures: a
// lone arc on a featureless ink head reads as a mark ON him rather than an
// expression, at a staging distance where his whole skull is a few pixels
// across. The case still lands — the flower turns, a petal goes, and nobody in
// the scene reacts, which is closer to what the text describes than a face was.
// If a smile is ever wanted back it needs to be a POSE (a tilt of the head, a
// shift in the shoulders), not geometry on a face that has none.

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11, target: [1.05, 1.25, -3.35], heading: 17, pitch: 18 };
  export default {
  id: ID,
  slug: 'buddha-twirls-a-flower',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12', 'music'],
  mood: 'yo',      // the flower, the petal, the cat — the gentlest case in the book
  
  // Its own lens. The generic diorama shot pivots on [1.2, 1.35, 0.3], which in
  // THIS scene is bare grass in front of the crowd: everything that matters —
  // the raised stone at z -5, the lotus at -4, Kasyapa apart at +x — sat eleven
  // degrees off the middle of the frame with the subject shoved into a corner —
  // badly centred, with the subject off to one side rather than on the flower.
  // So the pivot IS the flower. The heading comes in from the stock 31.5 for
  // the same reason — a squarer look down the scene's own axis — and the
  // distance goes out to hold the assembly back off the lens, since pulling the
  // target four units deeper pulls the camera with it. The numbers are derived,
  // not dialled: they put the camera on the exact spot the default lens already
  // stood on (6.94, 4.74, 9.67) and turn it to look at the flower instead of at
  // the grass in front of the crowd. Same shot, same sizes, same distance from
  // the front row — only the aim moves. Re-aiming by moving the target alone
  // would have dragged the camera four units deeper into the assembly and stood
  // the front row in the lens, which is the trap the arc's own comment warns
  // about below.
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  // Contre-jour — the one image in the book that asks for it. The
  // light is behind the held flower, so the petal is lit through and
  // the assembly watching it are edges.
  scene.add(makeLights({ sun: { heading: 65, pitch: 38 } }));
  
  // Vulture Peak: the Buddha raised on a low stone, the assembly below him.
  // The stone came down with the statue (overnight pass 2: he is the same
  // ordinary figure as everyone now, so the 1.5-radius platform of the
  // 2.35 colossus would read as a stage under a man).
  const seat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.95, 1.1, 0.34, 9),
  washMaterial({ color: WASH.stone, flat: true }));
  seat.name = 'seat';
  const SEAT_Z = -5.0;                  // far enough back that the assembly can sit between
  seat.position.set(1.2, 0.17, SEAT_Z);
  scene.add(seat);
  
  // ordinary monk scale — the raised stone, not his size, is what sets him
  // apart at the back of the scene
  const buddha = makeBuddha({ height: 1.6 });
  buddha.position.set(1.2, 0.34, SEAT_Z);
  scene.add(buddha);
  
  // The lotus, STANDING ON THE GROUND before the raised stone — the one thing
  // in the case that actually happens. It used to be "held" at his waist, which
  // from the shipped lens meant a red mass punched through his torso. It has to
  // be DOWN, in front of him. So it is: planted in the open ground between the
  // stone and the assembly, on his centre line, where the sight line to him
  // passes well over it. Still deliberately big — at this staging distance a
  // real-scale lotus is a red dot — big is fine; intersecting is not.
  const flower = makeFlower({ height: 0.5, bloom: 0.62, petals: 7 });
  const FLOWER_Z = SEAT_Z + 1.0;                   // just clear of the stone's skirt
  flower.position.set(1.2, 0, FLOWER_Z);
  flower.rotation.z = -0.14;
  scene.add(flower);
  
  // Mahakasyapa sits nearest, apart from the rest — the one who understands.
  const kasyapa = makeMonk({ pose: 'sit', height: 1.55 });
  kasyapa.position.set(1.2, 0, -1.6);
  faceMonk(kasyapa, buddha.position);
  scene.add(kasyapa);
  
  // The rest of the assembly, one instanced crowd facing the seat. The arc
  // opens toward +z (the camera), so its centre must sit WELL BACK or the
  // front row looms in the lens as a wall of black cones.
  const assembly = makeAssembly({
  count: 7, radius: 3.1, center: [1.2, -3.9], facing: [1.2, SEAT_Z], spread: 1.3, seed: 6,
  });
  scene.add(assembly);
  
  // The monastery cat (k14's, on its gentlest day), sitting at the assembly's
  // flank with its eyes on the Buddha like everyone else — present for the
  // sermon, unbothered by whether it understands.
  const cat = makeCat({ height: 0.32, seed: 6, pose: 'sit' });
  const CAT = { x: -1.5, z: -1.0 };
  cat.group.position.set(CAT.x, 0, CAT.z);
  faceMonk(cat.group, buddha.position);
  scene.add(cat.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 11,
  groundSeed: 21,
  trees: 4,
  keepout: [
  { x: 1.2, z: 40, r:50.0 }, // back area
  { x: 1.2, z: SEAT_Z, r: 2.0 },   // the seat
  { x: 1.2, z: -2.2, r: 4.0 },     // the assembly
  { at: kasyapa, r: 1.2 },    // Kasyapa
  { at: cat.group, r: 0.5 },
  ],
  // the stone platform covers ground, and the meadow steps back from the
  // grounded lotus so the bloom is not buried in blades; the assembly
  // sits in the grass
  grassKeepout: [
  { x: 1.2, z: SEAT_Z+2, r: 2.7 },
  { x: 1.2, z: FLOWER_Z, r: 0.9 },
  // a clearing for the cat — 0.32 of animal disappears in full meadow
  // (k7 learned this the hard way)
  { x: CAT.x, z: CAT.z, r: 0.7 },
  ],
  forests: [
    { center: [-19, 0, -27], spread: 27, count: 55 },
    { center: [16, 0, -21], spread: 17, count: 40, color: wash(0.55) },
  ],
  mountains: [
    { count: 8, distance: 52, arcSpan: 3.6, color: wash(0.16), hScale: 0.65 },   // farthest band
    { count: 9, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.55 },
  ],


  });

  // ---- the moment: the flower, and the petal --------------------------
  let camera = null;
  let clock = 0;           // the house simTime guard — see update()
  let dropped = 0;
  const falling = [];          // { mesh, age, x0, y0, z0, spin, drift }
  
  // EVERY TERM OF THE FALL STARTS AT ZERO, and it did not before. The sway used
  // to be written as `z0 + cos(age·1.3)·0.12`, which is z0 + 0.12 on the first
  // frame — the petal jumped a tenth of a unit sideways the instant it let go —
  // and `rotation.x = sin(age·2.1)·0.5` overwrote whatever tilt it had been
  // sitting at with a flat zero. Between that and dropPetal() losing the world
  // orientation (fixed in the kit), a released petal snapped pose and position
  // together and looked like it had been coughed out of the bloom.
  //
  // Now the release pose is the petal's own, kept, and everything below is an
  // OFFSET from it: the sways are (cos - 1) and sin, both zero at age 0, the
  // tumble is an added rotation starting at nothing, and the descent eases in
  // rather than starting at full speed. It lets go, hangs for an instant, and
  // goes.
  function releasePetal() {
  const petal = flower.dropPetal();
  if (!petal) return false;
  scene.add(petal);                       // reparented to the root; keeps its whole pose
  falling.push({
  mesh: petal, age: 0,
  x0: petal.position.x, y0: petal.position.y, z0: petal.position.z,
  // the attitude it came off wearing — the tumble is added to this
  q0: petal.quaternion.clone(),
  drift: (hash1(dropped * 3 + 1, 6) - 0.5) * 0.9,
  spin: (hash1(dropped * 3 + 2, 6) - 0.5) * 2.4,
  // which way it tips as it goes over, seeded so no two tumble alike
  tipX: (hash1(dropped * 3 + 3, 6) - 0.5) * 1.6,
  });
  dropped++;
  return true;
  }
  
  const flowerMeshes = tapMeshes(flower);
  input.onTap(() => {
  if (!camera) return;
  // the flower first — it is the case's moment; the cat is company.
  // (Probing the cat first also silenced the staging net's hit-everything
  // tap: a silent stir must never be the FIRST thing a tap can reach.)
  const hit = input.raycastFirst(camera, flowerMeshes);
  if (!hit && input.raycastFirst(camera, cat.meshes())) { touched && touched(); cat.stir(); return; }
  if (hit && releasePetal()) {
  touched && touched();
  // A petal genuinely makes no sound. The most that is honest is a suggestion
  // of one — still the quietest voice in the book, just no longer its quietest
  // possible setting, which was under the threshold of being heard at all. It
  // must not fire once the flower is bare: releasePetal() returns false with
  // nothing left to drop, and this case is the one place an uncaused sound was
  // explicitly ruled out.
  audio && audio.breath({ force: 1, at: hit.point });
  }
  });
  
  // NOTHING FALLS ON ITS OWN HERE. A petal used to release every 26s
  // unprompted; it was cut — the case is Kashyapa's smile, which is an ANSWER
  // to something offered, and a flower shedding on a timer answers nobody. Case
  // 38's oak keeps its unprompted leaf: a tree in the wind genuinely does that,
  // and the falling is the whole subject there rather than the response.

  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  cat.update(dt, simTime);
  
  // he twirls it. The case is named for the gesture, and it is the only
  // motion in the scene besides the grass. Driven from the guarded
  // clock, not raw simTime — a host calling update(dt) alone must not
  // feed NaN into a transform.
  flower.rotation.y = clock * 0.32;

  for (let i = falling.length - 1; i >= 0; i--) {
  const f = falling[i];
  f.age += dt;
  const t = Math.min(1, f.age / PETAL_FALL);
  // A petal does not drop, it sways down — but it starts from rest. The
  // descent eases in over the first fifth of the fall, so it detaches,
  // hesitates, and then goes; the two sways are written to be exactly
  // zero at age 0 so nothing moves on the frame it comes off.
  const ease = t < 0.2 ? (t / 0.2) * (t / 0.2) * 0.2 : t;
  f.mesh.position.set(
  f.x0 + Math.sin(f.age * 1.7) * 0.16 + f.drift * t,
  f.y0 - ease * (f.y0 - 0.03),
  f.z0 + (Math.cos(f.age * 1.3) - 1) * 0.12,
  );
  // the tumble, ADDED to the pose it let go in rather than replacing it
  _spin.set(f.tipX * Math.sin(f.age * 2.1) * 0.5, f.spin * f.age, 0);
  f.mesh.quaternion.copy(f.q0).multiply(_tumble.setFromEuler(_spin));
  if (t >= 1) falling.splice(i, 1);
  }
  },
  fragment() {
  return {
  petals: flower.children.filter((c) => c.name === 'petal').length,
  falling: falling.length,
  dropped,
};
      },
      dispose() {},
    };
  },
};
