import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT_DEEP, wash } from '../palette.js';
import {
  composeWorld, makeBuddha, makeMonk, faceMonk, makeTree, makeFox,
  makeLights, toonMaterial,
} from '../kit/index.js';

const ID = 9;

// A Buddha who sat before recorded history, for ten cycles of existence, and
// did not become a Buddha. The scene has to hold that span, so it is built out
// of TIME rather than architecture: a colossal seated figure worn into the
// hillside, and the ground around it laid down in strata, each band an age.
//
// One thin band near the top is vermillion — the age we are standing in. It is
// the thinnest layer in the picture. That is the whole comment.
//
// Touch the figure and the deepest bell in the book sounds, once. Nothing else
// happens; nothing else has happened for ten cycles.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 17, target: [-0.3, 2.8, -1.6], heading: 31.5, pitch: 14.4 };
  export default {
  id: ID,
  slug: 'a-buddha-before-history',
  title: TEXT[ID].title,
  accent: ACCENT_DEEP,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16:pine', 'bell', 'music'],
  // sat back and tilted up: the subject is six units tall and the point is
  // that you are small in front of it. The colossus is NOT centered — he sits
  // off at the left third, backed by a mountain flank, discovered rather than
  // presented; the right of the frame holds the scale tree and the two monks.
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.024);       // thinner: the scale needs depth
  scene.add(makeLights());
  
  // Where the monument sits: off to the side and deeper, against the
  // mountain flank, so the frame discovers him instead of presenting him.
  // Everything anchored to the statue — strata, hit cylinder, keepouts, the
  // scale tree — derives from this one point.
  const CX = -5.6, CZ = -5.2;
  
  // ---- the strata -------------------------------------------------------
  // Terraces stepping up to the plinth, each one paler than the last as it
  // recedes into the past. Wide and shallow, so they read as geology rather
  // than as steps someone built.
  const BANDS = [
  { r: 8.6, h: 0.34, t: 0.30 },
  { r: 7.4, h: 0.30, t: 0.27 },
  { r: 6.3, h: 0.28, t: 0.24 },
  { r: 5.4, h: 0.26, t: 0.21 },
  { r: 4.6, h: 0.24, t: 0.18 },
  ];
  const strata = new THREE.Group();
  strata.name = 'strata';
  let y = 0;
  for (const [i, b] of BANDS.entries()) {
  const band = new THREE.Mesh(
  new THREE.CylinderGeometry(b.r * 0.93, b.r, b.h, 11),
  toonMaterial({ color: wash(b.t), flat: true }));
  band.name = 'stratum';
  band.position.y = y + b.h / 2;
  band.rotation.y = i * 0.19;
  strata.add(band);
  y += b.h;
  
  // THE PRESENT: a seam between the last two ages, thinner than any of
  // them — a slightly darker band, not the seal. The accent belongs to the
  // Buddha here (Frank's call: the figure is what the case is about, not
  // the ground).
  if (i === BANDS.length - 2) {
  const seam = new THREE.Mesh(
  new THREE.CylinderGeometry(b.r * 0.90, b.r * 0.93, 0.045, 11),
  toonMaterial({ color: wash(0.44), flat: true }));
  seam.name = 'seam';
  seam.position.y = y + 0.0225;
  strata.add(seam);
  y += 0.045;
  }
  }
  strata.position.set(CX, 0, CZ);
  scene.add(strata);
  
  // ---- the figure -------------------------------------------------------
  // Sunk to the hips in the top terrace: he was there before the ground was.
  // He is the seal: the one who sat ten cycles and did not become a Buddha is
  // the whole subject, so the accent is on him.
  //
  // The SAME ordinary figure kit as every monk in the book (overnight pass
  // 2 — no special buddha model), just carved colossal. The height param is
  // a standing height now: the old statue's crown stood 6.08 above its seat
  // (0.98 of its 6.2 param), and the figure kit's seated crown sits at
  // 0.595·H, so 10.2 keeps the monument the size the whole case — camera,
  // strata, the smallness of the two monks — was staged around.
  const SEAT_Y = y - 0.9;      // deeper: the wider pooled hem is the buried part
  const buddha = makeBuddha({ height: 10.5, color: ACCENT_DEEP });
  buddha.position.set(CX, SEAT_Y, CZ);
  buddha.rotation.y = 0.30;    // gaze out across the frame, over the monks
  scene.add(buddha);
  
  // ---- the scale tree ---------------------------------------------------
  // What tells you how big he is. An ordinary full-grown tree — the same
  // species and size as the midground scatter, so nothing reads imported —
  // rooted on the lowest stratum at the statue's flank: its whole life fits
  // inside the newest band of his time, and its crown barely clears his
  // elbow. Ink like every other tree; the accent stays his.
  const TREE_X = CX + 7.2, TREE_Z = CZ - 1.2;   // radius ~8.1: on band 0's top
  const tree = makeTree({ height: 3.5, seed: 907 });
  tree.position.set(TREE_X, BANDS[0].h, TREE_Z);
  tree.rotation.y = 2.1;
  scene.add(tree);
  
  // the monk who came to ask why, at the foot of the lowest terrace
  const monk = makeMonk({ height: 1.58 });
  monk.position.set(2.8, 0, 1.6);
  faceMonk(monk, buddha.position);
  scene.add(monk);
  
  // and Seijo, who answered that the question answers itself
  const seijo = makeMonk({ height: 1.64, elder: true });
  seijo.position.set(4.1, 0, 0.7);
  faceMonk(seijo, monk.position);
  scene.add(seijo);
  
  // A fox (k2's, between lives), sitting with its eyes on the figure that
  // has sat since before recorded history. Small against all that time —
  // the scale contrast is the reason it's here. Kitsune keep shrines in
  // the old stories; nobody minds it.
  //
  // OFF TO THE SIDE (Frank). It used to sit at (-0.9, 2.75), which from the
  // home lens is the same screen column the colossus occupies — a red-brown
  // smudge parked in front of the one thing the case is about. Now it sits
  // at the frame's right edge, past the two monks, watching from the side
  // the way an animal actually attends a place.
  const fox = makeFox({ height: 0.45, seed: 9 });
  fox.group.position.set(-1.9, 0, 3.6);
  faceMonk(fox.group, buddha.position);
  scene.add(fox.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 3,
  treeRing: [13, 22],
  keepout: [
  { x: CX, z: CZ, r: 9.4 },          // the whole monument (tree included)
  { at: monk, r: 1.2 },
  { at: seijo, r: 1.2 },
  { at: fox.group, r: 0.6 },
  // the near flank's footprint: a scatter tree that spawns inside the
  // mountain pokes its crown through the slope and reads as a hole
  { x: -22.7, z: -15.3, r: 19 },
  ],
  grassKeepout: [
  { x: CX, z: CZ, r: 8.8 },
  // a clearing for the fox — 0.45 of animal disappears in full meadow
  { x: 5.9, z: 3.1, r: 0.9 },
  ],
  // the left forest cluster moves behind the near flank's center plane —
  // forests ignore keepouts, and a forest crown that spawns mid-slope
  // pokes through the mountain face and reads as a hole in the rock
  forests: [
  { center: [-31, 0, -36], spread: 12, count: 55 },
  { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  mountains: [
  { count: 8, distance: 52, arcSpan: 3.6, color: wash(0.16) },
  { count: 5, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.65 },
  // the flank he sits against: two near peaks pulled in behind the
  // statue's shoulder, so he is carved into a slope, not parked on a
  // lawn. Seed/distance/hScale chosen so the big peak's toe lands ~1
  // unit behind the statue's back — the strata run into the slope, the
  // statue himself stays clear of it.
  { count: 2, distance: 26, arcCenter: -0.82, arcSpan: 0.5, color: wash(0.34), hScale: 0.62, seed: 9009 },
  ],
  });

  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(2.4, 2.8, 6.0, 8),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'buddha-hit';
  hit.position.set(CX, SEAT_Y + 3.0, CZ);      // covers the taller crown too
  scene.add(hit);
  
  // ---- the moment: the oldest sound in the book -------------------------
  let camera = null;
  let clock = 0;
  let tolls = 0;
  let lastToll = -99;
  
  input.onTap(() => {
  if (!camera) return;
  if (!input.raycastFirst(camera, [hit])) return;
  if (clock - lastToll < 2.0) return;      // it does not hurry for anyone
  lastToll = clock;
  tolls++;
  // The colossus's own bell: bigger and deeper than k16's temple bonshō,
  // which is what "an octave under" was reaching for with a raw f0 —
  // task-12's migration to Frank's tuned presets picks `great` outright.
  //
  // And then bigger still. `great` at its own 2.36 was not enough for a
  // Buddha of this size (Frank: "it could be a deeper, more, like, longer
  // sound of a bell, because it is a giant"), so the preset's tuned voice is
  // cast at a larger BODY instead: f0 drops about six semitones and every
  // mode's decay grows with it, which is one number doing both halves of
  // what he asked for. The amplitudes are still exactly his.
  // ...and struck harder than anything else in the book. A big bell is not
  // just a low one (Frank: "can we make this one a little bit louder — it's
  // still kind of hard to hear"), and the size increase alone made it deeper
  // without making it arrive: casting the voice bigger spreads the same
  // energy over more, longer-decaying modes, so the onset actually got
  // quieter. gain is a plain strike velocity here, so this is how hard the
  // beam swings.
  audio && audio.bell({ preset: 'great', size: 3.4, gain: 2.2, at: hit.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  fox.update(dt, simTime);
  },
  fragment() {
  return { tolls, since: +Math.min(999, clock - lastToll).toFixed(1) };
  },
  dispose() {},
};
  },
};
