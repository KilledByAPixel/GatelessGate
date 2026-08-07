import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, WASH, wash } from '../palette.js';
import { hash1 } from '../util/noise.js';

import { clamp01, smoothstep as SS } from '../util/math.js';
import {
  composeWorld, makeWater, makeKoi, makeMonk, aimMonk, faceMonk,
  makeLights, addOutlines, toonMaterial, setSeal,
} from '../kit/index.js';

const ID = 39;

// A student quotes a line of somebody else's poem at Ummon — "Brilliancy of
// Buddha illuminates the whole universe" — and before he can finish it Ummon
// asks whose poem it is, and tells him he is sidetracked.
//
// So the crossing is made of borrowed words: stepping stones laid across dark
// water, each one a phrase. Only ONE of them ever gives way — the vermillion
// one, the phrase currently carrying the point (Frank: "make it so you can
// only push the red stone"). Touch a grey stone and it holds, with a solid
// little knock: everyone else's words are perfectly load-bearing. Touch the
// red one and it goes under, and the red moves to the next surviving stone —
// so the crossing can only ever be dismantled point by point, from the far
// end in, until the water lies flat and black with nothing to walk on. Then,
// after a while, the stones surface again for the next person who wants to
// quote something.
//
// (Any stone used to sink. The red starts as the far one — the end of the
// line nobody in this case ever reaches — and there is always exactly one:
// the point you were making is never the stone you are standing on.)

const SINK = 1.1;         // seconds for a stone to go under
const SURFACE_AFTER = 6;  // and how long the water stays empty
const STONES = 7;
const FIRST_RED = STONES - 1;   // the crossing starts with the FAR stone red

// Where the red goes when a stone sinks — pure, so it is testable without a
// scene. `red` is the index currently carrying it, `tapped` the stone that
// just went under, `sunk` the per-stone sunk flags AFTER that sink. Sinking
// any stone but the red one moves nothing; sinking the red one hands it to
// the NEAREST surviving stone, and on a tie to the one nearer the near shore.
//
// Nearest, not "next in build order wrapping round": the stones run in a line
// from the near shore out, so wrapping sent the red from the far end all the
// way back to the first stone — the length of the crossing away (Frank: "the
// next red one that appears is on the opposite direction, all the way on the
// other side, and that's wrong — we want the closest one to turn red next,
// and then they keep coming from the same side"). Walking outward from the
// red one by index IS walking outward by distance here, and the near-shore
// tie-break is what keeps the red marching steadily down the line it started
// on instead of hopping across the water.
//
// When the last survivor goes down there is nobody left to take it: -1, and
// the red vanishes with the crossing until the stones surface again.
export function nextRed(red, tapped, sunk) {
  if (tapped !== red) return red;
  const n = sunk.length;
  for (let k = 1; k < n; k++) {
    if (red - k >= 0 && !sunk[red - k]) return red - k;
    if (red + k < n && !sunk[red + k]) return red + k;
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
  // Used to carry the loudest water bed in the book (water:0.55, the deepest
  // crossing). Frank: "the moving water sound was not good... it sounds like
  // we're at a beach or something" — there is no ocean or beach in any scene
  // here, so it's off (see makeWaterBed's comment in synths.js). A tap on a
  // stone or the water itself still rings a drip.
  ambience: ['wind:0.14', 'music'],
  camera: { distance: 11.0, target: [0.4, 0.9, -1.0], azimuth: 0.62, polar: 1.18 },

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.030);
    scene.add(makeLights());

    // dark water, wide enough that the crossing matters.
    //
    // IT SITS IN A HOLE NOW. The sheet used to be lifted to 0.18 — above the
    // meadow — because there was no basin under it and a ripple trough reached
    // y = 0 and punched through the earth. That bought clearance and cost the
    // picture: a pond hovering a hand's width over the field it is supposed to
    // be in (Frank: "we've got the water lifted up above the ground to fix the
    // z-fighting... we could deform the ground where the water is, so it rapidly
    // slopes down and is deep enough that there's no z-fighting, and we can
    // maybe even put fish there").
    //
    // So the ground is carved instead, and the sheet drops to just UNDER the
    // bank — the lip overhangs it by a few centimetres, which is what the edge
    // of a pond looks like. The carve is below, after composeWorld has built the
    // ground it cuts.
    const WY = -0.05;
    // The bed is a GRADIENT now, not a bowl (Frank: "the water more shallow
    // where the stones are... it could get deeper farther away where the fish
    // are"): ~SHALLOW under the stepping-stone line so the stones stand on
    // the bottom, sliding down to DEEP on the back half where the koi swim.
    const SHALLOW = 0.35;
    const DEEP = 1.3;
    const BANK = 1.5;       // how fast the bank falls — "rapidly slopes down"
    // open water — a BLOB now, not a square (Frank: "make that pond less
    // square-shaped, more organically shaped, kinda roundish"): a seeded
    // wobbled outline from the kit, sized up so every stone still stands well
    // inside the shore at this seed (pinned by tests/k39.test.js). The rim is
    // pinned as before, so a stone dropped near the bank still cannot throw
    // its ring out over the grass.
    const water = makeWater({ shape: 'blob', size: 12.5, color: wash(0.72), seed: ID, strike: 0.085 });
    water.group.position.set(0.4, WY, -1.6);
    scene.add(water.group);

    // ---- THE STONES ------------------------------------------------------
    // An arc from the near shore out into the middle, each one a phrase of a
    // borrowed line. They are placed on a curve so the crossing reads as a
    // sentence going somewhere rather than a row of blocks.
    // The red is a material STATE, not a stone: exactly one stone carries it
    // at a time (see nextRed above).
    //
    // It is applied by RECOLOURING each stone's own material rather than by
    // swapping a shared red one in. Swapping looked identical in isolation and
    // was wrong in the app: the debug workbench caches a plain-Lambert clone
    // per mesh, and on the shipped default that clone is what actually
    // renders — so assigning a fresh toonMaterial at runtime dropped a
    // differently-lit material into a scene of clones, and every stone the
    // repaint touched changed tone at once (Frank: "the other rocks change
    // their colour a little bit... they suddenly turn a more bright colour",
    // and the red itself "looks a little more red than the other red
    // objects"). Recolour whatever material is on the mesh — and both cached
    // copies, so toggling the toon shader cannot resurrect a stale colour.
    const stones = [];
    for (let i = 0; i < STONES; i++) {
      const t = i / (STONES - 1);
      const x = 3.6 - t * 6.6;
      const z = 1.9 - t * 5.2 + Math.sin(t * Math.PI) * 0.9;
      const r = 0.30 + hash1(i * 3 + 1, ID) * 0.10;
      const pivot = new THREE.Group();
      pivot.name = 'stone';
      pivot.position.set(x, WY + 0.05, z);
      // The stone goes to the BOTTOM now (Frank: "the stones can be a bit
      // taller, so they're fully touching the bottom of the pond") — the bed
      // under the crossing is only SHALLOW (~0.35) deep since the gradient
      // carve, so a 0.55 body reaches it with margin. This is NOT the old
      // shafts-through-deep-water failure (pale stilts under a metre of dark
      // sheet, "a row of mushrooms"): these are squat stones in genuinely
      // shallow water.
      // The top face stays exactly where the old 0.20 cap put it.
      const H = 0.55;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.18, H, 7),
        toonMaterial({ color: WASH.stone, flat: true }));
      top.name = 'stone-top';
      top.position.y = 0.10 - H / 2;
      top.rotation.y = hash1(i * 3 + 2, ID) * Math.PI;
      pivot.add(top);
      scene.add(pivot);

      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.22, r + 0.22, 0.7, 7),
        new THREE.MeshBasicMaterial({ visible: false }));
      hit.name = 'stone-hit';
      hit.userData.noOutline = true;
      pivot.add(hit);

      stones.push({ pivot, top, hit, y0: WY + 0.05, sunkAt: -99 });
    }

    let red = FIRST_RED;
    const paint = () => {
      for (let i = 0; i < stones.length; i++) {
        const top = stones[i].top;
        const isRed = i === red;
        for (const m of [top.material, top.userData._matToon, top.userData._matPlain]) {
          if (!m || !m.color) continue;
          m.color.set(isRed ? ACCENT : WASH.stone);
          setSeal(m, isRed);
        }
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
        { at: student, r: 1.2 },
        { at: ummon, r: 1.2 },
      ],
      grassKeepout: [{ x: 0.4, z: -1.6, r: 6.55 }],
    });

    // ---- THE BED: the pond is a HOLE, not a sheet ------------------------
    // Case 5's and case 12's trick again, and easier here because the ground
    // under this pond is dead flat: groundHeight's flatRadius is 9 and the whole
    // basin sits inside it, so there is no terrain roll to fight and the bank is
    // level all the way round.
    //
    // Cut from the water's OWN outline rather than a circle — makeWater exposes
    // shoreDistance for exactly this, and it is the only way the bed and the
    // surface can be guaranteed to agree about where the shore is. A circle
    // would have the bed crossing the blob's wobble twice per lobe.
    // The stone line runs (water-local) from A=(3.2, 3.5) to B=(-3.4, -1.7);
    // n̂=(NX, NZ) is its unit perpendicular pointing at the koi (back) side.
    // Depth is SHALLOW at and before the line, easing to DEEP past it.
    const NX = 0.62, NZ = -0.79, AX = 3.2, AZ = 3.5;
    const groundMesh = scene.getObjectByName('ground');
    const gpos = groundMesh.geometry.attributes.position;
    for (let i = 0; i < gpos.count; i++) {
      const lx = gpos.getX(i) - 0.4, lz = gpos.getZ(i) + 1.6;
      const d = water.shoreDistance(lx, lz);
      if (d <= 0) continue;                       // dry land, untouched
      const s = (lx - AX) * NX + (lz - AZ) * NZ;  // signed distance past the line
      const depth = SHALLOW + (DEEP - SHALLOW) * SS(0.6, 3.2, s);
      gpos.setY(i, gpos.getY(i) - depth * SS(0, BANK, d));
    }
    gpos.needsUpdate = true;
    groundMesh.geometry.computeVertexNormals();

    // ---- AND FISH, now that there is water to put them in ----------------
    // The whole point of digging it (Frank). They ride the surface's own height
    // field, so a stone going under lifts the school that happens to be under
    // the ring. Held well below the sheet — there is more than a metre of water
    // beneath them, so nothing can surface unasked.
    const koi = makeKoi({
      count: 4, seed: ID, length: 0.8, color: wash(0.16), unlit: true,
      radius: 2.0, depth: 0.34, surfaceAt: water.heightAt,
      // the deep side of the gradient, clear of the crossing (Frank: "the
      // fish are kind of further back in the pool where it can be a bit
      // deeper... positioned so they're not overlapping with the stones")
      center: [1.4, -2.0],
    });
    koi.group.position.set(0.4, WY, -1.6);
    // NO HULLS ON A SUBMERGED FISH. addOutlines gives everything an inverted
    // ink hull, which is right for a thing standing in the light and wrong for
    // one lying under a dark sheet: the body blends almost into the water and
    // the hull does not, so four koi came out as four ink scratches with
    // nothing inside them. Bodies only, and they read as what they are — a
    // paleness moving under the surface.
    koi.group.traverse((o) => { o.userData.noOutline = true; });
    scene.add(koi.group);

    addOutlines(scene, { width: 0.030, wobble: 0.7 });

    // ---- the moment: the words give way ----------------------------------
    let camera = null;
    let clock = 0;
    let sunk = 0;
    let allDownAt = -99;

    const surface = water.group.children.find((c) => c.name === 'surface');

    input.onTap(() => {
      if (!camera) return;
      for (let i = 0; i < stones.length; i++) {
        const s = stones[i];
        if (s.sunkAt > -99) continue;
        if (!input.raycastFirst(camera, [s.hit])) continue;
        // ONLY THE RED GIVES WAY (Frank: "make it so you can only push the
        // red stone"). A grey stone is someone else's phrase and it holds —
        // a solid knock, no ripple, nothing moves.
        if (i !== red) {
          audio && audio.knock({ force: 0.35, at: s.pivot.position });
          return;
        }
        s.sunkAt = clock;
        sunk++;
        // it goes under where you were about to put your weight
        audio && audio.drip({ loud: true, at: s.pivot.position });
        water.ripple(s.pivot.position.x - 0.4, s.pivot.position.z + 1.6);
        // The red does NOT move yet. It waits until this stone has actually
        // gone under (see update, below): handing it over on the tap lit the
        // next stone while the tapped one was still standing there in plain
        // sight wearing nothing (Frank: "the next one turns red a bit too
        // early — it shouldn't turn red until that one has gone under").
        if (sunk === stones.length) allDownAt = clock;
        return;
      }

      // THE WATER IS TOUCHABLE TOO. Every other pond in the book rings when
      // you touch it, and this one — the widest sheet of open water in the
      // whole case list — simply did not: the tap handler only ever looked at
      // the stones, so a miss did nothing at all (Frank: "I can't seem to
      // touch the water there, it's not letting me create ripples").
      if (!surface) return;
      const hit = input.raycastFirst(camera, [surface]);
      if (!hit) return;
      const local = water.group.worldToLocal(hit.point.clone());
      water.ripple(local.x, local.z);
      audio && audio.drip({ loud: false, at: hit.point });
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);
        koi.update(dt, simTime);

        if (allDownAt > -99 && clock - allDownAt > SURFACE_AFTER) {
          for (const s of stones) s.sunkAt = -99;
          sunk = 0;
          allDownAt = -99;
          // the crossing resets whole: the red returns to the far stone
          red = FIRST_RED;
          paint();
          // and coming back up MOVES THE WATER (Frank) — seven stones
          // surfacing at once is the biggest thing that happens in this
          // scene, and it used to happen in dead silence on a flat sheet
          for (const s of stones) {
            water.ripple(s.pivot.position.x - 0.4, s.pivot.position.z + 1.6);
          }
          audio && audio.drip({ loud: true, at: water.group.position });
        }

        for (const s of stones) {
          const u = s.sunkAt > -99 ? clamp01((clock - s.sunkAt) / SINK) : 0;
          const e = u * u * (3 - 2 * u);
          s.pivot.position.y = s.y0 - 0.85 * e;
          s.pivot.visible = e < 0.995;
        }

        // ...and only once the stone carrying the red has FINISHED going
        // under does the red step to the nearest survivor. Driven from here
        // rather than from the tap, so the handover lands on the beat the
        // stone actually disappears rather than the beat you touched it.
        if (red >= 0 && stones[red].sunkAt > -99 && clock - stones[red].sunkAt >= SINK) {
          red = nextRed(red, red, stones.map((q) => q.sunkAt > -99));
          paint();
        }
      },
      fragment() {
        return { sunk, standing: stones.length - sunk, red, ripples: water.rippleCount() };
      },
      dispose() {},
    };
  },
};
