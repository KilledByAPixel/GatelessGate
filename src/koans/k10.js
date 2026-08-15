import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import { clamp01 } from '../util/math.js';
import {
  composeWorld, makePath, makeHut, makeMonk, faceMonk, makeVase, frontShadow,
  makeLights, washMaterial, plantTree,
} from '../kit/index.js';

const ID = 10;

// Seizei says he is alone and poor and asks for support. Sozan tells him he
// has already drunk three cups of the best wine in China and is still claiming
// his lips are dry.
//
// So there are three cups in the scene, set out on the mat between them, and
// they are the only warm thing in it. Tip one over and you find what Sozan
// already knows: it is empty, and it was empty before you touched it, because
// it has already been drunk. Tip all three and after a while they stand
// themselves back up, full of exactly as much as they were before.

const TIP = 0.4;         // seconds for a cup to go over
const RIGHT_AFTER = 4.5;  // and how long all three lie there before standing up

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 8.6, target: [0.8, 1, -0.2], heading: 29.5, pitch: 11 };
  export default {
  id: ID,
  slug: 'seizei-alone-and-poor',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'cups', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -26, pitch: 38 } }));
  
  const path = makePath({ from: [4.0, 8.4], to: [-2.0, -22], width: 1.2, seed: ID, groundSeed: 21, wander: 1.2 });
  scene.add(path);
  
  // Sozan's hut, which is not much of a hut either
  const hut = makeHut({ width: 2.6, height: 2.1, depth: 2.2, chimes:8 });
  hut.position.set(-1.4, 0, -4.0);
  hut.rotation.y = 0.5;
  scene.add(hut);
  
  plantTree(scene, { x: -4.2, z: -1.7, height: 4.7 });
  plantTree(scene, { x: 1.2, z: -15.7, height: 3.7, kind: 'pine' });
  
  // One empty vase by the door (k40's, with nothing in it and nothing
  // coming). Poverty in this book is furnished exactly this much: a
  // vessel kept anyway. Seizei says he is destitute; the vase agrees.
  const vase = makeVase({ height: 0.55, seed: 10 });
  vase.group.position.set(-0.15, 0, 1.0);
  scene.add(vase.group);
  
  // the mat they are sitting on — the whole of Seizei's estate
  const matGeo = new THREE.BoxGeometry(2.5, 0.035, 2.7);
  const mat = new THREE.Mesh(matGeo, washMaterial({ color: WASH.dry, flat: true }));
  mat.name = 'mat';
  mat.position.set(0.6, 0.018, 0.5);
  mat.rotation.y = 0.24;
  scene.add(mat);
  
  // SEIZEI, sitting on it with nothing
  const seizei = makeMonk({ height: 1.5, pose: 'sit', hat:false, stout: .9 });
  seizei.position.set(1.6, 0.035, 1.0);
  scene.add(seizei);
  
  // SOZAN, sitting across from him, who has been counting
  const sozan = makeMonk({ height: 1.56, pose: 'sit', elder: true, stout: 1.04 });
  sozan.position.set(-0.35, 0.035, 0.0);
  scene.add(sozan);
  faceMonk(seizei, sozan.position);
  faceMonk(sozan, seizei.position);
  
  // THE THREE CUPS, between them. Small, held, already drunk.
  const cupMat = washMaterial({ color: ACCENT, flat: true });
  const cups = [];
  const CUP_AT = [[0.35, 0.72], [0.62, 0.34], [.76, 0.86]];
  for (const [i, [cx, cz]] of CUP_AT.entries()) {
  const pivot = new THREE.Group();       // tips about its own foot
  pivot.name = 'cup';
  pivot.position.set(cx, 0.045, cz);
  pivot.rotation.y = i * 1.1;
  const profile = [
  [0.001, 0.000], [0.035, 0.000], [0.032, 0.012], [0.052, 0.055],
  [0.060, 0.090], [0.056, 0.092], [0.048, 0.058], [0.028, 0.014], [0.000, 0.010],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 9), cupMat);
  cup.name = 'cup-body';
  pivot.add(cup);
  scene.add(pivot);
  cups.push({ pivot, tippedAt: -99 });
  }
  
  const world = composeWorld(scene, {
  view: CAM,
  // not ID: the scatter was re-rolled to sit around the planted tree above, and
  // 4 is the roll that landed. groundSeed stays 21 — the terrain is shared,
  // only the things standing on it moved.
  seed: 4,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.1),
  { x: hut.position.x, z: hut.position.z, r: 2.7 },
  { at: mat, r: 2.2 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { x: hut.position.x, z: hut.position.z, r: 1.8 },
  { at: mat, r: 1.7 },
  ],
  });

  // forgiving targets, because a wine cup is 6cm across
  for (const c of cups) {
  const hit = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.16, 0.22, 6),
  new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'cup-hit';
  hit.position.y = 0.09;
  c.pivot.add(hit);
  c.hit = hit;
  }
  
  // ---- the moment: they were empty already ------------------------------
  let camera = null;
  let clock = 0;
  let tipped = 0;
  let allDownAt = -99;
  
  input.onTap(() => {
  if (!camera) return;
  for (const c of cups) {
  if (c.tippedAt > -99) continue;
  if (!input.raycastFirst(camera, [c.hit])) continue;
  touched && touched();
  c.tippedAt = clock;
  tipped++;
  // ceramic, and lighter than you expected — but still a sound the tap
  // plainly caused; the first pass sat under the ambience
  audio && audio.knock({ force: 0.45, at: c.pivot.position });
  if (tipped === cups.length) allDownAt = clock;
  return;
  }
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  vase.update(dt, simTime);
  
  // once all three are down they lie a while, then stand back up
  if (allDownAt > -99 && clock - allDownAt > RIGHT_AFTER) {
  for (const c of cups) c.tippedAt = -99;
  tipped = 0;
  allDownAt = -99;
  }
  
  for (const c of cups) {
  const u = c.tippedAt > -99 ? clamp01((clock - c.tippedAt) / TIP) : 0;
  const e = u * u * (3 - 2 * u);
  c.pivot.rotation.z = -.8*(Math.PI / 2) * e;
  c.pivot.position.y = .045 + u*.03;
  }
  },
  fragment() {
  return { tipped, standing: cups.length - tipped };
  },
  dispose() {},
};
  },
};
