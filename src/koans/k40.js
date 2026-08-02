import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeMonk, aimMonk, faceMonk } from '../kit/monk.js';
import { makeAssembly } from '../kit/assembly.js';
import { makeHut } from '../kit/hut.js';
import { makeVase } from '../kit/vase.js';
import { makeLights } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 40;

// THE BEFORE, NEVER THE AFTER.
//
// The case ends with a vase on its side and a monastery decided. The diorama
// stages the moment it all still hangs on: the vase STANDS, alone on a patch
// of bare ground, and everything else in the scene is arranged around the fact
// of it. Hyakujo to one side, sleeve raised — the question is mid-air. The
// assembly seated in an arc, every face turned to the vase. And one monk of
// that crowd standing, a step forward of the others: the cooking monk, about
// to do the thing nobody labels. No spilled water. Nothing decided.
//
// THE RED SEAL is the vase and only the vase — small and held at full ACCENT,
// which glows on its own (SEAL_GLOW in render/toon.js; nothing added here).
//
// The staging borrows k14's orbit lesson: the crowd is strung along a diagonal
// roughly square to the camera's home line, with the vase forward of everyone
// toward the lens, so no stretch of the orbit hides the one thing the case is
// about behind a wall of ink.

const VASE = { x: 1.5, z: 0.5 };      // forward of everyone, nearest the lens
const VASE_H = 0.55;
const HALL = { x: -1.0, z: -6.2 };    // the new monastery's stand-in, far back
const HYAKUJO = { x: -0.45, z: 1.55 };   // beside the vase, not behind it —
                                          // the red must sit against paper and
                                          // grass, never against a black robe
const ISAN = { x: 2.45, z: -0.5 };    // of the crowd, one step out of it
const CROWD = { x: 4.15, z: -1.1 };   // where the arc's centroid should land
const ARC_R = 1.4;
const ARC_PULL = ARC_R * 0.81;        // mean(cos) over the 0.7π arc — see k14

export default {
  id: ID,
  slug: 'tipping-over-a-water-vase',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'music'],
  mood: 'yo',      // the kick is play, not violence
  // Closer than the standard shot: the thing this case turns on is 0.55 units
  // tall, and the courtyard framing loses it. Target height splits the
  // difference between the vase and the standing figures.
  camera: { distance: 10.8, target: [1.1, 1.0, -0.5], azimuth: 0.5, polar: 1.28 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // ---- the hall ---------------------------------------------------------
    // Set well back, open front toward the clearing: the gathering happens
    // OUTSIDE it, which is what makes the ground in front read as a courtyard.
    const hall = makeHut({ width: 3.2, height: 2.5, depth: 2.6, color: WASH.dark });
    hall.position.set(HALL.x, 0, HALL.z);
    hall.rotation.y = Math.atan2(VASE.x - HALL.x, VASE.z - HALL.z);
    scene.add(hall);

    // ---- the vase ---------------------------------------------------------
    // Alone on open ground, the way a test object is put down: nothing within
    // arm's reach of it. The bare pad under it is carved out of the grass
    // below (grassKeepout), not built — a clearing, not a plinth.
    const vase = makeVase({ height: VASE_H, color: ACCENT, seed: ID });
    vase.group.position.set(VASE.x, 0, VASE.z);
    scene.add(vase.group);

    // ---- Hyakujo ----------------------------------------------------------
    // The elder, staff planted, one sleeve raised toward the vase: the
    // question, still open. He stands aside so the reader's line to the vase
    // is his line to the vase.
    const hyakujo = makeMonk({ pose: 'point', height: 1.72, stout: 1.05, elder: true });
    hyakujo.position.set(HYAKUJO.x, 0, HYAKUJO.z);
    aimMonk(hyakujo, { x: VASE.x, z: VASE.z });
    scene.add(hyakujo);

    // ---- the assembly -----------------------------------------------------
    // Seated in a loose arc, every figure faced at the vase — the whole
    // monastery looking at one small red thing. makeAssembly fans onto the +z
    // side of its centre, so the centre is pushed back by ARC_PULL for the
    // crowd to land on the CROWD mark (k14's correction).
    const assembly = makeAssembly({
      count: 9, radius: ARC_R, spread: 1.0, seed: ID,
      center: [CROWD.x, CROWD.z - ARC_PULL],
      facing: [VASE.x, VASE.z],
    });
    scene.add(assembly);

    // ---- Isan -------------------------------------------------------------
    // One monk of the crowd on his feet, a step forward of the others, leaning
    // a few degrees toward the vase. Not labelled, not accented: the
    // composition says who he is — the only one already moving.
    const isan = makeMonk({ height: 1.58 });
    isan.position.set(ISAN.x, 0, ISAN.z);
    faceMonk(isan, { x: VASE.x, z: VASE.z });
    isan.rotation.z = -0.07;   // applied before the yaw: a lean toward what he faces
    scene.add(isan);

    // ---- the world --------------------------------------------------------
    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      // generous: nothing scattered may land in the clearing, the crowd, or
      // the hall
      keepout: [
        { x: HALL.x, z: HALL.z, r: 3.0 },
        { x: VASE.x, z: VASE.z, r: 1.6 },
        { x: HYAKUJO.x, z: HYAKUJO.z, r: 1.2 },
        { x: ISAN.x, z: ISAN.z, r: 1.1 },
        { x: CROWD.x, z: CROWD.z, r: 3.0 },
      ],
      // The examination yard is SWEPT. "Figures stand in grass" is the house
      // default and it is wrong here: Hyakujo has gathered the whole monastery
      // to watch a test, and that happens on the trodden ground before the
      // hall, not in waist-high meadow — at tuft height the vase all but
      // disappeared and the seated crowd read as heads floating in scrub. One
      // court-sized clearing spans the hall, the vase and the gathering; the
      // meadow starts where the occasion ends.
      grassKeepout: [
        { x: HALL.x, z: HALL.z, r: 2.4 },
        { x: (VASE.x + CROWD.x) / 2 - 0.6, z: (VASE.z + HALL.z) / 2, r: 4.6 },
        { x: VASE.x, z: VASE.z, r: 2.2 },
        { x: CROWD.x, z: CROWD.z, r: 2.6 },
      ],
    });

    for (const [x, z, rx, rz, op] of [
      [HYAKUJO.x, HYAKUJO.z, 0.72, 0.56, 0.42],
      [ISAN.x, ISAN.z, 0.62, 0.50, 0.42],
      [VASE.x, VASE.z, 0.34, 0.28, 0.40],
      [HALL.x, HALL.z, 2.10, 1.70, 0.30],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = x; s.position.z = z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: it rocks, and rights itself --------------------------
    // Touch the vase and it tips a few degrees and wobbles back upright. That
    // is all, and it is the whole case held open: the reader's tap is Isan's
    // foot NOT quite happening. It cannot be knocked over — makeVase caps the
    // tilt far short of the tipping point however often it is tapped.
    let camera = null;
    const vaseMeshes = [];
    vase.group.traverse((o) => { if (o.isMesh && !o.userData.isOutline) vaseMeshes.push(o); });

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, vaseMeshes)) vase.nudge();
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);   // the meadow's wind
        vase.update(dt, simTime);    // the wobble, when there is one
      },
      fragment() {
        return {
          nudges: vase.nudges(),
          rock: +vase.tilt().toFixed(4),
          rocking: vase.rocking(),
        };
      },
      dispose() {},
    };
  },
};
