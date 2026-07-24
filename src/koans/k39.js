import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makeWater, makeMonk, aimMonk,
  makeLights, makeBlobShadow, addOutlines, toonMaterial,
} from '../kit/index.js';

const ID = 39;

// A student quotes a line of somebody else's poem at Ummon — "Brilliancy of
// Buddha illuminates the whole universe" — and before he can finish it Ummon
// asks whose poem it is, and tells him he is sidetracked.
//
// So the crossing is made of borrowed words: stepping stones laid across dark
// water, each one a phrase, and they hold right up until you are standing on
// them. Touch a stone and it goes under. Sink the lot and the water lies flat
// and black with nothing to walk on — and then, after a while, they surface
// again for the next person who wants to quote something.
//
// The far stone is vermillion: the end of the line, which nobody in this case
// ever reaches.

const SINK = 1.1;         // seconds for a stone to go under
const SURFACE_AFTER = 6;  // and how long the water stays empty
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const STONES = 7;

export default {
  id: ID,
  slug: 'ummon-s-sidetrack',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.14', 'water:0.55', 'music'],
  camera: { distance: 11.0, target: [0.4, 0.9, -1.0], azimuth: 0.62, polar: 1.18 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // dark water, wide enough that the crossing matters
    const WY = 0.10;
    // open water, so a square sheet — and now the rim is pinned, so a stone
    // dropped near the bank no longer throws its ring out over the grass
    const water = makeWater({ shape: 'square', size: 11.0, color: wash(0.72), seed: ID });
    water.group.position.set(0.4, WY, -1.6);
    scene.add(water.group);

    // ---- THE STONES ------------------------------------------------------
    // An arc from the near shore out into the middle, each one a phrase of a
    // borrowed line. They are placed on a curve so the crossing reads as a
    // sentence going somewhere rather than a row of blocks.
    const stones = [];
    for (let i = 0; i < STONES; i++) {
      const t = i / (STONES - 1);
      const x = 3.6 - t * 6.6;
      const z = 1.9 - t * 5.2 + Math.sin(t * Math.PI) * 0.9;
      const r = 0.30 + hash1(i * 3 + 1, ID) * 0.10;
      const last = i === STONES - 1;
      const pivot = new THREE.Group();
      pivot.name = 'stone';
      pivot.position.set(x, WY + 0.05, z);
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.12, 0.20, 7),
        toonMaterial({ color: last ? ACCENT : WASH.stone, flat: true }));
      top.name = last ? 'far-stone' : 'stone-top';
      top.rotation.y = hash1(i * 3 + 2, ID) * Math.PI;
      pivot.add(top);
      scene.add(pivot);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.22, r + 0.22, 0.7, 7),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.name = 'stone-hit';
      hit.userData.noOutline = true;
      pivot.add(hit);

      stones.push({ pivot, hit, y0: WY + 0.05, sunkAt: -99 });
    }

    // the student, on the near shore, mid-sentence
    const student = makeMonk({ height: 1.58, pose: 'point' });
    student.position.set(4.9, 0, 3.0);
    aimMonk(student, stones[STONES - 1].pivot.position);
    scene.add(student);

    // Ummon, on the far side, who has already stopped listening
    const ummon = makeMonk({ height: 1.66, elder: true });
    ummon.position.set(-4.2, 0, -4.4);
    aimMonk(ummon, student.position);
    scene.add(ummon);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        { x: 0.4, z: -1.6, r: 6.2 },
        { x: 4.9, z: 3.0, r: 1.2 },
        { x: -4.2, z: -4.4, r: 1.2 },
      ],
      grassKeepout: [{ x: 0.4, z: -1.6, r: 5.8 }],
    });

    for (const [p, rx, rz, op] of [
      [student.position, 0.62, 0.5, 0.40],
      [ummon.position, 0.68, 0.52, 0.42],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    // ---- the moment: the words give way ----------------------------------
    let camera = null;
    let clock = 0;
    let sunk = 0;
    let allDownAt = -99;

    input.onTap(() => {
      if (!camera) return;
      for (const s of stones) {
        if (s.sunkAt > -99) continue;
        if (!input.raycastFirst(camera, [s.hit])) continue;
        s.sunkAt = clock;
        sunk++;
        // it goes under where you were about to put your weight
        audio && audio.drip({ loud: true });
        water.ripple(s.pivot.position.x - 0.4, s.pivot.position.z + 1.6);
        if (sunk === stones.length) allDownAt = clock;
        return;
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);

        if (allDownAt > -99 && clock - allDownAt > SURFACE_AFTER) {
          for (const s of stones) s.sunkAt = -99;
          sunk = 0;
          allDownAt = -99;
        }

        for (const s of stones) {
          const u = s.sunkAt > -99 ? clamp01((clock - s.sunkAt) / SINK) : 0;
          const e = u * u * (3 - 2 * u);
          s.pivot.position.y = s.y0 - 0.85 * e;
          s.pivot.visible = e < 0.995;
        }
      },
      fragment() {
        return { sunk, standing: stones.length - sunk, ripples: water.rippleCount() };
      },
      dispose() {},
    };
  },
};
