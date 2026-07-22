import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, INK, ACCENT, ACCENT_DEEP, GRAY_DARK } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makeMonk, aimMonk } from '../kit/monk.js';
import { makeOak } from '../kit/oak.js';
import { makeCliff } from '../kit/cliff.js';
import { makeHangingMonk } from '../kit/hangingmonk.js';
import { makeLights, toonMaterial } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';

const ID = 5;

// The staging. A meadow that simply stops: a broken rock lip down the west
// side, mist where ground ought to be, and one grey oak leaning its stout
// limb out over the nothing. From the limb, by his teeth, hangs the man —
// vertical, arms at his sides, feet together, as composed as it is possible
// to be while hanging from a tree by your teeth. On the safe grass below, the
// questioner has his sleeve up: "Why did Bodhidharma come to China?" The
// man's sedge hat sits upright at the edge of the drop where it landed.
// Nobody answers anything.
const CLIFF = { x: -3.4, z: -2.0, yaw: Math.PI / 2 };   // void faces -x
// seed 13 at this yaw, from a scan of eighty: widest gap between the crown's
// worst lobe and the hanging man (1.55 — he can take his fullest swing and
// still not brush a leaf), branch joint buried 0.28 into foliage, and the
// crown overhanging the lip by 1.5 so the tree itself leans out over nothing.
const OAK = { x: -2.2, z: -2.0, height: 5.0, seed: 13, yaw: 4.9 };
const BRANCH = { base: [-2.35, 3.34, -2.0], len: 3.9, tilt: 0.062 };
const QUESTIONER = { x: -3.0, z: -0.4 };
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

  // The subject is UP: the frame pivots near branch height so the dangler and
  // the questioner below him hold the picture together, with the void taking
  // the left of frame. Azimuth home looks northwest from the meadow side, so
  // the man hangs against mist rather than against his own tree.
  // Nearly due south, deliberately: the branch reaches WEST over the void, so
  // the stock south-east azimuth looked THROUGH the canopy and the man was a
  // red sliver at its rim. From here the composition reads left to right —
  // void, the dangling man in profile against the mist, the limb carrying him
  // back into the crown, the questioner below. The builder's clearance check
  // measured mesh-to-mesh distance, not the sightline; this is the sightline.
  camera: { distance: 13.5, target: [-3.6, 2.6, -1.6], azimuth: 0.10, polar: 1.25 },

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
    const grip = [gx, gy - gripR, BRANCH.base[2]];
    const dangler = makeHangingMonk({ height: 1.6, color: ACCENT_DEEP, seed: ID });
    dangler.group.position.set(grip[0], grip[1], grip[2]);
    dangler.group.rotation.y = -0.45;   // faces his questioner, for what good it does
    scene.add(dangler.group);

    // ---- the questioner --------------------------------------------------
    // On the safe ground, under the tree, sleeve up. Politely.
    const questioner = makeMonk({ pose: 'point', height: 1.62 });
    questioner.position.set(QUESTIONER.x, 0, QUESTIONER.z);
    aimMonk(questioner, { x: grip[0], z: grip[2] });
    scene.add(questioner);

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
    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...cliff.footprint(0.9),
        ...cliff.voidFootprint(0.6),
        { x: OAK.x, z: OAK.z, r: 4.6 },
        { x: QUESTIONER.x, z: QUESTIONER.z, r: 1.2 },
        { x: HAT.x, z: HAT.z, r: 0.8 },
      ],
      grassKeepout: [
        ...cliff.footprint(0.15),
        ...cliff.voidFootprint(0.3),
        { x: HAT.x, z: HAT.z, r: 0.42 },
      ],
    });

    // shadows: the tree's, the questioner's, the hat's little one. None under
    // the hanging man — there is no ground under the hanging man.
    const canopyShadow = makeBlobShadow({ radiusX: 1.9, radiusZ: 1.6, opacity: 0.24 });
    canopyShadow.position.set(OAK.x - 0.35, 0.012, OAK.z - 0.45);
    scene.add(canopyShadow);
    const boleShadow = makeBlobShadow({ radiusX: 0.8, radiusZ: 0.7, opacity: 0.32 });
    boleShadow.position.set(OAK.x, 0.014, OAK.z);
    scene.add(boleShadow);
    for (const [x, z, rx, rz, op] of [
      [QUESTIONER.x, QUESTIONER.z, 0.65, 0.5, 0.42],
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
