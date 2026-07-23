import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makeVeranda, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 17;

// Chu called his attendant three times. Three times Oshin answered. Then Chu
// said he ought to apologize for all the calling — but really Oshin ought to
// apologize to him.
//
// So the diorama is a courtyard with a teacher on one side and an attendant on
// the other, and the interaction is the case itself, played out at your own
// pace: call, and he answers. Call again, and he answers again. After the
// third the two of them bow to each other, which settles nothing, and the
// courtyard goes back to how it was so you can do the whole thing over.

const ANSWER_DELAY = 0.55;      // he is across a courtyard, not beside you
const BOW = 0.16;               // radians of lean
const BOW_IN = 1.1, BOW_HOLD = 1.9, BOW_OUT = 1.2;

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const bearing = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default {
  id: ID,
  slug: 'the-three-calls-of-the-emperor-s-teacher',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.15', 'call', 'music'],
  camera: { distance: 11.0, target: [0.6, 1.3, -0.4], azimuth: 0.60, polar: 1.26 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // the teacher's veranda, back-left, open onto the courtyard
    const veranda = makeVeranda({ width: 4.2, depth: 3.4, height: 3.0 });
    veranda.position.set(-2.6, 0, -3.6);
    veranda.rotation.y = 0.5;
    scene.add(veranda);

    // CHU, seated on the boards — HE is the seal. There was nothing else in the
    // courtyard that wanted to be red (it is two people and a call), so the
    // teacher on the platform takes the accent; deepened, since a whole figure
    // at full accent glares (Frank's call).
    const chu = makeMonk({ height: 1.6, pose: 'sit', elder: true, color: ACCENT_DEEP });
    const CHU_POS = new THREE.Vector3(-1.9, 0.34, -2.7);
    chu.position.copy(CHU_POS);
    scene.add(chu);

    // a plain reed mat under him now, not a red one
    const mat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.035, 4),
      toonMaterial({ color: WASH.dry, flat: true }));
    mat.name = 'mat';
    mat.rotation.y = Math.PI / 4;
    mat.position.set(CHU_POS.x, CHU_POS.y + 0.018, CHU_POS.z);
    scene.add(mat);

    // OSHIN, across the yard, turned to his own work — the whole point is that
    // he is not already looking
    const oshin = makeMonk({ height: 1.58 });
    const OSHIN_POS = new THREE.Vector3(3.1, 0, 1.6);
    oshin.position.copy(OSHIN_POS);
    const AWAY = bearing(OSHIN_POS, { x: 6.5, z: 3.0 });
    const TOWARD = bearing(OSHIN_POS, CHU_POS);
    oshin.rotation.y = AWAY;
    scene.add(oshin);
    aimMonk(chu, OSHIN_POS);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(1.4, 0, -3.2);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: -2.6, z: -3.6, r: 3.8 },
        { x: OSHIN_POS.x, z: OSHIN_POS.z, r: 1.2 },
        { x: 1.4, z: -3.2, r: 0.9 },
        { x: 0.4, z: -0.6, r: 2.6 },      // the courtyard between them stays open
      ],
      grassKeepout: [
        { x: -2.6, z: -3.0, r: 2.8 },
        { x: 0.4, z: -0.6, r: 2.4 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [OSHIN_POS, 0.64, 0.5, 0.42],
      [veranda.position, 2.4, 1.9, 0.28],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.6, 1.5),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'chu-hit';
    hit.userData.noOutline = true;
    hit.position.set(CHU_POS.x, CHU_POS.y + 0.6, CHU_POS.z);
    scene.add(hit);

    // ---- the moment: call, and be answered -------------------------------
    let camera = null;
    let clock = 0;
    let calls = 0;
    let pending = -1;          // sim time an answer is due
    let answered = 0;
    let bowAt = -99;

    input.onTap(() => {
      if (!camera) return;
      if (!input.raycastFirst(camera, [hit])) return;
      if (bowAt > -99 && clock - bowAt < BOW_IN + BOW_HOLD + BOW_OUT) return;  // let it finish
      if (pending >= 0) return;                     // one call at a time
      calls++;
      pending = clock + ANSWER_DELAY;
      audio && audio.knock({ force: 0.8 });         // "Oshin."
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        const step = Math.max(0, dt || 0);

        // the answer, a beat after the call
        if (pending >= 0 && clock >= pending) {
          pending = -1;
          answered++;
          audio && audio.knock({ force: 0.35 });    // "Yes."
          if (answered >= 3) bowAt = clock;
        }

        // he comes round a third of the way at each call, and all the way home
        // again once the bowing is done
        const bowU = bowAt > -99 ? (clock - bowAt) : -1;
        const done = bowU > BOW_IN + BOW_HOLD + BOW_OUT;
        const want = done ? AWAY : AWAY + wrapPi(TOWARD - AWAY) * Math.min(1, answered / 3);
        oshin.rotation.y += wrapPi(want - oshin.rotation.y) * (1 - Math.exp(-3.0 * step));

        // and then they bow to each other, which settles nothing
        let lean = 0;
        if (bowU >= 0 && !done) {
          if (bowU < BOW_IN) lean = clamp01(bowU / BOW_IN);
          else if (bowU < BOW_IN + BOW_HOLD) lean = 1;
          else lean = 1 - clamp01((bowU - BOW_IN - BOW_HOLD) / BOW_OUT);
          lean = lean * lean * (3 - 2 * lean);
        }
        oshin.rotation.z = -BOW * lean;             // local +x is his facing: lean along it
        chu.rotation.z = -BOW * 0.7 * lean;
        if (done) { bowAt = -99; calls = 0; answered = 0; }
      },
      fragment() {
        return { calls, answered, bowing: +Math.abs(oshin.rotation.z).toFixed(4) };
      },
      dispose() {},
    };
  },
};
