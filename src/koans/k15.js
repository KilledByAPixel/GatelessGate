import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT } from '../palette.js';
import {
  composeWorld, makePath, makeGate, makeLantern, makeMonk, faceMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 15;

// Tozan answers every question with a fact — which village, which temple, which
// date — and Ummon tells him he has earned three blows with a stick, but that
// today he is forgiven. The blows are the most famous thing in the case and
// they never land.
//
// So the diorama is the gate at evening with Tozan bowing in it, and the
// interaction is the beating: touch the gate and three strikes sound, spaced
// out, on nothing at all. The stick in Ummon's hand never moves. It is the
// only vermillion thing in the scene, and it stays exactly where it is.

const BLOWS = 3;
const BLOW_GAP = 0.62;
// Radians at the waist. Deeper than a nod — he is bowing to the master who has
// just told him he has earned a beating — and held, not animated: the movement
// in this case is the three blows, and they land on nothing.
const BOW = 0.55;

export default {
  id: ID,
  slug: 'tozan-s-three-blows',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.20', 'gate', 'music'],
  camera: { distance: 11.0, target: [0.6, 1.6, -0.8], azimuth: 0.50, polar: 1.25 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    // evening: the fog closes in earlier than anywhere else in the book
    scene.fog = new THREE.FogExp2(PAPER, 0.040);
    scene.add(makeLights());

    const path = makePath({ from: [3.2, 8.6], to: [-1.4, -18], width: 1.5, seed: ID, groundSeed: 21, wander: 0.7 });
    scene.add(path);

    // UMMON'S GATE, straddling the road
    const gate = makeGate({ width: 2.8, height: 3.0 });
    gate.position.set(0.5, 0, -1.2);
    gate.rotation.y = -0.16;
    scene.add(gate);

    // TOZAN, in the gateway, bowing — he came back the next day to ask why.
    // He used to bow by rotation.z on the whole figure, which is a ROLL: he
    // listed sideways like a man on a slope, not a man bowing (Frank: "in 15
    // he is also tilted wrong and should be bowing pose" — the same fault k32's
    // philosopher had). pose 'bow' hinges him at the sash instead, and a number
    // sets how far: bodies front local +z, so the waist's turn about x carries
    // the chest forward, along whatever way faceMonk has already turned him.
    const tozan = makeMonk({ height: 1.58, pose: 'bow', bow: BOW });
    tozan.position.set(1.5, 0, 0.9);
    faceMonk(tozan, { x: -1.4, z: -1.8 });
    scene.add(tozan);

    // UMMON, beyond the gate, holding the stick he is not going to use
    const ummon = makeMonk({ height: 1.68, elder: true });
    ummon.position.set(-1.4, 0, -1.8);
    faceMonk(ummon, tozan.position);
    const stick = ummon.getObjectByName('staff');
    if (stick) stick.material = toonMaterial({ color: ACCENT, flat: true });
    scene.add(ummon);

    const lantern = makeLantern({ height: 1.2 });
    lantern.position.set(2.6, 0, -2.4);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...path.keepout(24, 1.3),
        { at: gate, r: 2.4 },
        { at: tozan, r: 1.1 },
        { at: ummon, r: 1.1 },
        { at: lantern, r: 0.9 },
      ],
      grassKeepout: [
        ...path.keepout(26, 0.95),
        { at: gate, r: 1.2 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [tozan.position, 0.66, 0.5, 0.42],
      [ummon.position, 0.7, 0.54, 0.42],
      [gate.position, 1.5, 0.5, 0.30],
      [lantern.position, 0.4, 0.32, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 3.2, 0.9),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'gate-hit';
    hit.userData.noOutline = true;
    hit.position.set(0.5, 1.6, -1.2);
    hit.rotation.y = -0.16;
    scene.add(hit);

    // ---- the moment: three blows, forgiven -------------------------------
    let camera = null;
    let clock = 0;
    let struck = 0;              // blows delivered in the current beating
    let startedAt = -99;
    let beatings = 0;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (startedAt > -99 && struck < BLOWS) return;      // let the three finish
      startedAt = clock;
      struck = 0;
      beatings++;
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        if (startedAt > -99 && struck < BLOWS && clock - startedAt >= struck * BLOW_GAP) {
          struck++;
          // wood on wood, out of the empty air. The stick has not moved.
          audio && audio.knock({ force: 0.85 });
        }
      },
      fragment() {
        return { beatings, struck, forgiven: struck >= BLOWS };
      },
      dispose() {},
    };
  },
};
