import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, INK, ACCENT, ACCENT_DEEP, GRAY_DARK } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeOak } from '../kit/oak.js';
import { makeCliff } from '../kit/cliff.js';
import { makeHangingMonk } from '../kit/hangingmonk.js';
import { makeLights, toonMaterial } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 5;

// The staging. A meadow that genuinely stops: the ground mesh itself is carved
// away west of the broken rock lip (see the cut in build), falls a cliff face
// into a mist-filled gorge, and rises again as a fogged far wall. One grey oak
// leans its stout limb out over the drop. From the limb, by his teeth, hangs
// the man — alone; Frank cut the questioner, and the question lives in the
// text where it belongs — tipped back off his own bite, arms at his sides,
// feet together, as composed as it is possible to be while hanging from a
// tree by your teeth. His sedge hat sits upright on the grass at the edge
// where it landed. Nobody answers anything.
const CLIFF = { x: -3.4, z: -2.0, yaw: Math.PI / 2 };   // void faces -x
// seed 13 at this yaw, from a scan of eighty: widest gap between the crown's
// worst lobe and the hanging man (1.55 — he can take his fullest swing and
// still not brush a leaf), branch joint buried 0.28 into foliage, and the
// crown overhanging the lip by 1.5 so the tree itself leans out over nothing.
const OAK = { x: -2.2, z: -2.0, height: 5.0, seed: 13, yaw: 4.9 };
const BRANCH = { base: [-2.35, 3.34, -2.0], len: 3.9, tilt: 0.062 };
const HAT = { x: -2.55, z: -3.3 };

// the branch runs from its base toward -x, drooping a little at the tip
const branchDir = [-Math.cos(BRANCH.tilt), -Math.sin(BRANCH.tilt), 0];
const branchAt = (t) => [
  BRANCH.base[0] + branchDir[0] * t,
  BRANCH.base[1] + branchDir[1] * t,
  BRANCH.base[2],
];
const GRIP_ALONG = BRANCH.len - 0.35;   // the teeth set a little in from the tip

export default {
  id: ID,
  slug: 'kyogen-mounts-the-tree',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.24'],   // exposed height — more wind than a garden gets

  // Nearly due south, deliberately: the branch reaches WEST over the gorge, so
  // a south-east azimuth looks THROUGH the canopy and the man becomes a red
  // sliver at its rim. From here the frame reads left to right — the gorge,
  // the man in profile over it, the limb carrying him back into the crown —
  // and the polar sits a touch lower than house so the cliff face below the
  // lip is actually in shot, which is what makes the drop a drop.
  camera: { distance: 13.5, target: [-4.0, 2.3, -1.6], azimuth: 0.10, polar: 1.30 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // ---- the precipice ---------------------------------------------------
    const cliff = makeCliff({
      width: 11, drop: 5, depth: 2.2, seed: ID,
      origin: [CLIFF.x, CLIFF.z], yaw: CLIFF.yaw, groundSeed: 21,
    });
    cliff.position.set(CLIFF.x, 0, CLIFF.z);
    cliff.rotation.y = CLIFF.yaw;
    scene.add(cliff);

    // ---- the tree at its lip ---------------------------------------------
    // Grey through and through: k38's oak owns the red canopy, and this case's
    // one warm note hangs from the branch, not on it.
    const oak = makeOak({ height: OAK.height, seed: OAK.seed });
    oak.position.set(OAK.x, 0, OAK.z);
    oak.rotation.y = OAK.yaw;
    scene.add(oak);

    // The stout limb, authored here: makeOak grows where it pleases, and this
    // case needs one branch it can hang a man from — leaving the crown low
    // over the meadow and reaching well clear of the foliage, out over the
    // drop. Its base is buried in the canopy mass, so it reads as the tree's.
    const branchGeo = new THREE.CylinderGeometry(0.05, 0.115, BRANCH.len, 7);
    branchGeo.translate(0, BRANCH.len / 2, 0);
    const branch = new THREE.Mesh(branchGeo, toonMaterial({ color: GRAY_DARK, flat: true }));
    branch.name = 'branch';
    branch.position.set(...BRANCH.base);
    branch.rotation.z = Math.PI / 2 + BRANCH.tilt;
    scene.add(branch);

    // ---- the man ---------------------------------------------------------
    // The red seal: a person-sized mass, so the deep mix — and nothing else in
    // the scene carries any accent at all.
    const [gx, gy] = branchAt(GRIP_ALONG);
    const gripR = 0.115 + (0.05 - 0.115) * (GRIP_ALONG / BRANCH.len);
    // The bite point sits at the branch's SIDE, barely below its axis — not
    // under its belly. The mouth is the figure's origin, so from here the front
    // of his face presses into the wood and the crown tips back behind it: a
    // man hanging from his jaw. (Frank: "his head... biting into the branch,
    // tilted back a little like he's dangling.")
    const grip = [gx, gy - gripR * 0.2, BRANCH.base[2] + gripR * 0.55];
    const dangler = makeHangingMonk({ height: 1.6, color: ACCENT_DEEP, seed: ID });
    dangler.group.position.set(grip[0], grip[1], grip[2]);
    dangler.group.rotation.y = -0.45;   // three-quarter to the home lens
    scene.add(dangler.group);

    // No questioner. Frank cut him, and the cut is right: the case's question
    // hangs in the text beside the scene, and the picture is stronger as one
    // man alone over the drop with nobody to answer to. The whole predicament
    // is his.

    // and the hat that did not stay on, upright on the grass at the very edge
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.185 * 1.6, 0.10 * 1.6, 12),
      toonMaterial({ color: INK, flat: true }));
    hat.name = 'fallenhat';   // the questioner's own 'hat' stays on his head
    hat.position.set(HAT.x, 0.05 * 1.6, HAT.z);
    hat.rotation.y = 0.8;
    scene.add(hat);

    // ---- the world -------------------------------------------------------
    // Props stay off the rock and out of the air; grass grows to the lip and
    // no further. The meadow is only on the safe side, which is the point.
    //
    // The GORGE region gets its own keepout grid. The ground mesh is genuinely
    // sunk below the lip (see the cut after composeWorld), but placement math
    // — grass, rocks, ring trees — still samples the UNSUNK groundHeight
    // formula, so anything allowed to spawn west of the lip would hover five
    // units over the gorge floor. Three columns of circles blanket the sunk
    // bay; past them the recovery ramp has risen far enough that nothing reads
    // as floating under the fog.
    const gorgeMask = [];
    for (const mx of [-7.1, -13.3, -19.5]) {
      for (const mz of [-12, -7.5, -3, 1.5, 5]) {
        gorgeMask.push({ x: mx, z: mz, r: 3.4 });
      }
    }
    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...cliff.footprint(0.9),
        ...cliff.voidFootprint(0.6),
        ...gorgeMask,
        { x: OAK.x, z: OAK.z, r: 4.6 },
        { x: HAT.x, z: HAT.z, r: 0.8 },
      ],
      grassKeepout: [
        ...cliff.footprint(0.15),
        ...cliff.voidFootprint(0.3),
        ...gorgeMask,
        { x: HAT.x, z: HAT.z, r: 0.42 },
      ],
    });

    // ---- the cut: the precipice is REAL ----------------------------------
    // Frank's verdict on the painted version was flat: "there is no precipice."
    // He wanted a cliff face with the tree at its edge and the man over the
    // drop — so the ground itself now falls away. The case owns its scene, so
    // it can carve its own ground mesh without touching the shared kit: every
    // vertex west of the lip sinks on a steep smoothstep (the cliff face), runs
    // a gorge floor, and eases back up 13-22 units out — the far wall, already
    // deep in fog, with the mist banks lying in the chasm between. A bay window
    // along z confines the cut to the dressed run of lip stones, so beyond them
    // the meadow wraps around instead of tearing on an unrocked edge.
    const groundMesh = scene.getObjectByName('ground');
    const LIP_X = CLIFF.x - 0.35;
    const DROP = 5;
    const SS = (a, b, v) => {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const gpos = groundMesh.geometry.attributes.position;
    for (let i = 0; i < gpos.count; i++) {
      const wx = gpos.getX(i);
      const d = LIP_X - wx;                     // how far into the void
      if (d <= 0) continue;
      const wz = gpos.getZ(i);
      const bay = SS(-14, -9, wz) * (1 - SS(2, 6, wz));
      if (bay <= 0) continue;
      const sink = DROP * SS(0, 1.4, d) * (1 - SS(13, 22, d)) * bay;
      if (sink > 0) gpos.setY(i, gpos.getY(i) - sink);
    }
    gpos.needsUpdate = true;
    groundMesh.geometry.computeVertexNormals();

    // shadows: the tree's and the hat's little one. None under the hanging
    // man — there is no ground under the hanging man.
    const canopyShadow = makeBlobShadow({ radiusX: 1.9, radiusZ: 1.6, opacity: 0.24 });
    canopyShadow.position.set(OAK.x - 0.35, 0.012, OAK.z - 0.45);
    scene.add(canopyShadow);
    const boleShadow = makeBlobShadow({ radiusX: 0.8, radiusZ: 0.7, opacity: 0.32 });
    boleShadow.position.set(OAK.x, 0.014, OAK.z);
    scene.add(boleShadow);
    for (const [x, z, rx, rz, op] of [
      [HAT.x - 0.06, HAT.z - 0.05, 0.35, 0.3, 0.30],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = x; s.position.z = z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment ------------------------------------------------------
    // Touch him and he swings a little, and steadies, and goes on hanging.
    // He never answers. He never falls. That is the whole koan, and the scene
    // never says so.
    let camera = null;
    let sways = 0;
    const danglerMeshes = [];
    dangler.group.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline) danglerMeshes.push(o);
    });

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, danglerMeshes)) {
        dangler.sway(1);
        sways++;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:0.24']); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        world.update(dt, simTime);
        dangler.update(dt, simTime);
      },
      fragment() {
        return {
          sways,
          swing: +dangler.energy().toFixed(5),
          swinging: dangler.swinging(),
        };
      },
      dispose() {},
    };
  },
};
