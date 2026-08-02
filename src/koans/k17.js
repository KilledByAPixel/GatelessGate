import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makeVeranda, makeMonk, makeLantern,
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
// FACE convention (atan2(dx, dz) turns local +z, the body's front, onto the
// target) — what faceMonk does, and what chu's hand-rolled turn below already
// did. It was aimMonk's (atan2(-dz, dx)), so Oshin faced a quarter turn off.
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
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
    const OSHIN_POS = new THREE.Vector3(3.1, 0, 1.6);
    chu.position.copy(CHU_POS);
    // A SEATED figure's visible front is local +z — the folded sleeves point
    // that way — so aimMonk (which turns local +x) left him reading a quarter
    // turn off, gazing past the yard instead of at the man he is calling
    // (Frank: "why is the guy looking over to the side?"). Turn his lap toward
    // Oshin directly, and bow about x (order YXZ: pitch inside the yaw) so the
    // lean goes the way he faces.
    chu.rotation.order = 'YXZ';
    chu.rotation.y = Math.atan2(OSHIN_POS.x - CHU_POS.x, OSHIN_POS.z - CHU_POS.z);
    // His staff rests on the boards beside him — the kit LAYS a seated
    // elder's staff down now, so the hand-placement that used to live here
    // (which only moved it clear of the hem, still upright) is gone: it
    // would have put the lying shaft back at y = 0, half sunk in the deck.
    scene.add(chu);

    // The reed mat that used to lie under him is GONE: the seated figure
    // brings its own zabuton now, and the two were nearly the same size, so
    // stacked they read as one thing doubled (Frank: "an extra thin
    // rectangular shaped thing below this guy... I don't know why there needs
    // to be the art-directed cushion any more — just the regular default
    // cushion would probably be fine").

    // OSHIN, across the yard, turned to his own work — the whole point is that
    // he is not already looking
    // `bow: true` gives him the sash hinge without touching his arms — see the
    // update loop, where the roll this used to be is corrected.
    const oshin = makeMonk({ height: 1.58, bow: true });
    const oshinWaist = oshin.getObjectByName('waist');
    oshin.position.copy(OSHIN_POS);
    const AWAY = bearing(OSHIN_POS, { x: 6.5, z: 3.0 });
    const TOWARD = bearing(OSHIN_POS, CHU_POS);
    oshin.rotation.y = AWAY;
    scene.add(oshin);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(1.4, 0, -3.2);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { at: veranda, r: 3.8 },
        { x: OSHIN_POS.x, z: OSHIN_POS.z, r: 1.2 },
        { at: lantern, r: 0.9 },
        { x: 0.4, z: -0.6, r: 2.6 },      // the courtyard between them stays open
      ],
      // Grass is cleared UNDER THE PLATFORM and nowhere else. There used to be
      // a second circle out at (0.4, -0.6) to keep the courtyard between the
      // two of them open, and with nothing standing there it read as a bald
      // patch of ground in the middle of the meadow (Frank: "the grass is
      // emptied out in a weird circle... it's kind of between them, but it
      // should be just where the platform is"). The veranda's own circle is
      // centred on the veranda now, not offset forward of it.
      grassKeepout: [
        { at: veranda, r: 3.0 },
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
        // Standing: bend at the sash. This was rotation.z on the whole figure,
        // with a comment claiming local +x was his facing — a leftover from
        // before the aimMonk audit. Bodies front +z, so a z-roll listed him
        // sideways while his teacher bowed back correctly on x.
        oshinWaist.rotation.x = BOW * lean;
        chu.rotation.x = BOW * 0.7 * lean;          // seated front is +z: pitch, inside the yaw
        if (done) { bowAt = -99; calls = 0; answered = 0; }
      },
      fragment() {
        return { calls, answered, bowing: +Math.abs(oshinWaist.rotation.x).toFixed(4) };
      },
      dispose() {},
    };
  },
};
