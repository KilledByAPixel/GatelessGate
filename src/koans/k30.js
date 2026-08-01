import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makeBuddha, makeBasin, makeWater, makeKoi, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 30;

// "What is Buddha?" — "This mind is Buddha."
//
// A still pond with the figure seated on the far bank. There used to be a
// painted reflection of him lying flat on the water; Frank read it exactly
// right ("that weird 2D thing in the water") and it is gone — the pond
// answers with koi and ripples, not with a second Buddha.
//
// Case 33 is this scene with the far bank empty. They are meant to be read as
// a pair, so they share a seed, a camera and a pond.
//
// The pond is a RAISED stone basin rather than a hole in the ground: the ground
// plane is unbroken (kit/ground.js), so water sunk into it would simply be
// hidden. `surface` sits far enough below `rim` that a ripple crest cannot slop
// over the stone, and far enough above `floor` that the koi have room to swim.
export const POND = {
  x: 0.6, z: -1.4, size: 6.4,
  inner: 3.24, outer: 3.84, rim: 0.55, floor: 0.02, surface: 0.40,
};
export const BANK = { x: 0.6, z: -5.6 };

export default {
  id: ID,
  slug: 'this-mind-is-buddha',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12', 'water:0.35', 'music'],
  mood: 'yo',      // "Under blue sky, in bright sunlight"
  camera: { distance: 11.5, target: [0.6, 1.2, -2.2], azimuth: 0.55, polar: 1.19 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // the pond: an OPEN stone basin and a still sheet inside it. It used to be
    // a solid cylinder, whose top cap sealed the water and the fish underneath
    // it — the pond was a stone disc (Frank: "it looks like a platform").
    const lip = makeBasin({
      inner: POND.inner, outer: POND.outer, rim: POND.rim, floor: POND.floor,
      color: WASH.stone, segments: 20,
    });
    lip.name = 'lip';
    lip.position.set(POND.x, 0, POND.z);
    scene.add(lip);

    // round, to match the stone basin it sits inside
    const water = makeWater({
      shape: 'round', size: POND.size, color: WASH.ground, seed: ID, strike: 0.08, opacity: 0.5,
    });
    water.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(water.group);

    // koi under the surface — what turns the pale disc into water. They are
    // wash-toned, not accent (the seal is the mat), and they read as the same
    // pond's life in case 33, which shares this pond.
    const koi = makeKoi({
      count: 4, seed: 30, radius: POND.size * 0.32, color: WASH.mid,
      // sized to the water they are actually in: the tail fin stands taller
      // than the old 0.95 fish was deep, so its dorsal broke the surface
      length: 0.7, depth: 0.19,
      surfaceAt: water.heightAt,
    });
    koi.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(koi.group);

    // THE BUDDHA, on the far bank. The stone is a real DAIS now, not a paver:
    // its top (SEAT_TOP) stands above the basin's rim (POND.rim = 0.55), so
    // from the shipped lens he sits clearly over the water line instead of
    // peeking out from behind the stone lip (Frank: "lift him up a bit — the
    // little platform can be higher, slightly above the rest of the pool").
    const SEAT_TOP = 0.62;
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, SEAT_TOP, 9),
      toonMaterial({ color: WASH.stone, flat: true }));
    seat.name = 'seat';
    seat.position.set(BANK.x, SEAT_TOP / 2, BANK.z);
    scene.add(seat);

    // the mat on the stone — the same mat as case 33, where nobody is sitting
    // on it, so the two scenes share not just a pond but the exact spot the
    // answer is or is not occupying. DARK in both cases now (Frank: "the mat
    // underneath Buddha should not be red"): the pair's reds live elsewhere —
    // here the urna on his forehead, in 33 the koi under the water.
    const cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.05, 4),
      toonMaterial({ color: WASH.dark, flat: true }));
    cushion.name = 'cushion';
    cushion.rotation.y = Math.PI / 4;
    cushion.position.set(BANK.x, SEAT_TOP + 0.025, BANK.z);
    scene.add(cushion);

    // ordinary monk scale (overnight pass 2), seated on the top of the mat:
    // everything on the dais derives from SEAT_TOP so raising the stone
    // raises the whole stack together
    const buddha = makeBuddha({ height: 1.6 });
    buddha.position.set(BANK.x, SEAT_TOP + 0.05, BANK.z);
    scene.add(buddha);

    // the monk who asked, on the near shore
    const daibai = makeMonk({ height: 1.58 });
    daibai.position.set(3.4, 0, 2.2);
    aimMonk(daibai, buddha.position);
    scene.add(daibai);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(-3.2, 0, -0.6);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: POND.x, z: POND.z, r: POND.size * 0.62 },
        { x: BANK.x, z: BANK.z, r: 1.8 },
        { x: 3.4, z: 2.2, r: 1.2 },
        { x: -3.2, z: -0.6, r: 0.9 },
      ],
      grassKeepout: [
        { x: POND.x, z: POND.z, r: POND.size * 0.60 },
        { x: BANK.x, z: BANK.z, r: 1.2 },
      ],
    });

    for (const [p, rx, rz, op] of [
      [daibai.position, 0.62, 0.5, 0.40],
      [seat.position, 1.2, 0.9, 0.32],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: touch the water -------------------------------------
    let camera = null;
    let rippled = 0;
    const surface = water.group.children.find((c) => c.name === 'surface');

    input.onTap(() => {
      if (!camera || !surface) return;
      const hit = input.raycastFirst(camera, [surface]);
      if (!hit) return;
      const local = water.group.worldToLocal(hit.point.clone());
      water.ripple(local.x, local.z);
      audio && audio.drip({ loud: true });
      rippled++;
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        world.update(dt, simTime);
        water.update(dt, simTime);
        koi.update(dt, simTime);
      },
      fragment() {
        return { rippled, ripples: water.rippleCount(), koi: koi.fishCount() };
      },
      dispose() {},
    };
  },
};
