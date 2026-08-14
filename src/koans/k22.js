import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeGate, makeFlag, makeMonk, faceMonk, makeLantern,
  makeLights, makeFurin, makeSign,
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
const CAM = { distance: 10.6, target: [0.4, 1.9, -0.2], heading: 33, pitch: 12.5 };
  export default {
  id: ID,
  slug: 'mahakashapa-s-preaching-sign',
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
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -13, pitch: 39 } }));
  
  // The road is plain stone. It carried the seal for a while (case 29 owns the
  // red flag, so this case painted its banner plain and warmed the road up to
  // the gate instead) — but once the case grew a sign of its own, the sign was
  // the better place for it: the koan is ABOUT taking one sign down and putting
  // another up, and a red board says that where a red road only said "here is a
  // road". See THE BOARD below.
  const path = makePath({ from: [-3.8, 8.4], to: [1.2, -22], width: 1.5, seed: ID, groundSeed: 21, wander: 2.7 });
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
  kashapa.position.set(-1.2, 0, -.5);
  scene.add(kashapa);
  
  const ananda = makeMonk({ height: 1.60 });
  ananda.position.set(1.1, 0, .9);
  scene.add(ananda);
  faceMonk(kashapa, ananda.position);
  faceMonk(ananda, kashapa.position);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(-3.3, 0, 0.6);
  scene.add(lantern);

  // THE BOARD, AND THE SEAL. A sign on a post, blank — the case turns on taking
  // one sign down and putting another up, and an empty board is the only honest
  // way to draw a sign whose whole point is WHOSE name is on it. Red, because
  // this is the thing the koan is about: the road wore the accent first and only
  // ever said "here is a road" with it (see the path above). One hue per koan,
  // so the road went back to stone in the same breath — the seal MOVED, it was
  // not added.
  //
  // It stands out past the banner on the yard's near flank, quartered toward
  // the camera so the board's face and the post's edge both read. Worth knowing
  // if it is ever moved back inboard: at 1.9 it is short enough to sit under
  // the flag's cloth, and placed on that side at plain-stone tone it landed
  // within ~3° of the flagpole on a portrait stage and the two uprights read as
  // one bolted object. The accent is most of what separates them now, so the
  // colour and the position are holding hands here.
  const sign = makeSign({ height: 1.9, width: 1.2, color: ACCENT });
  sign.position.set(-2.9, 0, -1.1);
  sign.rotation.y = 0.62;
  scene.add(sign);
  
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
  seed: ID+3,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...path.keepout(24, 1.3),
  { x: gate.position.x, z: gate.position.z, r: 2.4 },
  { x: flag.group.position.x, z: flag.group.position.z, r: 1.4 },
  { at: kashapa, r: 1.2 },
  { at: ananda, r: 1.2 },
  { at: lantern, r: 0.9 },
  { at: sign, r: 1.0 },
  ],
  grassKeepout: [
  ...path.keepout(26, 0.95),
  { x: gate.position.x, z: gate.position.z, r: 1.2 },
  { at: sign, r: 0.5 },
  ],
  });

  // ---- the moment: the sign turns, and the banner stills ----------------
  // TWO THINGS ANSWER HERE, and they are different objects. The BANNER on the
  // pole is the flag: brush it and it ruffles, touch it and it stops flying —
  // a sign that has stopped flying is a hall with no teacher named on it, which
  // is the case. The SIGN is the red board standing beside it, and touching
  // that turns it half a round to face the other way; touch it again and it
  // goes on round the same way, half a turn each time.
  //
  // Same direction matters. Alternating would read as undoing the last tap;
  // going on round reads as a sign being turned to face away from you, and then
  // turned again, and never once saying anything different.
  //
  // The turn was briefly wired to the FLAG's pole, which was simply the wrong
  // object — the banner already had a job, and the sign, which is the one red
  // thing on the page, had none.
  const HALF = Math.PI;
  const TURN = 1.6;                  // seconds for one half-turn — slow enough to watch
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const signYaw0 = sign.rotation.y;
  const signTargets = [];
  sign.traverse((o) => { if (o.isMesh) signTargets.push(o); });
  let camera = null;
  let clock = 0;
  let stills = 0;
  let turns = 0;
  // null, not -99: ease() would be 1 before anything had been touched and the
  // sign would be born already half-turned. It rests square and waits.
  let turnAt = null;
  let turnFrom = 0;                  // radians already turned when this one began
  let signYaw = 0;                   // ...and where it is now, relative to rest
  
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
  if (chimeHit) { touched && touched(); furin.ring(0.75, chimeHit.tube); return; }
  // THE SIGN, probed before the banner. It is a solid board and the banner is a
  // big flapping sheet behind it, so a tap meant for the board must never be
  // eaten by cloth that happens to be streaming across it that frame.
  if (input.raycastFirst(camera, signTargets)) {
  touched && touched();
  turns++;
  turnFrom = signYaw;
  turnAt = clock;
  // a board swinging round on its post — wood, not a bell.
  audio && audio.knock({ force: 1.5, at: sign.getWorldPosition(scratchPos) });
  return;
  }
  if (!input.raycastFirst(camera, [flag.mesh])) return;
  touched && touched();
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
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);
  flag.update(dt, simTime);
  // THE TURN. Eased from wherever the last one had got to, so a tap landing
  // mid-swing carries on from there instead of snapping back to a whole
  // number of half-turns. It only ever adds, so the sign keeps going round
  // the same way however often it is touched.
  signYaw = turnAt === null ? 0 : turnFrom + HALF * ease((clock - turnAt) / TURN);
  sign.rotation.y = signYaw0 + signYaw;
  furin.setWindLevel(flag.windLevel());
  furin.update(dt, simTime);
  },
  fragment() {
  return {
  stills,
  turns,
  // in half-turns, so a whole number means it is sitting still
  turned: +(signYaw / HALF).toFixed(3),
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
