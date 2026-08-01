import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH } from '../palette.js';
import {
  composeWorld, makeBasin, makeWater, makeKoi, makeMonk, aimMonk, makeLantern,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';
import { POND, BANK } from './k30.js';

const ID = 33;

// "What is Buddha?" — "This mind is not Buddha."
//
// The same pond as case 30. The same stone lip, the same seat on the far bank,
// the same monk standing on the near shore having asked the same question of
// the same teacher. Baso simply answered the other way this time, and so the
// seat is empty and there is nothing lying on the water.
//
// The pairing is the entire staging decision: the pond geometry is imported
// from case 30 rather than retyped, because if the two scenes ever drifted
// apart the joke would stop working. Read one after the other and the second
// is not a new place — it is the first place with the answer taken out.
export default {
  id: ID,
  slug: 'this-mind-is-not-buddha',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.12', 'water:0.35', 'music'],
  camera: { distance: 11.5, target: [0.6, 1.2, -2.2], azimuth: 0.55, polar: 1.19 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.028);
    scene.add(makeLights());

    // the same open stone basin, from the same shared dimensions
    const lip = makeBasin({
      inner: POND.inner, outer: POND.outer, rim: POND.rim, floor: POND.floor,
      color: WASH.stone, segments: 20,
    });
    lip.name = 'lip';
    lip.position.set(POND.x, 0, POND.z);
    scene.add(lip);

    // the same round pond as case 30, down to the seed
    const water = makeWater({
      shape: 'round', size: POND.size, color: WASH.ground, seed: 30, strike: 0.08, opacity: 0.5,
    });
    water.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(water.group);

    // the same pond, so the same koi: seed 30 gives case 33 the identical fish
    // moving in the identical water — only the far bank differs. THE SEAL IS
    // THEIRS (Frank, overnight pass 2: the koi carry the red here): in case 30
    // the red sits on the mat under the one who answered; here the answer is
    // taken out, and the only warm thing left alive in the picture is under
    // the water. Full ACCENT, not the deep mix — four small fish seen through
    // a half-opaque surface are a held thing, not a mass, and the water
    // already takes the glare off them.
    const koi = makeKoi({
      count: 4, seed: 30, radius: POND.size * 0.32, color: ACCENT,
      // sized to the water they are actually in: the tail fin stands taller
      // than the old 0.95 fish was deep, so its dorsal broke the surface
      length: 0.7, depth: 0.19,
      surfaceAt: water.heightAt,
    });
    koi.group.position.set(POND.x, POND.surface, POND.z);
    scene.add(koi.group);

    // the same seat, with nobody on it
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.2, 0.26, 9),
      toonMaterial({ color: WASH.stone, flat: true }));
    seat.name = 'seat';
    seat.position.set(BANK.x, 0.13, BANK.z);
    scene.add(seat);

    // and the same mat, in the same place, bare — but in ink. In case 30 the
    // mat is vermillion under the one sitting on it; here the koi carry the
    // case's one red (above), so the mat goes to a dark wash: the same shape
    // in the same spot with the warmth gone out of it, which is what "not
    // Buddha" looks like as furniture. One accent per koan holds.
    const cushion = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.05, 4),
      toonMaterial({ color: WASH.dark, flat: true }));
    cushion.name = 'cushion';
    cushion.rotation.y = Math.PI / 4;
    cushion.position.set(BANK.x, 0.28, BANK.z);
    scene.add(cushion);

    // and the same monk, still standing there
    const monk = makeMonk({ height: 1.58 });
    monk.position.set(3.4, 0, 2.2);
    aimMonk(monk, { x: BANK.x, z: BANK.z });
    scene.add(monk);

    const lantern = makeLantern({ height: 1.1 });
    lantern.position.set(-3.2, 0, -0.6);
    scene.add(lantern);

    const world = composeWorld(scene, {
      seed: 30,               // the same ground, the same trees, the same day
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
      [monk.position, 0.62, 0.5, 0.40],
      [seat.position, 1.2, 0.9, 0.32],
      [lantern.position, 0.38, 0.3, 0.34],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.033, wobble: 0.7 });

    // ---- the moment: the water is still the water ------------------------
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
