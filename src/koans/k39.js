import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makeWater, makeMonk, aimMonk, faceMonk,
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
// One stone is always vermillion — it starts as the far one, the end of the
// line nobody in this case ever reaches. Sink the red one and the red moves to
// the next surviving stone (Frank: "when you push one under, the next one
// turns red, since that one disappears — so there's always exactly one red").
// The point you were making is never the stone you are standing on.

const SINK = 1.1;         // seconds for a stone to go under
const SURFACE_AFTER = 6;  // and how long the water stays empty
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const STONES = 7;
const FIRST_RED = STONES - 1;   // the crossing starts with the FAR stone red

// Where the red goes when a stone sinks — pure, so it is testable without a
// scene. `red` is the index currently carrying it, `tapped` the stone that
// just went under, `sunk` the per-stone sunk flags AFTER that sink. Sinking
// any stone but the red one moves nothing; sinking the red one hands it to
// the next survivor in build order (near shore → far), wrapping past the end.
// When the last survivor goes down there is nobody left to take it: -1, and
// the red vanishes with the crossing until the stones surface again.
export function nextRed(red, tapped, sunk) {
  if (tapped !== red) return red;
  const n = sunk.length;
  for (let k = 1; k <= n; k++) {
    const i = (red + k) % n;
    if (!sunk[i]) return i;
  }
  return -1;
}

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
    // open water — a BLOB now, not a square (Frank: "make that pond less
    // square-shaped, more organically shaped, kinda roundish"): a seeded
    // wobbled outline from the kit, sized up so every stone still stands well
    // inside the shore at this seed (pinned by tests/k39.test.js). The rim is
    // pinned as before, so a stone dropped near the bank still cannot throw
    // its ring out over the grass.
    const water = makeWater({ shape: 'blob', size: 12.5, color: wash(0.72), seed: ID });
    water.group.position.set(0.4, WY, -1.6);
    scene.add(water.group);

    // ---- THE STONES ------------------------------------------------------
    // An arc from the near shore out into the middle, each one a phrase of a
    // borrowed line. They are placed on a curve so the crossing reads as a
    // sentence going somewhere rather than a row of blocks.
    // The red is a material STATE now, not a stone: exactly one stone carries
    // it at a time (see nextRed above), so every top is built in stone and the
    // shared seal material is swapped onto whichever one holds the red. One
    // shared red material rather than a tint: toonMaterial gives seal colours
    // their emissive lift at construction, which a color.set() would miss.
    const redMat = toonMaterial({ color: ACCENT, flat: true });
    const stones = [];
    for (let i = 0; i < STONES; i++) {
      const t = i / (STONES - 1);
      const x = 3.6 - t * 6.6;
      const z = 1.9 - t * 5.2 + Math.sin(t * Math.PI) * 0.9;
      const r = 0.30 + hash1(i * 3 + 1, ID) * 0.10;
      const pivot = new THREE.Group();
      pivot.name = 'stone';
      pivot.position.set(x, WY + 0.05, z);
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.12, 0.20, 7),
        toonMaterial({ color: WASH.stone, flat: true }));
      top.name = 'stone-top';
      top.rotation.y = hash1(i * 3 + 2, ID) * Math.PI;
      pivot.add(top);
      scene.add(pivot);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.22, r + 0.22, 0.7, 7),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.name = 'stone-hit';
      hit.userData.noOutline = true;
      pivot.add(hit);

      stones.push({ pivot, top, hit, stoneMat: top.material, y0: WY + 0.05, sunkAt: -99 });
    }

    let red = FIRST_RED;
    const paint = () => {
      for (let i = 0; i < stones.length; i++) {
        stones[i].top.material = i === red ? redMat : stones[i].stoneMat;
      }
    };
    paint();

    // the student, on the near shore, mid-sentence
    const student = makeMonk({ height: 1.58, pose: 'point' });
    student.position.set(4.9, 0, 3.0);
    aimMonk(student, stones[STONES - 1].pivot.position);
    scene.add(student);

    // Ummon, on the far side, who has already stopped listening
    const ummon = makeMonk({ height: 1.66, elder: true });
    ummon.position.set(-4.2, 0, -4.4);
    faceMonk(ummon, student.position);
    scene.add(ummon);

    const world = composeWorld(scene, {
      seed: ID,
      groundSeed: 21,
      trees: 4,
      keepout: [
        // the same 0.7 / 0.3 margins past the water's nominal radius (6.25)
        // that the old square sheet kept past its half-width
        { x: 0.4, z: -1.6, r: 6.95 },
        { x: 4.9, z: 3.0, r: 1.2 },
        { x: -4.2, z: -4.4, r: 1.2 },
      ],
      grassKeepout: [{ x: 0.4, z: -1.6, r: 6.55 }],
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
      for (let i = 0; i < stones.length; i++) {
        const s = stones[i];
        if (s.sunkAt > -99) continue;
        if (!input.raycastFirst(camera, [s.hit])) continue;
        s.sunkAt = clock;
        sunk++;
        // it goes under where you were about to put your weight
        audio && audio.drip({ loud: true });
        water.ripple(s.pivot.position.x - 0.4, s.pivot.position.z + 1.6);
        // ...and if it was carrying the red, the red steps to the next
        // survivor — always exactly one red while anything is still standing
        red = nextRed(red, i, stones.map((q) => q.sunkAt > -99));
        paint();
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
          // the crossing resets whole: the red returns to the far stone
          red = FIRST_RED;
          paint();
        }

        for (const s of stones) {
          const u = s.sunkAt > -99 ? clamp01((clock - s.sunkAt) / SINK) : 0;
          const e = u * u * (3 - 2 * u);
          s.pivot.position.y = s.y0 - 0.85 * e;
          s.pivot.visible = e < 0.995;
        }
      },
      fragment() {
        return { sunk, standing: stones.length - sunk, red, ripples: water.rippleCount() };
      },
      dispose() {},
    };
  },
};
