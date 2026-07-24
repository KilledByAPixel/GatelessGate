import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeBasin, makeWater, makeKoi, makeBirds, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 49;

// Amban's Addition — the one case that is not Mumon's. A layman adds a
// forty-ninth koan as a bargain, needles Mumon for making "useless doughnuts,"
// and closes the whole book with a gesture rather than a word: "Stop, stop. Do
// not speak. The ultimate truth is not even to think. And now I will make a
// little circle on the sutra with my finger, and add that five thousand other
// sutras and Vimalakirti's gateless gate all are here."
//
// So this is the book at rest. It gathers a few of its own living things — a
// pond with koi, birds crossing, trees in the fog, the path that has run under
// every unstaged case — and holds them quiet. And it ends on Amban's little
// circle: a red ENSO standing at the head of the path, the gateless gate drawn
// as one brushstroke, the last and only warm mark in the book. Everything is
// here.
//
// It used to be the bare default landscape (a place the koan had not been set
// in). That was a fair ending, but this is the intended one.
export default {
  id: ID,
  slug: 'amban-s-addition',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.16', 'water:0.26', 'birds', 'music'],
  camera: { distance: 12.5, target: [0.2, 1.5, -2.4], azimuth: 0.42, polar: 1.2 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // the path that has run under the whole book, one last time, straight down
    // into the fog
    const road = makePath({ from: [0.4, 9], to: [-0.6, -30], width: 1.6, seed: ID, groundSeed: 21, wander: 0.7 });
    scene.add(road);

    // ---- the pond, off to the left ----------------------------------------
    const POND = { x: -3.7, z: -1.6, size: 4.2, inner: 2.15, outer: 2.55, rim: 0.42, floor: 0.02, surface: 0.3 };
    const lip = makeBasin({
      inner: POND.inner, outer: POND.outer, rim: POND.rim, floor: POND.floor,
      color: WASH.stone, segments: 18,
    });
    lip.position.set(POND.x, 0, POND.z);
    scene.add(lip);

    const water = makeWater({
      shape: 'round', size: POND.size, color: WASH.ground, seed: ID, strike: 0.06, opacity: 0.5,
    });
    water.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(water.group);

    const koi = makeKoi({
      count: 3, seed: ID, radius: POND.size * 0.3, color: WASH.mid,
      length: 0.66, depth: 0.19, surfaceAt: water.heightAt,
    });
    koi.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(koi.group);

    // ---- birds crossing the sky -------------------------------------------
    const birds = makeBirds({ count: 7, seed: ID, center: [0.5, -3.0], height: 6.4, spread: 5.4 });
    scene.add(birds.group);

    // ---- the traveller, stopped at the path's edge, facing the circle -----
    // The reader, at the end. Not walking through — just standing before it, set
    // to one side so he frames the circle rather than blocking it.
    const you = makeMonk({ height: 1.6, elder: true });
    const yb = road.sample(0.30);
    const yp = { x: yb.x + yb.perp.x * 0.8, z: yb.z + yb.perp.z * 0.8 };
    you.position.set(yp.x, 0, yp.z);
    scene.add(you);

    // ---- THE ENSO: Amban's little circle, at the head of the path ---------
    // One brushed ring standing upright across the road, with the enso's open
    // gap at the top-right. The whole book's one red thing.
    const enso = new THREE.Group();
    enso.name = 'enso';
    const ER = 1.25;                 // radius of the circle
    const ring = new THREE.Mesh(
      // an arc, not a closed loop — the gap is what makes it an enso and not a
      // wheel. Tube tapers are beyond a torus, so the brush is suggested by the
      // opening alone.
      new THREE.TorusGeometry(ER, 0.075, 8, 44, Math.PI * 1.86),
      toonMaterial({ color: ACCENT, flat: true }));
    ring.name = 'enso-ring';
    ring.rotation.z = 0.6;           // roll the gap round to the upper right
    enso.add(ring);
    // on the path at a readable mid-distance — the path is long, so a high t
    // buries it in the fog; this keeps the seal prominent
    const ep = road.sample(0.38);
    enso.position.set(ep.x, ER + 0.1, ep.z);    // standing on the road, just clear of it
    enso.rotation.y = ep.heading;    // face square across the path, toward the camera
    scene.add(enso);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        ...road.keepout(26, 1.3),
        { x: POND.x, z: POND.z, r: POND.outer + 0.8 },
        { x: yp.x, z: yp.z, r: 1.0 },
        { x: ep.x, z: ep.z, r: 1.4 },
      ],
      grassKeepout: [...road.keepout(26, 1.0), { x: POND.x, z: POND.z, r: POND.outer + 0.4 }],
    });

    for (const [p, rx, rz, op] of [
      [you.position, 0.6, 0.48, 0.4],
      [{ x: ep.x, z: ep.z }, 0.5, 0.35, 0.24],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.set(p.x, 0.01, p.z);
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // aim the traveller up the path at the circle AFTER outlines (pure transform)
    aimMonk(you, { x: ep.x, z: ep.z });

    // ---- the moment: close the circle -------------------------------------
    // Touch the enso and it brightens and swells for a beat, the way a drawn
    // circle completes under the brush, with one soft bell. Touch the water and
    // it rings where you touched. Nothing here is a puzzle; the book is over.
    const ringHit = new THREE.Mesh(
      new THREE.TorusGeometry(ER, 0.34, 6, 20, Math.PI * 2),
      new THREE.MeshBasicMaterial({ visible: false }));
    ringHit.name = 'enso-hit';
    ringHit.userData.noOutline = true;
    ringHit.rotation.copy(ring.rotation);
    enso.add(ringHit);

    const surface = water.group.children.find((c) => c.name === 'surface');

    let camera = null;
    let clock = 0;
    let closes = 0;
    let closedAt = -99;
    let rippled = 0;

    input.onTap(() => {
      if (!camera) return;
      if (input.raycastFirst(camera, [ringHit])) {
        closes++;
        closedAt = clock;
        audio && audio.bell({ f0: 210, gain: 0.5 });
        return;
      }
      if (surface) {
        const hit = input.raycastFirst(camera, [surface]);
        if (hit) {
          const local = water.group.worldToLocal(hit.point.clone());
          water.ripple(local.x, local.z);
          audio && audio.drip({ loud: true });
          rippled++;
        }
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);
        koi.update(dt, simTime);
        birds.update(dt, simTime);
        // the circle completing: a brief swell and brighten after a touch
        const u = clock - closedAt;
        const pulse = u >= 0 && u < 1.2 ? Math.exp(-u / 0.5) * Math.sin(Math.PI * Math.min(1, u / 1.2)) : 0;
        enso.scale.setScalar(1 + pulse * 0.06);
      },
      fragment() {
        return { closes, rippled, koi: koi.fishCount(), birds: birds.count() };
      },
      dispose() {},
    };
  },
};
