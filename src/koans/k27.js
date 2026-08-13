import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_LIGHT, mixHex } from '../palette.js';
import { clamp01 } from '../util/math.js';
import { hash1 } from '../util/noise.js';
import {
  composeWorld, makePath, makeHut, makeOak, makeMoon, makeMonk, faceMonk, makeLantern,
  makeLights, } from '../kit/index.js';

const ID = 27;

// "Is there a teaching no master ever preached before?" — "Yes." — "What is
// it?" — "It is not mind, it is not Buddha, it is not things."
//
// Nansen answers by naming three things and taking all three away, and Mumon
// says he gave away his treasure-words and must have been greatly upset.
//
// So the scene is built to be taken away — and TOUCH ANYWHERE and it all gets
// SMALL. The two men, the hall, the lantern, every tree on the page, the
// scattered rocks and bushes: everything a finger could be pointed at goes down
// to a tenth of itself, holds there, and comes back up. They never vanish. "It
// is not mind, it is not Buddha, it is not things" is not a claim that there is
// nothing; it is a refusal of the thing you named, and a hall you could pick up
// between two fingers is that refusal with the hall still standing in it.
//
// THREE VERSIONS FAILED FIRST, and between them they map a constraint that
// binds every case in this book. They sank into the ground, on three hit boxes
// with a fourth for undo — a switchboard where Nansen said one sentence. The
// ink drained, and they blinked off. The colour wash was then done exactly
// (`color` to black while `emissive` goes to the sky renders a lit surface as
// flat sky under any light) — a true vanish where the sky is what is behind it,
// except this hall stands against the meadow, so it became a hall-shaped patch
// of sky laid over the trees.
//
// THE INK PASS CANNOT FADE, and that is the common cause. It is a Sobel over
// the depth buffer, so a thing wears a full-strength outline for exactly as
// long as it writes depth and none at all afterwards — no alpha, no threshold,
// no ordering trick changes it. Every disappearance therefore ends in one frame
// where the strongest mark in the picture leaves at once, and the more
// carefully the fill had been faded, the more that last frame stood out.
// Staggering it across the hall's meshes turned the pop into a dissolve, and a
// dissolve was not what this wanted either.
//
// A SCALE HAS NO SUCH FRAME. The outline shrinks with the shape because it IS
// the shape's own depth edge; the shadow shrinks with it for the same reason;
// the foliage wind is applied in object space, so a small tree sways a small
// amount. There is no threshold anywhere in it, which is why this is the one
// version with no special cases in it at all.
//
// THE MOON IS THE EXCEPTION — see its own note at the shrink list below.
//
// WHAT STAYS: the road, the mountains, the far forests, the grass. None of them
// is a thing anyone points at — they are the ground the pointing happens on.
const SMALL = 0.1;        // what they shrink to, as a fraction of themselves
const DRAIN = 2;        // seconds to get there
const STAGGER = 0.5;     // ...and the four kinds of thing do not go at once
const EMPTY = 2.0;        // how long the page is held with them small
const BACK = 1;         // and how long they take to come back up
const OFFSET = 0.42;      // seeded spread WITHIN a kind, so a wood is not a switch
// The four kinds, in the order they shrink: the two men, the hall, the trees,
// and back in reverse. The moon is not one of them — it is sixty units out and
// a moon that got smaller would read as the moon leaving rather than as the
// picture doing anything, so it keeps the colour fade it already had, which
// worked.
const COUNT = 4;
const GONE_AT = (COUNT - 1) * STAGGER + DRAIN;
const RETURN_AT = GONE_AT + EMPTY;
const CYCLE = RETURN_AT + (COUNT - 1) * STAGGER + BACK;
const ease = (k) => k * k * (3 - 2 * k);
// How far through going thing `i` is at `u` seconds past the touch: 0 is full
// size, 1 is a tenth of it.
function awayAt(i, u) {
  if (!(u >= 0) || u >= CYCLE) return 0;
  if (u < RETURN_AT) return ease(clamp01((u - i * STAGGER) / DRAIN));
  return 1 - ease(clamp01((u - RETURN_AT - (COUNT - 1 - i) * STAGGER) / BACK));
}
const scratchPos = new THREE.Vector3();

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 17.4, target: [0.3, 0.95, -1.4], heading: 31.5, pitch: 22.4, maxDist: 18.4 };
  export default {
  id: ID,
  slug: 'it-is-not-mind-it-is-not-buddha-it-is-not-things',
  title: TEXT[ID].title,
  accent: ACCENT_LIGHT,
  tier: 1,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.18', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input } = ctx;
  const scene = new THREE.Scene();
  // EXPERIMENT: a red sky for the erasing case. The one scene where you take
  // the world apart until only the page is left gets a page that is already
  // tinted — so the paper you are left with is a warm red rather than white.
  // The paper post pass multiplies, so this composites fine.
  const SKY = mixHex(PAPER, ACCENT, 0.42);
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.FogExp2(SKY, 0.028);
  scene.add(makeLights());
  
  const path = makePath({ from: [4.6, 8.2], to: [2.1, -18.9], width: 1.4, seed: ID, groundSeed: 21, wander: 0.9 });
  scene.add(path);
  
  // ---- the three things -------------------------------------------------
  // Each sits in its own group so it can be lifted out whole, and each has a
  // way of going that suits what it is: the built things sink into the
  // ground they were standing on, and the moon — which was never standing on
  // anything — simply stops being there.
  
  const lantern = makeLantern({ height: 1.0 });
  lantern.position.set(5.5, 0, .2);
  scene.add(lantern);
  
  const hallGroup = new THREE.Group();
  hallGroup.name = 'the-hall';
  const hall = makeHut({ width: 3.4, height: 2.6, depth: 2.8, chimes: 11 });
  hall.position.set(-2.2, 0, -4.4);
  hall.rotation.y = 0.44;
  hallGroup.add(hall);
  scene.add(hallGroup);
  
  const treeGroup = new THREE.Group();
  treeGroup.name = 'the-tree';
  const oak = makeOak({ height: 5.2, seed: ID });
  const oakRoot = oak.group || oak;
  const TREE = { x: 2.3, z: -4.6 };      // moved clear of the path; it used to stand in the road
  oakRoot.position.set(TREE.x, 0, TREE.z);
  // Turn the hero limb AWAY from the home lens. Seed 27 grows its long low
  // bough at local bearing 2.50 rad, which the home camera (heading 31.5) saw
  // end-on: a bare foreshortened limb with a knuckle, jutting at the hall like
  // an arm. At this yaw the bough reaches directly behind the crown, so from
  // the whole reachable arc the tree reads as one heavy mass over its trunk.
  oakRoot.rotation.y = 3.62;
  treeGroup.add(oakRoot);
  scene.add(treeGroup);
  
  const moonGroup = new THREE.Group();
  moonGroup.name = 'the-moon';
  const moon = makeMoon({ radius: 3.0, color: ACCENT_LIGHT, distance: 60 });
  moonGroup.add(moon);
  scene.add(moonGroup);
  
  // the monk who asked, left standing in whatever is left
  const monk = makeMonk({ height: 1.58 });
  monk.position.set(1.0, 0, 2.6);
  faceMonk(monk, { x: -2.2, z: -4.4 });
  scene.add(monk);
  
  // Nansen, who is about to do this to him
  const nansen = makeMonk({ height: 1.66, elder: true });
  nansen.position.set(-1.0, 0, 1.2);
  faceMonk(nansen, monk.position);
  scene.add(nansen);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: ID+3,
  groundSeed: 21,
  trees: 7,
  keepout: [
  ...path.keepout(24, 1.2),
  { at: hall, r: 3.2 },
  { x: TREE.x, z: TREE.z, r: 3.0 },
  { at: monk, r: 1.2 },
  { at: nansen, r: 1.2 },
  ],
  grassKeepout: [
  ...path.keepout(24, 0.95),
  { at: hall, r: 2.1 },
  ],
  });

  // ---- what shrinks, and when --------------------------------------------
  // Every prop scales about ITS OWN origin, which for everything the kit builds
  // is the point it stands on — so a shrinking thing stays planted where it was
  // instead of sliding toward the world origin. That is why these are the props
  // themselves and never the wrapper groups around them: hallGroup's origin is
  // the middle of the scene, and scaling it would walk the hall across the
  // meadow on its way down.
  //
  // `kind` is which of the four staggered beats a prop belongs to; `lead` is a
  // seeded offset WITHIN its beat, so the seven scattered trees fold away as a
  // wood rather than as one switch.
  const shrinkers = [];
  const add = (obj, kind) => {
    if (obj) shrinkers.push({ obj, kind, lead: 0, base: obj.scale.clone() });
  };
  add(monk, 0);
  add(nansen, 0);
  add(hall, 1);
  add(lantern, 1);              // the other built thing on the page
  add(oakRoot, 2);
  // ...AND EVERY OTHER TREE ON THE PAGE — the hall, the trees and the people
  // all go together. composeWorld hands back the midground wood it planted; the
  // far forests are not in it and stay put, being a mass in the fog rather than
  // things anyone could point at.
  for (const t of world.trees) add(t, 2);

  // ---- and the scatter, which is not props at all -------------------------
  // The rocks and the bushes are ONE InstancedMesh each — twelve rocks and
  // nine bushes drawn
  // in a single call, with a matrix per instance. Scaling the mesh would scale
  // about the SCENE origin and walk the whole scatter into the middle of the
  // meadow, so each instance's own matrix is recomposed instead: same position,
  // same rotation, a smaller scale. Twenty-one composes a frame while the
  // gesture is running and none at all while it is not.
  const scratchM = new THREE.Matrix4();
  const scratchQ = new THREE.Quaternion();
  const scratchS = new THREE.Vector3();
  const fields = [];
  for (const [name, kind] of [['rocks', 3], ['bushes', 2]]) {
    const mesh = scene.getObjectByName(name);
    if (!mesh || !mesh.isInstancedMesh) continue;
    const base = [];
    for (let i = 0; i < mesh.count; i++) {
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      mesh.getMatrixAt(i, scratchM);
      scratchM.decompose(p, q, s);
      // its own lead, like every other thing, so a scatter field does not
      // snap down as one object
      base.push({ p, q, s, lead: (hash1(i * 13 + 5, ID) - 0.5) * OFFSET });
    }
    fields.push({ mesh, kind, base, wrote: false });
  }

  // Spread each beat's leads across OFFSET, shuffled by hash so the order is
  // scattered through the wood rather than following the order the scatter
  // loop happened to plant them in.
  for (const kind of [0, 1, 2, 3]) {
    const inKind = shrinkers.filter((s) => s.kind === kind);
    const n = Math.max(1, inKind.length - 1);
    inKind
      .map((s, i) => [s, hash1(i * 7 + 1 + kind * 91, ID)])
      .sort((a, b) => a[1] - b[1])
      .forEach(([s], rank) => { s.lead = (rank / n - 0.5) * OFFSET; });
  }

  // THE MOON DOES NOT SHRINK. It is sixty units out, so a smaller moon would
  // read as the moon leaving rather than as the picture doing anything — and it
  // is the one thing here that already goes away cleanly, by colour alone. It
  // can do that because it is UNLIT and unfogged, so a disc painted exactly the
  // sky colour is an exact vanish with no blending involved.
  //
  // What it must NEVER take is `transparent = true`: makeMoon's shader forces
  // `gl_FragColor.a = 0.0` as an ink-mask marker, free while the material is
  // opaque and fatal the instant the blender reads it. This case set that flag
  // once, for an opacity fade, and its moon was INVISIBLE from the day it was
  // staged — which nobody caught, because a missing moon in a scene about
  // things going missing does not look like a bug. k19's header carries the
  // rule in capitals, having been bitten first.
  const SKY_C = new THREE.Color(SKY);
  const moonBase = moon.material ? moon.material.color.clone() : null;
  const MOON_KIND = 3;
  // the hall's own eave chime goes quiet while the hall is not there — a bell
  // ringing over a vanished building is the one thing that would give the
  // trick away. Nobody else writes this: hangChimes sets it once and main.js
  // only ever calls update() (src/kit/chimes.js).
  const hallChimes = hall.chimes || [];
  const chimeWind = hallChimes.map((c) => c.windLevel());

  // ---- the moment: one touch, and the page empties ----------------------
  let camera = null;
  let clock = 0;
  let touches = 0;
  let touchedAt = -1e9;
  const song = [];

  input.onTap(() => {
  if (!camera) return;
  // ANYWHERE, and that includes the hall's own hung fūrin. There is nothing
  // to aim at (case 32's idiom): the reader is not meant to hunt three hit
  // boxes and collect the set, they are meant to touch the picture and watch
  // it go. A first cut probed the chime and swallowed the touch so a tap
  // aimed at the bell would not also empty the page — which is the right
  // instinct on a page with targets and the wrong one here, where "aimed at"
  // is a category that does not exist. The bell rings (main.js sweeps every
  // scene for hung chimes and owns the ringing) and the page empties, and
  // then the hall takes the bell with it, which is a better second beat than
  // a swallowed touch.
  // let the sentence finish — CYCLE plus the widest seeded lead, so the last
  // straggling part is back before another touch can start it over
  if (clock - touchedAt < CYCLE + OFFSET / 2) return;
  touchedAt = clock;
  touches++;
  // three notes as the three things go, lower and softer each time, and one
  // last one under the page when the world comes back
  song.length = 0;
  song.push([clock + 0.7, 1, 0.5], [clock + 0.7 + STAGGER, 2, 0.4],
  [clock + 0.7 + 2 * STAGGER, 3, 0.32], [clock + RETURN_AT, 0, 0.45]);
  });

  return {
  scene,
  setCamera(c) { camera = c; },
  update(dt, simTime) {
  clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
  world.update(dt, simTime);

  const u = clock - touchedAt;
  // EVERY PROP, ON ITS OWN CLOCK. One write each, and the write is a scale —
  // no material is touched, so there is nothing here that the workbench's
  // material swap could take out from under this the way it did case 4.
  for (const s of shrinkers) {
  const k = 1 - (1 - SMALL) * awayAt(s.kind, u - s.lead);
  s.obj.scale.copy(s.base).multiplyScalar(k);
  }
  // the instanced scatter, one matrix at a time. Written only while the
  // gesture is running, plus the one frame that puts it back at rest.
  const running = u >= -OFFSET && u < CYCLE + OFFSET;
  for (const f of fields) {
  if (!running && !f.wrote) continue;
  for (let i = 0; i < f.base.length; i++) {
  const b = f.base[i];
  const k = 1 - (1 - SMALL) * awayAt(f.kind, u - b.lead);
  scratchM.compose(b.p, scratchQ.copy(b.q), scratchS.copy(b.s).multiplyScalar(k));
  f.mesh.setMatrixAt(i, scratchM);
  }
  f.mesh.instanceMatrix.needsUpdate = true;
  f.wrote = running;
  }
  // the moon keeps its colour fade, and nothing else on this page has one
  if (moonBase) moon.material.color.copy(moonBase).lerp(SKY_C, awayAt(MOON_KIND, u));
  // The hall's eave chime rides the hall down: a tenth-scale bell ringing at
  // full voice would be the one thing to give it away. Nobody else writes
  // this — hangChimes sets it once and main.js only ever calls update().
  const hallSize = 1 - awayAt(1, u);
  hallChimes.forEach((c, i) => c.setWindLevel(chimeWind[i] * hallSize));

  while (song.length && clock >= song[0][0]) {
  const [, tube, force] = song.shift();
  audio && audio.chimeStrike({ tube, force, at: scratchPos.set(0.3, 1.4, -2.0) });
  }
  },
  fragment() {
  const u = clock - touchedAt;
  // Sampled at BOTH EDGES of the seeded spread as well as the middle, because
  // every thing on the page carries a lead of up to +-OFFSET/2 and the
  // summary has to be true of the stragglers too: `away` is what the
  // furthest-along thing is doing, `small` is only true once the last one
  // has arrived. Reading the middle alone made `small` go true while a rock
  // with a late lead was still on its way down.
  const edges = [u - OFFSET / 2, u, u + OFFSET / 2];
  const byKind = [0, 1, 2, MOON_KIND].map((i) => edges.map((e) => awayAt(i, e)));
  return {
  touches,
  away: +Math.max(...byKind.flat()).toFixed(3),
  // what the hall is down to, as a fraction of itself — the number the
  // whole gesture is actually made of
  size: +(1 - (1 - SMALL) * awayAt(1, u)).toFixed(3),
  // the held beat this whole case is built around: everything named,
  // all the way down at once
  small: byKind.every((v) => Math.min(...v) > 0.999),
};
      },
      dispose() {},
    };
  },
};
