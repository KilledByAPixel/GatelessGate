import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH, wash } from '../palette.js';
import {
  composeWorld, groundHeight, makeFurin, makeGate, makeMonk, makePath,
} from '../kit/index.js';
import { makeLights } from '../render/toon.js';
import { addOutlines } from '../render/outlines.js';

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
// and the far one a lighter wash. Frank's call on review superseded that (see
// the note inside GATES): all three carry the deep red, and fog does the
// hierarchy the grey was doing. The deep mix is the intro gate's — a torii is
// a big timber frame, and full ACCENT across that much area would glare. The
// glow is in the material (SEAL_GLOW in render/toon.js keys off the accent
// colours); nothing here sets emissive by hand.
const GATES = [
  // ALL THREE gates carry the seal — Frank's call on reviewing the plan, and he
  // is right that it beats the middle-only design: three red barriers on one
  // road, and the FOG does the hierarchy the grey was doing — the near gate
  // full-blooded, the far one a red ghost dissolving into the paper. Same deep
  // mix as the title screen's gate, so the echo lands.
  // HUNG LOWER (Frank): at 3.4 the near gate's lintel ran off the top of the
  // frame, so the barrier you are standing at read as two legs and no beam --
  // and a torii is its crossbeam. A shade under three metres puts the whole
  // frame in shot at the home camera and still walks a monk through it.
  { t: 0.22, width: 3.2, height: 2.9, color: ACCENT_DEEP }, // where is your true nature?
  { t: 0.42, width: 3.0, height: 2.75, color: ACCENT_DEEP }, // how will you be free of life and death?
  { t: 0.70, width: 2.8, height: 2.6, color: ACCENT_DEEP }, // where do you go?
];
const MONK_T = 0.28;   // mid-journey: past the first barrier, short of the second
// One bell size per gate, in the same near-to-far order as GATES — task-12's
// migration off raw f0 (62 + 18*i) to Frank's tuned presets.
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
  ambience: ['wind:' + BASE_WIND, 'furin', 'music'],
  
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
  const gates = GATES.map((spec) => {
  const gp = path.sample(spec.t);
  const half = spec.width / 2;
  const under = [
  gp.y,
  groundHeight(gp.x + gp.perp.x * half, gp.z + gp.perp.z * half, { seed: GROUND_SEED }),
  groundHeight(gp.x - gp.perp.x * half, gp.z - gp.perp.z * half, { seed: GROUND_SEED }),
  ];
  const y = Math.min(...under) - 0.06;
  const gate = makeGate({ width: spec.width, height: spec.height, color: spec.color });
  gate.position.set(gp.x, y, gp.z);
  gate.rotation.y = gp.heading;
  scene.add(gate);
  return { gate, gp, y, spec };
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
  for (const [i, { gate, spec }] of gates.entries()) {
  const parts = [
  { w: 0.6, h: spec.height + 0.3, x: -spec.width / 2, y: (spec.height + 0.3) / 2 - 0.05 },
  { w: 0.6, h: spec.height + 0.3, x: spec.width / 2, y: (spec.height + 0.3) / 2 - 0.05 },
  { w: spec.width * 1.4 + 0.2, h: 0.7, x: 0, y: spec.height + 0.09 },
  { w: spec.width * 1.08, h: 0.5, x: 0, y: spec.height * 0.78 },
  ];
  for (const p of parts) {
  const slab = new THREE.Mesh(
  new THREE.PlaneGeometry(p.w, p.h),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  slab.name = 'gatehit';
  slab.visible = false;             // the raycaster still sees it; the renderer never does
  slab.userData.noOutline = true;
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
  // stood INSIDE a peak (Frank's free-cam find; five separate collisions
  // by the numbers). These bands flank the corridor instead: verified
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
  ...gates.map(({ gp }) => ({ x: gp.x, z: gp.z, r: 2.9 })),
  { x: monk.position.x, z: monk.position.z, r: 1.6 },
  ],
  grassKeepout: path.keepout(34, 1.05),
  });
  
  // a furin under the first barrier's lintel — the near gate is the one you
  // stand before, so it is the one that carries a voice in the wind
  const furin = makeFurin({
  seed: 47,
  onStrike: (tube, force, pos) => audio && audio.chimeStrike({ tube, force, at: pos }),
  });
  furin.group.position.set(1.2, GATES[0].height, 0);
  gates[0].gate.add(furin.group);
  
  addOutlines(scene, { width: 0.033, wobble: 0.7 });
  
  // ---- the moment: three notes ------------------------------------------
  // Tap a barrier and it answers with one slow bell tone — the nearest gate
  // the deepest. Nothing advances, nothing unlocks; each barrier simply has
  // its own note, and the far one is a longer reach, exactly as it looks.
  let camera = null;
  let clock = 0;
  const taps = [0, 0, 0];
  // Per-barrier cooldown, k49's idiom (`clock - lastRing > 0.5`): a bare
  // audio.bell() call here has no size ceiling of its own, and CODE REVIEW
  // CAUGHT that a held pointer or a fast tapper stacked strikes without
  // limit — the shimmer cluster alone took one strike from 22 to 36
  // oscillators. Each barrier gates independently, so tapping barrier 2
  // does not silence barrier 1's own answer.
  const lastRing = [-99, -99, -99];
  input.onTap(() => {
  if (!camera) return;
  // the chime first: its hit drum sits inside the first gate's lintel
  // slab, and a tap aimed at a wind chime must never answer with the
  // gate's bell. Same probe order as k29.
  const chimeHit = furin.pick(camera, input);
  if (chimeHit) { furin.ring(0.75, chimeHit.tube); return; }
  const hit = input.raycastFirst(camera, hitSlabs);
  if (!hit) return;
  const i = slabGate.get(hit.object);
  if (i === undefined) return;
  if (clock - lastRing[i] < 0.5) return;
  lastRing[i] = clock;
  taps[i]++;
  // GATES shrinks from the near barrier to the far one (width 3.2 -> 3.0
  // -> 2.8, same order as GATES above) — task-12's migration to Frank's
  // tuned presets follows the same shrink rather than the raw f0 ramp:
  // near gate biggest bell, far gate smallest.
  audio && audio.bell({ preset: GATE_PRESETS[i], at: gates[i].gate.position });
  });
  
  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);        // the meadow breathes
  furin.update(dt, simTime);        // and the near gate's chime rides it
  },
  fragment() {
  return { taps1: taps[0], taps2: taps[1], taps3: taps[2] };
  },
  dispose() {},
};
  },
};
