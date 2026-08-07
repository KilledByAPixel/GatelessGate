import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import { composeWorld } from '../kit/scenery.js';
import { makePath } from '../kit/path.js';
import { makeMonk, aimMonk, faceMonk } from '../kit/monk.js';
import { makeTree } from '../kit/tree.js';
import { makeOak } from '../kit/oak.js';
import { tapMeshes } from '../kit/pick.js';
import { makeLights, toonMaterial } from '../render/toon.js';
import { addOutlines } from '../render/outlines.js';
import { hash1 } from '../util/noise.js';

const ID = 38;

const LEAF_POOL = 12;    // hard ceiling: a leaf is always borrowed, never made
const LEAF_FALL = 6.4;   // seconds from the canopy to the grass — a leaf takes its time
const LEAF_REST = 7.0;   // then it just lies there, because that is what leaves do
const LEAF_SINK = 0.9;   // and the grass takes it back
// where a landed leaf lies: clear of the swept apron's rim (0.09) so a leaf that
// drifts in under the tree rests ON the earth instead of inside it, and low
// enough that one landing in the meadow nestles down among the blades
const LEAF_LIE = 0.14;
const PER_TAP = 3;       // "a few"
const AUTO_EVERY = 13;   // and now and then one lets go with nobody touching it

export default {
  id: ID,
  slug: 'an-oak-tree-in-the-garden',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'music'],
  mood: 'yo',      // one magnificent tree, wind through the branches

  // The tree is six units of the eight in frame, so this case gets a wider,
  // higher shot than the standard diorama: the crown has to fit, and the two
  // men have to end up small at the bottom of the picture.
  // Sat back and levelled off: the closer, higher shot looked DOWN on the monks,
  // which turns a robed figure into a cone. Target sits between the oak and the
  // pair so both carry the frame.
  camera: { distance: 16, target: [0.7, 1.9, -1.6], azimuth: 0.5, polar: 1.36 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    // a touch thinner than the house 0.030: the oak sits sixteen units out and
    // the standard fog eats the one red thing in the book's most ordinary scene
    scene.fog = new THREE.FogExp2(PAPER, 0.027);
    scene.add(makeLights());

    // A garden walk, not a road. It comes out of the foreground, runs between
    // the two men and passes under the edge of the oak on its way into the fog —
    // so the tree is beside the path you are already on, which is the point.
    const path = makePath({ from: [3.6, 8], to: [-3.0, -20], width: 1.5, seed: 38, groundSeed: 21, wander: 1.1 });
    scene.add(path);

    // ---- the oak ---------------------------------------------------------
    // Every scene in this book has trees in it. This one's LEAVES are red, and
    // that does Joshu's pointing for him — the wood stays on the same grey ramp
    // as every other tree. Deep accent, not full: across a mass this size the
    // bright red stops reading as a seal and starts reading as glare.
    // 5.4, down from 5.8: the taller crown filled two thirds of the frame and
    // pushed Joshu into the corner as a blob, and Joshu POINTING at the tree is
    // the case. Most of that fix was the camera, though — this cannot go much
    // lower. Scatter trees reach 4.2, and k38.test.js requires a clear 1.0 of
    // daylight above the tallest of them, because "the oak is the biggest thing
    // growing" is the property that makes Joshu's answer land at all.
    const OAK = { x: -1.0, z: -3.0, height: 5.4, radius: 3.5 };
    // seed 20 of the first sixty: the most compact crown still balanced over
    // its own trunk
    const oak = makeOak({ height: OAK.height, seed: 20, canopyColor: ACCENT_DEEP });
    oak.position.set(OAK.x, 0, OAK.z);

    // (Grey butterflies played about the crown for a while. Gone — Frank:
    // "get rid of the butterflies." The oak and its falling leaves carry all
    // the motion this garden needs; the flock read as decoration.)
    oak.rotation.y = 0.4;
    scene.add(oak);
    oak.updateMatrixWorld(true);

    // swept earth around its foot — the one thing that says "garden" rather than
    // "a tree happens to grow here". It is also the only ground the grass leaves.
    const APRON_R = 2.15;
    const apron = new THREE.Mesh(
      new THREE.CylinderGeometry(APRON_R, APRON_R * 1.05, 0.12, 11),
      toonMaterial({ color: WASH.stone, flat: true }));
    apron.name = 'apron';
    apron.position.set(OAK.x, 0.03, OAK.z);
    scene.add(apron);

    // ---- the ordinary trees ----------------------------------------------
    // Grey, smaller, unremarkable, and there so the oak is unmistakably THAT one.
    const GREY = [[5.6, -5.8, 3.5, 3801], [-6.8, -0.8, 3.0, 3802]];
    for (const [x, z, h, seed] of GREY) {
      const t = makeTree({ height: h, seed });
      t.position.set(x, 0, z);
      t.rotation.y = hash1(seed, ID) * Math.PI * 2;
      scene.add(t);
    }

    // ---- the two men -----------------------------------------------------
    // Joshu, asked the largest question there is, has turned and put a sleeve out
    // at the scenery. The monk is still facing Joshu, waiting for the answer.
    const jp = path.sample(0.31);
    const joshu = makeMonk({ pose: 'point', height: 1.72, stout: 1.1 });
    joshu.position.set(jp.x, 0, jp.z);
    aimMonk(joshu, { x: OAK.x, z: OAK.z });      // the raised sleeve lands in the crown
    scene.add(joshu);

    const mp = path.sample(0.255);
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(mp.x + mp.perp.x * 0.85, 0, mp.z + mp.perp.z * 0.85);
    faceMonk(monk, joshu.position);
    scene.add(monk);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 5,
      keepout: [
        ...path.keepout(26, 1.1),
        // generous — a full crown's width past the crown. Nothing grows inside
        // that, so the oak is the only thing standing in its own patch of garden.
        { x: OAK.x, z: OAK.z, r: OAK.radius + 2.4 },
        ...GREY.map(([x, z]) => ({ x, z, r: 2.1 })),
        { x: joshu.position.x, z: joshu.position.z, r: 1.3 },
        { x: monk.position.x, z: monk.position.z, r: 1.3 },
      ],
      // only the walk and the swept earth actually cover ground; both men stand
      // in the grass, and the grass grows right up under the oak
      grassKeepout: [
        ...path.keepout(26, 1.0),
        { x: OAK.x, z: OAK.z, r: APRON_R * 0.98 },
      ],
    });

    // ---- the leaves ------------------------------------------------------
    // A fixed pool, borrowed and returned. Built before addOutlines and marked
    // noOutline: an inverted-hull stroke is wider than a blade this thin, and
    // would render each leaf as a solid ink fleck.
    const leafGeo = new THREE.ConeGeometry(0.11, 0.32, 4);
    leafGeo.rotateX(Math.PI / 2);    // the blade lies flat, tip toward +z
    leafGeo.scale(1, 0.32, 1);       // and is pressed thin
    const leafMat = toonMaterial({ color: ACCENT, flat: true, side: THREE.DoubleSide });
    const idle = [];
    const falling = [];
    for (let i = 0; i < LEAF_POOL; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.name = 'leaf';
      leaf.userData.noOutline = true;
      leaf.visible = false;
      scene.add(leaf);
      idle.push(leaf);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // Where a leaf can let go, in world space. Only the outer clumps: a leaf
    // released from the middle of the crown falls through the mass unseen.
    const anchors = oak.canopyPoints.map((p) => oak.localToWorld(p.clone()));
    const fringe = anchors.slice(0, Math.max(3, Math.round(anchors.length * 0.6)));

    let camera = null;
    let released = 0;
    let taps = 0;

    // One leaf, posed at whatever moment of its fall f.age says. dt only feeds
    // the spin, which is integrated rather than absolute.
    function pose(f, dt) {
      const t = Math.min(1, f.age / LEAF_FALL);
      const sway = Math.sin(f.age * f.rate + f.phase);
      const swayZ = Math.cos(f.age * f.rate * 0.78 + f.phase);
      // it does not drop. It slips sideways off one cushion of air onto the
      // next, and turns over each time it does
      f.mesh.position.set(
        f.x0 + sway * 0.5 + f.drift * t,
        f.y0 - t * (f.y0 - LEAF_LIE),
        f.z0 + swayZ * 0.42 + f.driftZ * t,
      );
      const settle = Math.min(1, Math.max(0, (1 - t) / 0.22));   // lies flat as it arrives
      f.mesh.rotation.set(
        sway * 1.35 * settle,
        f.mesh.rotation.y + f.spin * settle * dt,
        swayZ * 1.15 * settle,
      );
    }

    function release(near) {
      const leaf = idle.pop();
      if (!leaf) return false;              // the pool is out; nothing accumulates
      let a = fringe[released % fringe.length];
      if (near) {
        let bestD = Infinity;
        for (const p of fringe) {
          const d = p.distanceToSquared(near);
          if (d < bestD) { bestD = d; a = p; }
        }
      }
      const j = released * 11;
      const f = {
        mesh: leaf,
        age: 0,
        x0: a.x + (hash1(j + 1, ID) - 0.5) * 0.9,
        y0: a.y - hash1(j + 2, ID) * 0.35,
        z0: a.z + (hash1(j + 3, ID) - 0.5) * 0.9,
        drift: (hash1(j + 4, ID) - 0.5) * 1.5,
        driftZ: (hash1(j + 5, ID) - 0.5) * 1.5,
        spin: (hash1(j + 6, ID) - 0.5) * 2.4,
        rate: 1.4 + hash1(j + 7, ID) * 1.4,
        phase: hash1(j + 8, ID) * Math.PI * 2,
      };
      // Posed HERE, at age zero, by the same function that will drive it. A leaf
      // woken at the world origin is one frame of a red fleck sitting on the path,
      // and a leaf woken without its sway offset jumps half a unit sideways on
      // its first tick.
      leaf.scale.setScalar(0.85 + 0.35 * hash1(j + 9, ID));
      leaf.rotation.y = hash1(j + 10, ID) * Math.PI * 2;
      pose(f, 0);
      leaf.visible = true;
      falling.push(f);
      released++;
      return true;
    }

    const oakMeshes = tapMeshes(oak);

    // Touch the tree and a few leaves come off it. There is nothing to solve and
    // nothing that says so; it is the same as touching a tree.
    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, oakMeshes);
      if (!hit) return;
      taps++;
      for (let i = 0; i < PER_TAP; i++) release(hit.point);
      // the trunk you touched, and the leaves letting go of it
      audio && audio.wood({ force: 0.5, at: hit.point });
      audio && audio.breath({ force: 0.7, at: hit.point });
    });

    let sinceAuto = AUTO_EVERY * 0.5;

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);

        sinceAuto += dt;
        if (sinceAuto >= AUTO_EVERY) { sinceAuto = 0; release(null); }

        for (let i = falling.length - 1; i >= 0; i--) {
          const f = falling[i];
          f.age += dt;

          if (f.age < LEAF_FALL) {
            pose(f, dt);
          } else if (f.age > LEAF_FALL + LEAF_REST) {
            // then the grass takes it back, so the ground never fills up
            const s = (f.age - LEAF_FALL - LEAF_REST) / LEAF_SINK;
            f.mesh.position.y = LEAF_LIE - Math.min(1, s) * 0.5;
            if (s >= 1) {
              f.mesh.visible = false;
              idle.push(f.mesh);
              falling.splice(i, 1);
            }
          }
        }
      },
      fragment() {
        return { falling: falling.length, idle: idle.length, released, taps };
      },
      dispose() {},   // the pool lives in the scene; disposeRoot collects it
    };
  },
};
