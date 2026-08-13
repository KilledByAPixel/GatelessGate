import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH, wash } from '../palette.js';
import {
  composeWorld, groundHeight, makeGate, makeMonk, makePath,
} from '../kit/index.js';
import { makeLights } from '../render/lights.js';

const ID = 47;
const GROUND_SEED = 21;
const BASE_WIND = 0.16;

// Tosotsu's three barriers are three QUESTIONS, and this case has no object at
// all — no dog, no flag, no bowl. What it has is the shape of the teaching:
// one road, three gates across it, a walker between the first and the second.
// So the diorama is almost pure composition, and the fog does the arguing.
// Each barrier stands one state further from being graspable — the first
// solid ink a few steps ahead, the second softening, the third almost paper —
// which is the order of the questions themselves: your nature, your death,
// what is after. The title screen stages ONE red gate on this same road; this
// case is where that image comes from, three of them deep.
//
// The road runs much deeper than other stagings (to z=-42) because the road
// IS the subject: the third gate has to stand ~32 units from the home camera
// so FogExp2(0.030) washes it ~60% toward the paper. Measured at the home
// camera below: gate washes 7% / 26% / 60%, monk 15%.
const PATH_OPTS = { from: [1.1, 6.8], to: [-1.6, -42], width: 1.7, seed: 47, groundSeed: GROUND_SEED, wander: 0.8 };

// t along the road, and a slight step DOWN in size with depth. The steps do
// two jobs: they exaggerate the recession, and they make collapse impossible —
// the nearest gate is always the largest on screen by construction, so at the
// one heading where the three centres line up (the camera crossing the road's
// axis) the gates nest as three distinct frames instead of merging into one
// silhouette. Ground intervals grow with depth (9.8 then 13.7) to fight
// perspective foreshortening; on screen the three read evenly stepped.
//
// The seal plan changed once: at first only the middle gate — the barrier the
// walker is approaching NOW — took ACCENT_DEEP, with the near barrier near-ink
// and the far one a lighter wash. That was superseded on review (see the note
// inside GATES): all three carry the deep red, and fog does the
// hierarchy the grey was doing. The deep mix is the intro gate's — a torii is
// a big timber frame, and full ACCENT across that much area would glare. The
// glow is in the material (SEAL_GLOW in render/material.js keys off the accent
// colours); nothing here sets emissive by hand.
// ---- THE BARRIERS COME TO YOU ---------------------------------------------
// Touch any gate and the whole road SLIDES ONE PLACE FORWARD: each barrier
// travels to where the one in front of it stood, a fourth comes up out of the
// space behind the reader to take the near position, and the one that was
// furthest walks on up the road until the fog has it. Then that one is quietly
// back behind you, and it can happen again, for ever.
//
// That staging IS the case. Tosotsu's three barriers are three
// questions, and the joke the composition could never tell on its own is that
// passing one does not leave you with two — there are always three ahead. The
// walker between the first and the second never moves. He does not have to.
//
// FIVE SLOTS, FOUR GATES. At rest the occupied ones are BEHIND, near, middle,
// far; a slide runs every gate to the next slot, and whichever lands on GONE is
// put straight back to BEHIND — invisible at both ends, so the wrap is free.
// They travel ALONG THE ROAD rather than in a straight line between two points,
// sampled from the path every frame, so they follow its wander and its rises
// the way something moving down a road does.
//
// NOTHING FADES. The gate reaching GONE is thirty-odd units out in FogExp2 at
// 0.030, which is the one free vanish this renderer has — the fog and the ink
// pass's own distance falloff take it together, with no threshold anywhere for
// case 27's outline problem to bite on.
const SLOT_T = [0.02, 0.22, 0.42, 0.70, 0.96];
// ...and each slot's SIZE. A gate takes on the scale of the slot it is moving
// into, which is what keeps the near barrier the biggest on screen however many
// times the road has turned over — the invariant the original three-gate
// staging got from being built at three fixed widths (3.2 / 3.0 / 2.8, and
// these are those numbers as fractions of the first).
// ...and the GONE slot is tiny, which is how the far barrier leaves. Fog and
// distance alone were not enough: the gate arrived at 0.82 scale thirty units
// out, still just legible against the paper, and then the wrap took it in one
// frame, popping out of existence rather than receding. At 0.10 it dwindles
// the whole way
// out and is a red speck in the mist by the time it is picked up and carried
// back behind the reader. No alpha anywhere, so nothing here can meet case 27's
// outline problem.
const SLOT_S = [1.07, 1.0, 0.9375, 0.875, 0.10];
const GONE = SLOT_T.length - 1;   // the last slot: deep enough that the fog has it
const SLIDE = 2.4;        // seconds for the road to move one place
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const GATE_W = 3.2;       // every gate is built at the near barrier's size and
const GATE_H = 2.9;       // scaled into its slot from there

// The three visible slots are the three questions, in order: where is your true
// nature / how will you be free of life and death / where do you go. They used
// to be three gates built at three sizes (3.2 / 3.0 / 2.8 wide), which SLOT_S
// now carries as fractions so any gate can stand in any of them.
//
// HUNG LOWER: at 3.4 the near gate's lintel ran off the top of the
// frame, so the barrier you are standing at read as two legs and no beam — and
// a torii is its crossbeam. A shade under three metres puts the whole frame in
// shot at the home camera and still walks a monk through it.
const MONK_T = 0.28;   // mid-journey: past the first barrier, short of the second
// One bell per visible SLOT, near to far — the note belongs to the position on
// the road, not to the piece of timber standing in it, so the near barrier is
// always the biggest bell however many times the road has turned over.
// task-12's migration off raw f0 (62 + 18*i) to the tuned presets.
const GATE_PRESETS = ['great', 'temple', 'hand'];

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 14.5, target: [-0.6, 0.8, -10.85], heading: 6.5, pitch: 11 };
  export default {
  id: ID,
  slug: 'three-gates-of-tosotsu',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the taps already ring bells; the furin is the ambient voice, and it
  // counts as the emitter that thins the swells
  // THE FURIN TOKEN WENT WITH THE CHIME. It was the emitter that thinned the
  // drift layer here (src/audio/music.js's density rule); without it the drift
  // plays a little fuller, which is the right trade on a page that has just
  // lost its one continuous voice. Wind and the bells are what is left, and the
  // bells are the reader's.
  ambience: ['wind:' + BASE_WIND, 'music'],
  
  // Low, nearly level, and close to the road's own axis, so the three gates
  // stack up the frame — each lintel a step higher and a step washier. The
  // target sits between the first and second barriers (the corridor's visual
  // centre of mass): pivoting on the seal gate itself would put the lens
  // inside the first gate at home distance. Checked numerically at home
  // heading +-28.6 across aspects 1.78/0.8: all three lintels stay in frame at
  // home, and at every angle the gates either separate (NDC centre gap up to
  // 0.88) or nest (projected width ratios ~2.2 and ~1.9 where the centres
  // cross near heading 4). The walker's head sits just under centre frame.
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  // The shadow frustum is pushed up the road so the second barrier still
  // casts onto the ground it stands on; the third is past any frustum worth
  // paying texels for, and at 60% wash a cast shadow would not read anyway.
  scene.add(makeLights({ focus: [0.6, 0, -3.5], radius: 12 }));
  
  const path = makePath(PATH_OPTS);
  scene.add(path);
  
  // The gates straddle the road exactly, k29's idiom three times over. The
  // far end of the road leaves the flat staging radius, so a gate cannot
  // assume y=0 out there: each takes the LOWEST ground under its span and
  // sinks 6cm more, so a post plants in a rise rather than floating over a
  // dip. (The third gate happens to stand on a rise ~1.2 up — the road
  // climbing into the mist, which the composition gets for free.)
  // Where a gate stands when it is at road position `t`, and at what size. The
  // y takes the LOWEST ground under its span and sinks 6cm more, so a post
  // plants in a rise rather than floating over a dip — read every frame now
  // rather than once at build, because the gates travel.
  const placeAt = (gate, t, scale) => {
  const gp = path.sample(Math.max(0, Math.min(1, t)));
  const half = (GATE_W * scale) / 2;
  const y = Math.min(
  gp.y,
  groundHeight(gp.x + gp.perp.x * half, gp.z + gp.perp.z * half, { seed: GROUND_SEED }),
  groundHeight(gp.x - gp.perp.x * half, gp.z - gp.perp.z * half, { seed: GROUND_SEED }),
  ) - 0.06;
  gate.position.set(gp.x, y, gp.z);
  gate.rotation.y = gp.heading;
  gate.scale.setScalar(scale);
  };

  // FOUR gates, all built at the near barrier's size — the slot they are in
  // supplies the scale, so any of them can be the near one. They all carry the
  // seal: three red barriers on one road,
  // and the FOG does the hierarchy the grey was doing — the near gate
  // full-blooded, the far one a red ghost dissolving into the paper.
  const gates = [0, 1, 2, 3].map((slot) => {
  const gate = makeGate({ width: GATE_W, height: GATE_H, color: ACCENT_DEEP });
  placeAt(gate, SLOT_T[slot], SLOT_S[slot]);
  // THE ONE IN THE BEHIND SLOT IS NOT DRAWN while it is parked there. The
  // road only starts a few units behind the home camera, so "behind the
  // reader" is a couple of metres and not a county: parked visible, that
  // gate stands in the composition — the walker stops reading as a man
  // between the first barrier and the second, and the orbit swings a huge
  // near gate through frame. It is shown the moment it begins to move, by
  // which point it is still behind the lens at home and arrives from there,
  // which is the whole of what it is for.
  gate.visible = slot !== 0;
  scene.add(gate);
  return { gate, slot };
  });
  
  // Invisible tap zones, shaped like the FRAME, not the doorway. A single
  // plane across the whole opening would be simpler, but the gates spend
  // part of the orbit nested inside one another, and a doorway-plane on the
  // near gate would swallow every tap aimed through its arch at the two
  // beyond. Slabs over the posts, lintel and tie make the timber generous
  // to a fingertip while the opening stays open — a tap through the arch
  // falls through to the barrier actually pointed at.
  const hitSlabs = [];
  const slabGate = new Map();
  for (const [i, { gate }] of gates.entries()) {
  // in the gate's OWN local space, so they scale and travel with it
  const parts = [
  { w: 0.6, h: GATE_H + 0.3, x: -GATE_W / 2, y: (GATE_H + 0.3) / 2 - 0.05 },
  { w: 0.6, h: GATE_H + 0.3, x: GATE_W / 2, y: (GATE_H + 0.3) / 2 - 0.05 },
  { w: GATE_W * 1.4 + 0.2, h: 0.7, x: 0, y: GATE_H + 0.09 },
  { w: GATE_W * 1.08, h: 0.5, x: 0, y: GATE_H * 0.78 },
  ];
  for (const p of parts) {
  const slab = new THREE.Mesh(
  new THREE.PlaneGeometry(p.w, p.h),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  slab.name = 'gatehit';
  slab.visible = false;             // the raycaster still sees it; the renderer never does
  slab.position.set(p.x, p.y, 0);
  gate.add(slab);
  hitSlabs.push(slab);
  slabGate.set(slab, i);
  }
  }
  
  // One monk, on the road, between the first barrier and the second, facing
  // the way the road goes — the camera reads him from behind and a little to
  // the side. He owns nothing else in the frame: no staff, no companion.
  const mp = path.sample(MONK_T);
  const monk = makeMonk({});
  monk.position.set(mp.x + mp.perp.x * 0.22, mp.y, mp.z + mp.perp.z * 0.22);
  monk.rotation.y = mp.heading;
  scene.add(monk);
  
  // The rest of the world stays out of the way: scatter counts low, the
  // whole run of the road masked wide, only the trodden track clearing the
  // grass. The scene is road, gates, walker, fog.
  const world = composeWorld(scene, {
  view: CAM,
  seed: 47,
  groundSeed: GROUND_SEED,
  trees: 3,
  rocks: 6,
  bushes: 5,
  // The default mountain rings are built for dioramas that stay near the
  // origin; this road runs 40+ units deep, straight into them — gate 3
  // stood INSIDE a peak — five separate collisions by the numbers, found by
  // flying the free cam. These bands flank the corridor instead: verified
  // against every gate and a 26-point road sample — worst gate clearance
  // 8.3, worst road clearance 4.0. The road now climbs into a mountain
  // GAP, which is better composition than a wall anyway.
  mountains: [
  { count: 4, distance: 66, arcCenter: -0.55, arcSpan: 0.7, color: wash(0.16) },
  { count: 4, distance: 66, arcCenter: 0.55, arcSpan: 0.7, color: wash(0.16) },
  { count: 3, distance: 40, arcCenter: -1.0, arcSpan: 0.55, hScale: 0.6, color: wash(0.28) },
  { count: 3, distance: 40, arcCenter: 1.0, arcSpan: 0.55, hScale: 0.6, color: wash(0.28) },
  ],
  keepout: [
  ...path.keepout(34, 1.3),
  // EVERY SLOT, not every gate: the barriers travel now, so the ground has
  // to be clear of scatter at all five stations rather than at the three a
  // particular gate happens to be standing on when the page is built
  ...SLOT_T.map((t) => { const p = path.sample(t); return { x: p.x, z: p.z, r: 2.9 }; }),
  { x: monk.position.x, z: monk.position.z, r: 1.6 },
  ],
  grassKeepout: path.keepout(34, 1.05),
  });
  
  // (THE FURIN IS GONE. A single chime hung under the near barrier's lintel
  // was this page's ambient voice — and the near barrier is not a fixed object
  // any more, so a chime hung on it was ruled out before it was built. It
  // would have:
  // it would ride one gate up the road and out into the fog, taking the page's
  // only continuous sound with it and coming back four taps later. Its token
  // is out of the ambience recipe with it — see the note there.)

  // ---- the moment: the road moves ---------------------------------------
  // Tap any barrier and it answers with one slow bell tone — the near gate the
  // deepest — and then the whole road slides one place forward. Nothing
  // unlocks and nothing is passed; there are simply three ahead of you again.
  let camera = null;
  let clock = 0;
  let slides = 0;
  let slideAt = -99;
  let settled = true;      // has the slot bookkeeping for the last slide run yet
  // Counted BY SLOT, not by which piece of timber was touched: "the near
  // barrier" is a position on the road that different gates occupy in turn, and
  // it is the position the reader is pointing at. Index 0 is the parked slot,
  // which is undrawn and cannot be hit.
  const taps = [0, 0, 0, 0];
  // Per-barrier cooldown, k49's idiom (`clock - lastRing > 0.5`): a bare
  // audio.bell() call here has no size ceiling of its own, and CODE REVIEW
  // CAUGHT that a held pointer or a fast tapper stacked strikes without
  // limit — the shimmer cluster alone took one strike from 22 to 36
  // oscillators. Each barrier gates independently, so tapping barrier 2
  // does not silence barrier 1's own answer.
  const lastRing = [-99, -99, -99, -99];
  input.onTap(() => {
  if (!camera) return;
  // Only the barriers ACTUALLY ON THE ROAD are targets. The parked gate's
  // slabs travel with it like every other part of it, and offering them would
  // put an invisible pick volume behind the reader — which the staging net
  // caught the moment it existed: it taps whatever a case offers first, got
  // the parked gate, and reported case 47 as answering a touch with silence.
  const live = hitSlabs.filter((s) => gates[slabGate.get(s)].slot !== 0);
  const hit = input.raycastFirst(camera, live);
  if (!hit) return;
  const i = slabGate.get(hit.object);
  if (i === undefined) return;
  const slot = gates[i].slot;
  if (slot === 0) return;                    // belt and braces
  if (clock - lastRing[slot] < 0.5) return;
  lastRing[slot] = clock;
  taps[slot]++;
  // The bell belongs to the SLOT too — near barrier the biggest bell, far
  // gate the smallest, whichever piece of timber is standing there this
  // time round. GATE_PRESETS is indexed from the NEAR slot, so slot 1 is
  // its element 0.
  audio && audio.bell({ preset: GATE_PRESETS[slot - 1], at: gates[i].gate.position });
  // and the road moves — refused while it is already moving, or a second
  // tap would restart the slide from wherever the gates had got to
  if (clock - slideAt >= SLIDE) { slideAt = clock; slides++; }
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);        // the meadow breathes

  // THE SLIDE. Every gate walks from its own slot to the next one, along
  // the road rather than in a straight line between two points — the path
  // is sampled every frame, so they follow its wander and its rises the
  // way something travelling a road does.
  const u = clock - slideAt;
  const moving = u >= 0 && u < SLIDE;
  const p = moving ? ease(clamp01(u / SLIDE)) : 1;
  for (const g of gates) {
  const from = g.slot;
  const to = from + 1;
  const k = moving ? p : 0;
  placeAt(g.gate,
  SLOT_T[from] + (SLOT_T[to] - SLOT_T[from]) * k,
  SLOT_S[from] + (SLOT_S[to] - SLOT_S[from]) * k);
  }
  // ...and when it is over, each gate IS in the next slot. Whichever landed
  // on GONE goes straight back to BEHIND: by then it is a speck thirty units
  // out in the fog at one end and behind the reader at the other, so the wrap
  // costs nothing to look at and the road can turn over for ever.
  if (!moving && slideAt > -99 && !settled) {
  settled = true;
  for (const g of gates) {
  g.slot += 1;
  if (g.slot >= GONE) g.slot = 0;     // it walked into the fog; put it behind
  placeAt(g.gate, SLOT_T[g.slot], SLOT_S[g.slot]);
  }
  }
  if (moving) settled = false;

  // VISIBILITY LAST, after the slots have been advanced — which is the whole
  // of a one-frame pop, where a gate was visibly swapped out for the new one
  // despite being in the correct position. The position WAS fine. Visibility was
  // written inside the placement loop, which runs BEFORE the slot bookkeeping,
  // so on the single frame a slide ended the arriving gate was still recorded
  // as being in the parked slot and was hidden — then shown again on the next
  // frame, one frame late, out of a scene it had already walked into.
  //
  // Nothing about the gate had changed; only the order in which two lines ran.
  for (const g of gates) g.gate.visible = moving || g.slot !== 0;
  },
  fragment() {
  // taps1/2/3 are the NEAR, MIDDLE and FAR positions on the road — the same
  // three things they always named, now that they are slots rather than
  // objects. Slot 0 is the parked gate and is unreachable.
  return {
  taps1: taps[1], taps2: taps[2], taps3: taps[3],
  slides,
  sliding: (clock - slideAt >= 0 && clock - slideAt < SLIDE) ? 1 : 0,
  // one number for where the four of them are standing: 0+1+2+3 whatever
  // the rotation, which is the invariant — every slot filled exactly once
  slotSum: gates.reduce((n, g) => n + g.slot, 0),
  };
  },
  dispose() {},
};
  },
};
