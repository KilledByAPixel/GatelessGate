import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT_DEEP, wash } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makeBuddha, makeMonk, faceMonk,
  makeLights, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 42;

// Manjusri — wisest of the bodhisattvas, teacher of seven Buddhas — walks
// round the girl three times, snaps his fingers, carries her to a high heaven,
// and cannot bring her out of samadhi. Then Momyo, a beginner, comes up out of
// the earth, snaps once, and she wakes.
//
// Both gestures are in the scene and they are the SAME gesture. Snap at her
// from where Manjusri stands and you get a sharp, excellent, useless sound.
// Touch the ground instead and the beginner comes up through it, and she
// stirs. Nothing marks which is which beforehand.

const RISE = 2.4;         // seconds for Momyo to come up out of the earth
const WAKE = 2.0;

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 8.3, target: [0.8, 1.15, -1.2], heading: 31.5, pitch: 15.5 };
  export default {
  id: ID,
  slug: 'the-girl-comes-out-from-meditation',
  title: TEXT[ID].title,
  accent: ACCENT_DEEP,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.10', 'snap', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  scene.add(makeLights());
  
  // the Buddha, back and above, presiding over an argument he has already
  // settled — the same ordinary figure as everyone in it (overnight pass 2);
  // the raised stone and the distance are what set him back and above
  const seat = new THREE.Mesh(
  new THREE.CylinderGeometry(0.85, 0.95, 0.28, 9),
  toonMaterial({ color: wash(0.32), flat: true }));
  seat.name = 'seat';
  seat.position.set(0.5, 0.14, -3.3);
  scene.add(seat);
  
  const buddha = makeBuddha({ height: 1.6 });
  buddha.position.set(0.5, 0.28, -3.3);
  scene.add(buddha);
  
  // THE GIRL, unmoved, in the middle of the floor. She is the seal: the one
  // figure in the book rendered in the accent, because she is the only thing
  // in this case that nobody can shift.
  const GIRL = new THREE.Vector3(0.85, 0, -1.15);
  const girl = makeMonk({ height: 1.24, pose: 'sit', hat: false, color: ACCENT_DEEP });
  girl.position.copy(GIRL);
  faceMonk(girl, buddha.position);
  scene.add(girl);
  
  // MANJUSRI, standing over her with his hand up, having just snapped it
  const manjusri = makeMonk({ height: 1.72, pose: 'raise' });
  manjusri.position.set(-0.55, 0, -0.25);
  faceMonk(manjusri, GIRL);
  scene.add(manjusri);
  
  // (A shishi-odoshi stood at the garden's edge for a while — k7's, silent,
  // keeping a different yard's time. It's gone: its tip landed inside the
  // floor's own big hit box, so touching the one moving prop in the scene
  // made a monk rise out of the earth — an answer to a question nobody was
  // asking. Frank: "get rid of the water tilting thing here.")
  
  // MOMYO, still under the floor. He is placed and posed from the start and
  // simply has not come up yet — the earth hides him.
  const momyo = makeMonk({ height: 1.5, pose: 'raise' });
  const MOMYO = new THREE.Vector3(2.25, 0, -0.1);
  momyo.position.set(MOMYO.x, -1.8, MOMYO.z);
  faceMonk(momyo, GIRL);
  scene.add(momyo);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID+2,
  groundSeed: 21,
  trees: 8,
  keepout: [
  { x: 0.5, z: -3.3, r: 2.0 },
  { x: GIRL.x, z: GIRL.z, r: 1.4 },
  { at: manjusri, r: 1.2 },
  { x: MOMYO.x, z: MOMYO.z, r: 1.2 },
  ],
  // the floor of the assembly hall is swept — and it has to be bare where
  // Momyo comes through it
  grassKeepout: [{ x: 0.8, z: -1.8, r: 2.4 }],
  });
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  const girlHit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.62, 0.62, 1.5, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  girlHit.name = 'girl-hit';
  girlHit.userData.noOutline = true;
  girlHit.position.set(GIRL.x, 0.6, GIRL.z);
  scene.add(girlHit);
  
  // the floor itself, where a beginner might come from
  const floorHit = new THREE.Mesh(
  new THREE.BoxGeometry(11, 0.2, 11),
  new THREE.MeshBasicMaterial({ visible: false }));
  floorHit.name = 'floor-hit';
  floorHit.userData.noOutline = true;
  floorHit.position.set(0.8, 0.02, -0.6);
  scene.add(floorHit);
  
  // ---- the moment: the wrong master and the right beginner --------------
  let camera = null;
  let clock = 0;
  let snaps = 0;
  let calledAt = -99;
  // the RAISED sleeve, not the hanging one: pose 'raise' swings it to
  // PI - 0.34, while the resting sleeve sits at a mere -0.28, so both are
  // non-zero and only the magnitude tells them apart
  const manjusriArm = manjusri.children
  .filter((c) => c.name === 'arm')
  .find((c) => Math.abs(c.rotation.z) > 1);
  
  input.onTap(() => {
  if (!camera) return;
  // her first: a snap aimed at the girl is Manjusri's, and it fails
  if (input.raycastFirst(camera, [girlHit])) {
  snaps++;
  audio && audio.knock({ force: 0.75, at: GIRL });      // an excellent snap
  return;
  }
  if (calledAt > -99) return;                   // he only needs asking once
  if (!input.raycastFirst(camera, [floorHit])) return;
  calledAt = clock;
  audio && audio.knock({ force: 0.45, at: MOMYO });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  
  // Manjusri keeps snapping, forever, to no effect
  if (manjusriArm) manjusriArm.rotation.x = 0.22 + Math.sin(clock * 1.6) * 0.06;
  
  if (calledAt > -99) {
  const r = clamp01((clock - calledAt) / RISE);
  const e = r * r * (3 - 2 * r);
  momyo.position.y = -1.8 + 1.8 * e;
  
  // and she stirs: the head lifts, the folded shoulders open
  const w = clamp01((clock - calledAt - RISE * 0.75) / WAKE);
  const s = w * w * (3 - 2 * w);
  girl.rotation.z = -0.06 * s;
  girl.position.y = GIRL.y + 0.03 * s;
  }
  },
  fragment() {
  return {
  snaps,
  called: calledAt > -99,
  risen: +clamp01((momyo.position.y + 1.8) / 1.8).toFixed(3),
  woken: +Math.abs(girl.rotation.z / 0.06).toFixed(3),
};
      },
      dispose() {},
    };
  },
};
