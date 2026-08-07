import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, INK_LIT, ACCENT, ACCENT_DEEP, GRAY_DARK, WASH } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { mergeSimple } from '../kit/scatter.js';
import { noise1 } from '../util/noise.js';
import { makeOak } from '../kit/oak.js';
import { makeCliff } from '../kit/cliff.js';
import { makeHangingMonk } from '../kit/hangingmonk.js';
import { makeMonk, faceMonk } from '../kit/monk.js';
import { makeLights, toonMaterial } from '../render/toon.js';
import { makeBlobShadow } from '../render/blobshadow.js';
import { addOutlines } from '../render/outlines.js';
import { smoothstep as SS } from '../util/math.js';

const ID = 5;

// The staging. A meadow that genuinely stops: the ground mesh itself is carved
// away west of the broken rock lip (see the cut in build), falls a cliff face
// into a mist-filled gorge, and rises again as a fogged far wall. One grey oak
// leans its stout limb out over the drop. From the limb, by his teeth, hangs
// the man — tipped back off his own bite, arms at his sides, feet together, as
// composed as it is possible to be while hanging from a tree by your teeth.
// His sedge hat sits upright on the grass at the edge where it landed. And
// under the tree, on the ground, stands the one who came to ask (Frank, round
// 12): hands in his sleeves, looking up at a man who cannot open his mouth.
// Nobody answers anything.
const CLIFF = { x: -3.4, z: -2.0, yaw: Math.PI / 2 };   // void faces -x
// seed 13 at this yaw, from a scan of eighty: widest gap between the crown's
// worst lobe and the hanging man (1.55 — he can take his fullest swing and
// still not brush a leaf), branch joint buried 0.28 into foliage, and the
// crown overhanging the lip by 1.5 so the tree itself leans out over nothing.
const OAK = { x: -2.2, z: -2.0, height: 5.0, seed: 13, yaw: 4.9 };
const BRANCH = { base: [-2.35, 3.34, -2.0], len: 3.9, tilt: 0.062 };
const HAT = { x: -2.55, z: -3.3 };
// The questioner. East of the lip, because LIP_X is -3.75 and there is no
// ground west of it — and forward of the trunk on the camera's side, under the
// crown's outer reach. He is ink and so is the oak, so the spot is chosen for
// SILHOUETTE as much as for staging: a step left of the bole and a step nearer
// the lens, he stands against the pale lip stones instead of disappearing into
// the trunk behind him.
const ASKER = { x: -3.65, z: 0.55 };

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
  ambience: ['wind:0.24:broadleaf'],   // exposed height — more wind than a garden gets

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
    // drop 7 and the fog pushed down to -2.8 (Frank: "can we make the cliff
    // deeper?"): the kit's default hid everything below a shallow shelf in
    // mist, so most of "the drop" was implied. Now two courses of crags and
    // a tall band of bare carved earth show before the paper takes over.
    const cliff = makeCliff({
      width: 11, drop: 7, depth: 2.2, seed: ID, fogTop: -2.8,
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

    // Foliage at the very end of the limb (Frank: "otherwise it's kinda like
    // a stick hanging out"). Three lobes in the oak's own canopy grammar —
    // squashed dodecahedra, same deep wash — merged into one mesh, clustered
    // just PAST the grip so the branch finishes in leaves instead of a point.
    // All of them sit at or above the branch line and beyond his bite, so his
    // fullest swing still never brushes a leaf (the clearance the oak's crown
    // is held to, kept here by construction).
    const [tipX, tipY] = branchAt(BRANCH.len);
    const TIP_LOBES = [
      // [dx past the tip, dy off the branch line, dz, radius]
      [-0.41, 0.40, 0.00, 0.36],
      [-0.21, 0.1, -0.1, 0.30],
      [-0.31, -0.05, 0.2, 0.26],
    ];
    const tipLeaves = new THREE.Mesh(
      mergeSimple(TIP_LOBES.map(([dx, dy, dz, r]) => {
        const lobe = new THREE.DodecahedronGeometry(r, 0);
        lobe.scale(1.08, 0.80, 1.08);   // the oak's squash: wider than tall
        lobe.translate(tipX + dx, tipY + dy, BRANCH.base[2] + dz);
        return lobe;
      })),
      toonMaterial({ color: WASH.deep, flat: true }));
    tipLeaves.name = 'tipleaves';
    scene.add(tipLeaves);

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

    // ---- the questioner --------------------------------------------------
    // Back, at Frank's word: "there's supposed to be someone under the tree,
    // another person standing under the tree looking at them, talking to
    // them." He is the case — a man arrives beneath the tree and asks why
    // Bodhidharma came from the West, and the answer would cost the hanging
    // man his teeth. So: ON the safe ground under the crown, at the lip, ink
    // like everything else (the one red hangs over the drop and stays there),
    // hands folded in his sleeves, and FACED at the man above him.
    //
    // faceMonk, not aimMonk: nothing is being pointed at here. The two verbs
    // turn different axes and the sleeve one would leave him staring off at
    // right angles to the only thing in the scene worth looking at.
    const asker = makeMonk({ height: 1.62, pose: 'fold' });
    asker.position.set(ASKER.x, 0, ASKER.z);
    faceMonk(asker, { x: grip[0], z: grip[2] });
    scene.add(asker);

    // and the hat that did not stay on, upright on the grass at the very edge
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.185 * 1.6, 0.10 * 1.6, 12),
      // the same ink every figure is painted in — it is a monk's hat, and one
      // lying on the grass darker than the one still on his head reads as a
      // different object entirely
      toonMaterial({ color: INK_LIT, flat: true }));
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
    // The blanket is wider than the old one: the carve's edges wobble by a
    // couple of units now and the recovery ramp runs to d≈25, so the mask
    // gains a fourth column and two rows or a half-sunk tree would hover on
    // the tapering rim.
    const gorgeMask = [];
    for (const mx of [-7.1, -13.3, -19.5, -25.7]) {
      for (const mz of [-15, -11, -7, -3, 1, 5, 8.5]) {
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
        { x: ASKER.x, z: ASKER.z, r: 0.7 },
      ],
      grassKeepout: [
        ...cliff.footprint(0.15),
        ...cliff.voidFootprint(0.3),
        ...gorgeMask,
        { x: HAT.x, z: HAT.z, r: 0.42 },
        { x: ASKER.x, z: ASKER.z, r: 0.34 },
      ],
    });

    // ---- the cut: the precipice is REAL ----------------------------------
    // Frank's verdict on the painted version was flat: "there is no precipice."
    // He wanted a cliff face with the tree at its edge and the man over the
    // drop — so the ground itself now falls away. The case owns its scene, so
    // it can carve its own ground mesh without touching the shared kit: every
    // vertex west of the lip sinks on a steep smoothstep (the cliff face), runs
    // a gorge floor, and eases back up on the far side — the far wall, already
    // deep in fog, with the mist banks lying in the chasm between. A bay window
    // along z confines the cut to the dressed run of lip stones, so beyond them
    // the meadow wraps around instead of tearing on an unrocked edge.
    //
    // EVERY EDGE OF THE CUT WOBBLES NOW (Frank: "it looks weird where the
    // cliff ends in straight lines on the sides and back, could it taper").
    // The first carve ran on three ruler lines — the lip at constant x, the
    // bay ends at constant z, the far recovery at constant depth — and the
    // gorge read as a rectangular pit. Each boundary is offset by its own
    // low-frequency seeded noise: the lip meanders WEST only (never east —
    // the asker stands 0.1 east of the carve start, so an eastward wobble
    // would sink the ground under his feet), the side walls swing ±1.5 as
    // they run out, the far wall comes and goes by ±2. The transitions are
    // also wider, so the side walls taper down instead of shearing.
    const groundMesh = scene.getObjectByName('ground');
    const LIP_X = CLIFF.x - 0.35;
    const DROP = 7;                             // matches the cliff's own drop
    const gpos = groundMesh.geometry.attributes.position;
    for (let i = 0; i < gpos.count; i++) {
      const wx = gpos.getX(i);
      const wz = gpos.getZ(i);
      // 0..0.7 and WEST-ONLY — more meander than this walks the carve's top
      // edge out past the kit's own lip-stone dressing, and the fall would
      // start on bare unrocked meadow
      const lipWob = noise1(wz * 0.22, 505) * 0.7;
      const d = LIP_X - wx - lipWob;            // how far into the void
      if (d <= 0) continue;
      const sideWob = (noise1(wx * 0.16, 506) - 0.5) * 3.0;
      const bay = SS(-16 + sideWob, -8.5 + sideWob, wz) * (1 - SS(1.5 + sideWob, 7 + sideWob, wz));
      if (bay <= 0) continue;
      const farWob = (noise1(wz * 0.13, 507) - 0.5) * 4.0;
      const sink = DROP * SS(0, 1.8, d) * (1 - SS(13 + farWob, 23 + farWob, d)) * bay;
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
      [ASKER.x - 0.05, ASKER.z - 0.06, 0.42, 0.36, 0.30],
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
