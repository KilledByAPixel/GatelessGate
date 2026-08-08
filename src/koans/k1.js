import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeMonk, faceMonk, makeDog, makeHut, makeLantern,
  makeLights, addOutlines, tapMeshes, plantTree,
} from '../kit/index.js';

const ID = 1;
const FOG_BASE = 0.030;
const FOG_MU = 0.235;    // thick enough to swallow the world whole
const MU_DUR = 4.4;      // seconds for the full breath

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.8, target: [1.35, 1.35, 0.3], heading: 18.5, pitch: 11 };
  export default {
  id: ID,
  slug: 'joshu-s-dog',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, FOG_BASE);
  scene.add(makeLights());
  
  const path = makePath({ from: [1.2, 9], to: [1.2, -34], width: 1.7, seed: 13, groundSeed: 21, wander: 3.1 });
  scene.add(path);
  
  // Joshu's hermitage, back off the road behind him — the place the monk
  // walked here to reach (the opening page was two figures and a dog in an
  // empty meadow; Frank: "scene is boring, add more, maybe a hut"). The
  // path samples at z≈-4.5 put the road at x≈0.5, so the hut at -3.8 keeps
  // a clear verge between its threshold and the traffic.
  const HUT = { x: -3.8, z: -4.5 };
  const hut = makeHut({ width: 3.0, height: 2.3, depth: 2.4, chimes:4});
  hut.position.set(HUT.x, 0, HUT.z);
  hut.rotation.y = 0.9;
  scene.add(hut);
  
  // and a stone lantern at the road's edge opposite — the pair of verticals
  // that make the spot a PLACE on the road rather than a stretch of it
  const LANTERN = { x: 1.5, z: -2.0 };
  const lantern = makeLantern({ height: 1.15 });
  lantern.position.set(LANTERN.x, 0, LANTERN.z);
  //scene.add(lantern);
  
  // Old Joshu sits off the road; the monk stands before him with the question.
  const mp = path.sample(0.19);
  const joshu = makeMonk({ pose: 'sit', elder: true, height: 1.72 });
  joshu.position.set(mp.x - mp.perp.x * 1.25, 0, mp.z - mp.perp.z * 1.45);
  faceMonk(joshu, { x: mp.x + mp.perp.x * 1.3, z: mp.z + mp.perp.z * 1.3 });
  
  const monk = makeMonk({ height: 1.6 });
  monk.position.set(mp.x + mp.perp.x * 1.0, 0, mp.z + mp.perp.z * 0.85);
  faceMonk(monk, joshu.position);
  scene.add(joshu, monk);
  
  plantTree(scene, { x: 3.2, z: -.4, height: 4.4 });
  
  // The dog: nearer the camera than anything else, and — alone in the scene —
  // unfogged, so when the world is swallowed it is what remains.
  const dog = makeDog({ height: 0.6, color: ACCENT });   // the seal of this koan
  const dp = path.sample(0.145);          // near the pair, inside the shared camera's frame
  dog.position.set(dp.x - .7, 0, dp.z - 2.7);
  dog.rotation.y = dp.heading + 2.4;      // looking back up the road at them
  dog.traverse((o) => {
  if (!o.isMesh) return;
  o.material = o.material.clone();
  o.material.fog = false;
  });
  scene.add(dog);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 1,
  groundSeed: 21,
  keepout: [
  ...path.keepout(26, 1.1),
  { x: mp.x, z: mp.z, r: 2.6 },
  { x: dog.position.x, z: dog.position.z, r: 1.0 },
  { x: HUT.x, z: HUT.z, r: 3.0 },
  { x: LANTERN.x, z: LANTERN.z, r: 0.9 },
  ],
  // Joshu and the dog sit in the grass; the hut's own floor and the
  // lantern's base cover theirs
  grassKeepout: [
  ...path.keepout(26, 1.0),
  { x: joshu.position.x, z: joshu.position.z, r: 1.6 },
  { x: HUT.x, z: HUT.z, r: 1.9 },
  { x: LANTERN.x, z: LANTERN.z, r: 0.4 },
  ],
  });
  
  addOutlines(scene, { width: 0.035, wobble: 0.7 });
  
  // ---- the moment: Mu -------------------------------------------------
  // Touch the dog and the world empties. The fog swells until every tree,
  // mountain and figure is gone into the paper, holds a beat, then breathes
  // back. Nothing is announced; you either find it or you don't.
  let camera = null;
  let muPhase = -1;      // -1 idle, otherwise seconds elapsed
  let mu = 0;            // 0..1 how far the world has gone
  
  const hitTargets = tapMeshes(dog);
  
  input.onTap(() => {
  if (!camera || muPhase >= 0) return;
  const hit = input.raycastFirst(camera, hitTargets);
  if (!hit) return;
  muPhase = 0;
  // Not a strike — nothing here is touched. The world thins away and
  // comes back, and the sound is that shape: one long breath over the
  // whole gesture. There was no voice in the palette that was not an
  // impact, which is why this case was silent for so long.
  audio && audio.breath({ force: 0.8, dur: MU_DUR * 0.8, at: hit.point });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);
  if (muPhase >= 0) {
  muPhase += dt;
  const t = muPhase / MU_DUR;
  if (t >= 1) { muPhase = -1; mu = 0; }
  else if (t < 0.36) mu = t / 0.36;             // the world thins away
  else if (t < 0.56) mu = 1;                     // nothing
  else mu = 1 - (t - 0.56) / 0.44;               // and returns
  const e = mu * mu * (3 - 2 * mu);
  scene.fog.density = FOG_BASE + (FOG_MU - FOG_BASE) * e;
  }
  },
  fragment() {
  return { mu: +mu.toFixed(4), fog: +scene.fog.density.toFixed(4) };
  },
  dispose() {},
};
  },
};
