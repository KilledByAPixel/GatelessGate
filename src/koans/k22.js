import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeGate, makeFlag, makeMonk, faceMonk, makeLantern,
  makeLights, addOutlines, makeFurin,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 22;

// The cloth is nested under flag.group, so its LOCAL position (poleH - 0.06)
// is not where it sounds from once the group is placed in the scene — one
// scratch vector, reused at the tap site below.
const scratchPos = new THREE.Vector3();

// Ananda asks what else the Buddha handed on besides the robe. Kashapa answers
// by saying his name — "Ananda." "Yes, brother." — and then tells him to take
// down the preaching sign and put up his own. The whole transmission happens
// in the space of being called and answering.
//
// The preaching sign is the flagpole outside the hall, so this case is the
// book's second cloth scene after 29, and it uses the same flag: the kit piece
// carries its own hover-ruffle and its own click-to-still, so the behaviour
// arrived with the component rather than being written again here. That is the
// reuse rule doing exactly what it was written for.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 11.5, target: [0.9, 1.9, -0.2], heading: 31.5, pitch: 19 };
  export default {
  id: ID,
  slug: 'kashapa-s-preaching-sign',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // 'furin' names the single tube hung under the gate's own lintel — a
  // temple gate is exactly where a real fūrin hangs, and this case already
  // has a flag whose wind is the reader's to toggle: the chime rides the
  // SAME wind (see furin.setWindLevel(flag.windLevel()) below), so stilling
  // the sign also stills the small voice answering it, the way case 29's
  // chimes and flag already agree to.
  ambience: ['wind:0.30', 'flag', 'furin', 'music'],
  mood: 'yo',      // "This spring does not belong to the ordinary season."
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights());
  
  // THE PATH is the seal here (Frank's experiment): case 29 already owns the
  // red flag, so this case keeps the flag but paints it plain, and lets the
  // road up to the gate be the one warm thing instead.
  const path = makePath({ from: [-3.8, 8.4], to: [1.2, -22], width: 1.5, seed: ID, groundSeed: 21, wander: 2.7, color: ACCENT });
  scene.add(path);
  
  const gate = makeGate({ width: 2.9, height: 3.1 });
  gate.position.set(-1.3, 0, -3.4);
  gate.rotation.y = 0.24;
  scene.add(gate);
  
  // THE PREACHING SIGN — a plain banner now, drawn up close beside the gate
  // where a hall's sign would actually stand. It still ruffles and stills
  // (the flag kit carries those); it is simply no longer the red one.
  const flag = makeFlag({ seed: ID, poleH: 3.4, width: 1.4, color: WASH.dark });
  flag.group.position.set(1.5, 0, -2.4);
  scene.add(flag.group);
  
  // KASHAPA, who is handing it over, and ANANDA, who has just said yes
  const kashapa = makeMonk({ height: 1.68, elder: true });
  kashapa.position.set(-0.2, 0, 1.5);
  scene.add(kashapa);
  
  const ananda = makeMonk({ height: 1.60 });
  ananda.position.set(1.1, 0, 2.9);
  scene.add(ananda);
  faceMonk(kashapa, ananda.position);
  faceMonk(ananda, kashapa.position);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(-3.3, 0, 0.6);
  scene.add(lantern);
  
  // One small tube on a cord, hung under the gate's own flat lintel span
  // (|x| < width*0.364 stays flush underside — k29's own derivation of
  // that fraction). A single quiet voice, not a cluster: the preaching
  // sign is the one thing changing hands here, and a busy chorus would
  // upstage the plain banner it hangs beside.
  const furin = makeFurin({
  tubes: 1, seed: 22,
  onStrike: (_, force, pos) => audio && audio.chimeStrike({ tube: 3, force, at: pos }),
  });
  furin.group.position.set(0.5, 3.1, 0);
  gate.add(furin.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.3),
  { x: gate.position.x, z: gate.position.z, r: 2.4 },
  { x: flag.group.position.x, z: flag.group.position.z, r: 1.4 },
  { at: kashapa, r: 1.2 },
  { at: ananda, r: 1.2 },
  { at: lantern, r: 0.9 },
  ],
  grassKeepout: [
  ...path.keepout(26, 0.95),
  { x: gate.position.x, z: gate.position.z, r: 1.2 },
  ],
  });
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  // ---- the moment: the sign comes down ---------------------------------
  // Brush the banner and it ruffles; touch it and it stops flying. Both live
  // in the flag component (see case 29's note on restraint) — a stilled sign
  // is a hall with no teacher named on it, which is exactly the moment the
  // case is describing.
  let camera = null;
  let stills = 0;
  
  input.onHover(() => {
  if (!camera) return;
  const hit = input.raycastFirst(camera, [flag.mesh]);
  if (!hit) return;
  const local = flag.mesh.worldToLocal(hit.point.clone());
  flag.hoverAt(local.x, local.y);
  });
  
  input.onTap(() => {
  if (!camera) return;
  // the gate chime first: probed and returned on before the flag-mesh
  // check below, so ringing the chime never also toggles the wind
  const chimeHit = furin.pick(camera, input);
  if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
  if (!input.raycastFirst(camera, [flag.mesh])) return;
  const on = flag.toggleWind();
  stills++;
  // flag.group.position is the pole's GROUND base (y = 0); the sound
  // belongs to the cloth, which hangs near poleH. Read the cloth mesh's
  // world position rather than hard-coding poleH here, so this keeps
  // tracking the cloth if that offset ever changes.
  audio && audio.chimeStrike({ tube: on ? 3 : 0, force: 0.5, at: flag.mesh.getWorldPosition(scratchPos) });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  world.update(dt, simTime);
  flag.update(dt, simTime);
  // the chime rides the SAME wind the flag does, so stilling the sign
  // stills it too — case 29's own rule for a hanging voice sharing a
  // scene with a wind toggle
  furin.setWindLevel(flag.windLevel());
  furin.update(dt, simTime);
  },
  fragment() {
  return {
  stills,
  windOn: flag.isWindOn(),
  windLevel: +flag.windLevel().toFixed(4),
  clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
  chimeStrikes: furin.strikes(),
};
      },
      dispose() {},
    };
  },
};
