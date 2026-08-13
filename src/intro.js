import * as THREE from '../lib/three.module.js';
import { PAPER, ACCENT_DEEP, wash } from './palette.js';
import {
  composeWorld, makePath, makeLantern, makeGate, makeMonk,
  makeLights, makeCylinderChime, tapMeshes, SUN_DEFAULT,
} from './kit/index.js';
import { introPath } from './intro_rails.js';

// THE GATE EATS ITSELF. Tap the Contents' gate and it shrinks away to nothing
// while a second gate — huge at first, and so off camera — comes down to land
// exactly where the first one stood, and the loop can run for ever. k47's
// endless road turned inward: passing through the gateless gate leaves you
// before the gateless gate.
//
// BIG is the incoming gate's starting scale. At 12 the posts stand ~18 units
// either side of the road and the lintel ~41 up — all three timbers outside
// the menu frame (distance 13), so the arrival reads as the frame closing down
// around the world rather than an object popping in. Tweak by eye from here.
// The incoming gate travels in LOG space — a linear shrink from 12 spends most
// of its seconds looking huge; even steps in log(scale) is what reads as one
// steady approach. The outgoing gate just closes linearly to nothing: it is
// gone in the same breath, and 1e-3 (not 0) keeps its matrices invertible on
// the frame it vanishes.
const LOOP = { big: 12, span: 2.6 };
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// The idling stage scene behind the title and the table of contents — a small
// world gathering elements from the koans: a path through the freestanding
// gate, lanterns, a monk on the way, mountains and forest in the fog beyond.
//
// The pieces are optional so the matter pages can each have a scene of their
// own without a second copy of this world. Every default is what the title
// screen uses, so buildHub() with no arguments is the title screen exactly as
// it was.
//   preface   — no gate. "No gate as the gate of the teaching": the camera
//               still frames where it stood, and the subject is its absence.
//   afterword — nothing but nature. The stage clears as the book closes.
//
// THE THREE SEEDS are the other half of that. Taking the gate out was not
// enough to tell the three scenes apart — same hills, same trees, same bend in
// the road, so the preface read as the Contents with a prop missing rather than
// as its own place. Each of them now rolls its own
// ground, scatters its own trees and bends its own road, and they stay the
// same PLACE in the way three drawings of one valley do:
//   seed        — trees, rocks, bushes, grass, mountains, forest
//   groundSeed  — the roll of the land itself
//   pathSeed    — how the road wanders, and so where the gate, the lanterns and
//                 the monk stand on it (gateTarget is a point on this path)
// The title screen's three are FIXED by the intro dolly, which is hand-aimed at
// the gate on this road (src/intro_rails.js) — change them and the opening shot
// walks past the gate instead of through it.
export function buildHub({
  gate: withGate = true, path: withPath = true,
  monk: withMonk = true, lanterns: withLanterns = true,
  seed = 10, groundSeed = 7, pathSeed = 93,
  // Where the key stands (render/lights.js). Out here because the hub is built
  // twice — the title screen and Contents on one side, the afterword on the
  // other — and those are two different places under two different suns, the
  // same way they are two different rolls of the land.
  sun = SUN_DEFAULT,
  // The horizon, passed straight to composeWorld. Out here because no seed can
  // fix a wall: fourteen peaks over this arc leave no bearing the road can run
  // out on without ending in one, so a scene that wants its road to vanish into
  // haze has to thin the band, not reroll it.
  mountains = [
    { count: 9, distance: 55, arcSpan: 3.8, color: wash(0.16) },
    { count: 5, distance: 35, arcSpan: 2.6, color: wash(0.28), hScale: 0.7 },
  ],
} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.03);
  // The hub frames deeper than a case: the rig orbits gateTarget at distance
  // 14, so its foreground starts ~12 units camera-side of the gate. At the
  // default shadow fit (focus [1.2,0,0.3], r 10) every near tree's canopy sat
  // outside the frustum and its shadow truncated mid-ground, cutting off the
  // shadow of the nearest tree in frame. Centered between the gate and the
  // camera side and widened just enough that every caster whose shadow can land
  // in frame fits; 2048/30 ≈ 68 texels/unit, still contact-shadow territory,
  // not the 56-unit mush lights.js warns about.
  scene.add(makeLights({ focus: [4.5, 0, 0], radius: 15, sun }));

  // The path is ALWAYS built: it is the placement maths for the gate, the
  // lanterns and the monk, and gateTarget is a point on it. Only whether it is
  // drawn is optional — and when it is not drawn its keepout must go too, or
  // the scatter leaves a bald strip where it used to be.
  const path = makePath({ from: [0, 14], to: [0, -36], width: 2.0, seed: pathSeed, groundSeed, wander: 1.0 });
  if (withPath) scene.add(path);

  const gp = path.sample(0.4);
  const keepout = [];
  if (withPath) keepout.push(...path.keepout(26, 1.3));

  // THE gate. Every case marks its one red thing — the dog, the flower, the
  // bowl, the flag, the buffalo — and the title screen had no seal at all, which
  // left the one image the whole book is named for as the only grey subject in
  // it. A torii is a big timber frame rather than a held object, so it takes the
  // deep mix; full accent across those posts would glare.
  let gate = null;
  let gateB = null;
  if (withGate) {
    gate = makeGate({ width: 3.0, height: 3.4, color: ACCENT_DEEP });
    gate.position.set(gp.x, 0, gp.z);
    gate.rotation.y = gp.heading;
    scene.add(gate);
    // the recursion's other half: an identical gate parked hidden on the same
    // spot, waiting to be the enormous incoming one (see LOOP above). Two
    // gates swapping roles for ever, k47's four-gates-five-slots idiom at its
    // smallest possible size.
    gateB = makeGate({ width: 3.0, height: 3.4, color: ACCENT_DEEP });
    // its own name: tests/matter.test.js counts exactly ONE 'gate' in the hub,
    // and that stays true — this object is the echo, whichever of the two
    // happens to be standing in the composition after an even number of loops
    gateB.name = 'gate-echo';
    gateB.position.set(gp.x, 0, gp.z);
    gateB.rotation.y = gp.heading;
    gateB.visible = false;
    scene.add(gateB);
  }

  let lanternA = null, lanternB = null;
  if (withLanterns) {
    const lw = 2.0;
    lanternA = makeLantern({});
    lanternA.position.set(gp.x + gp.perp.x * lw, 0, gp.z + gp.perp.z * lw);
    lanternA.rotation.y = gp.heading;
    lanternB = makeLantern({ height: 1.0 });
    lanternB.position.set(gp.x - gp.perp.x * lw, 0, gp.z - gp.perp.z * lw);
    lanternB.rotation.y = gp.heading;
    scene.add(lanternA, lanternB);
  }
  // One keepout covers the gate AND the lanterns, so it is needed if EITHER
  // stands there. The preface keeps its lanterns after the gate goes.
  if (withGate || withLanterns) keepout.push({ x: gp.x, z: gp.z, r: 4.2 });

  // One monk, nearly at the gate, walking toward it. The flag that used to
  // stand across the road is gone: once the gate went red it became the seal of
  // this scene, and a second red thing beside it split the focus — the title
  // screen is ABOUT the gate, so the gate stands alone.
  let monk = null;
  if (withMonk) {
    const mp = path.sample(0.32);
    monk = makeMonk({});
    monk.position.set(mp.x + mp.perp.x * .5, 0, mp.z + mp.perp.z * 1.1);
    monk.rotation.y = mp.heading;                  // facing through, like the dolly
    scene.add(monk);
    keepout.push({ x: monk.position.x, z: monk.position.z, r: 1.6 });
  }

  const world = composeWorld(scene, {
    seed,
    groundSeed,
    // THE TREES OF THIS SCENE, spelled out rather than left to composeWorld's
    // defaults, because this is the world most likely to want them moved and
    // they were invisible knobs before. How many, and the ring of radii they may
    // stand on around the origin — scenery.js places them by seeded rejection
    // sampling on that ring, skipping anything inside a `keepout` circle or
    // nearer than z = 6 (the open foreground). So there are three ways to move
    // them and they are all here: change the count, widen or narrow the ring, or
    // push one off a spot with a keepout circle. `seed` is the fourth and
    // bluntest — it reshuffles the rocks, bushes and grass with them.
    trees: 20,
    treeRing: [7, 20],
    keepout,
    grassKeepout: withPath ? path.keepout(26, 1.15) : [],   // only the lane clears grass
    mountains,
  });

  // ---- the recursion ------------------------------------------------------
  // `out` is the gate on the road (shrinking to nothing once tapped), `in` the
  // one arriving from far too big. They swap at settle, so whichever object is
  // standing in the composition is always at scale 1 and tappable.
  let outGate = gate, inGate = gateB;
  const gateTargets = new Map();
  if (gate) { gateTargets.set(gate, tapMeshes(gate)); gateTargets.set(gateB, tapMeshes(gateB)); }
  let clock = 0;
  let loopAt = -99;
  let loops = 0;
  let settled = true;

  // the meadow breathes, so the idling scene is never static
  return {
    scene,
    // Probe a tap against the CURRENT gate; returns the hit (or null). The
    // caller owns input and audio (main.js's clearInput idiom), this scene
    // owns what the touch means. Refused mid-loop: a second tap restarting
    // the shrink from half-way is exactly the janky class the audit cut.
    tapGate(camera, input) {
      if (!gate || clock - loopAt < LOOP.span) return null;
      const hit = input.raycastFirst(camera, gateTargets.get(outGate));
      if (!hit) return null;
      loopAt = clock;
      loops++;
      settled = false;
      inGate.visible = true;
      return hit;
    },
    loops: () => loops,
    // where the menu camera should centre: the gate is the subject of this
    // scene, and the old hardcoded target sat four units in front of it, so the
    // orbit swung around empty road while the gate drifted off-axis. The matter
    // pages keep the same centre even with the gate gone.
    gateTarget: [gp.x, 1.9, gp.z],
    // What the scatter actually did, for a caller that has to put something
    // beside it — the afterword seats its Buddha under one of these trees, and
    // it used to do that by holding a copy of a coordinate this function
    // produced. Which was wrong the moment anyone touched a seed, silently: the
    // tree moved and the meditator stayed, sitting in open grass. Handing back
    // the trees and the seed means that pairing is DERIVED, and survives.
    trees: world.trees,
    groundSeed,
    update: (dt, t) => {
      clock = Number.isFinite(t) ? t : clock + (dt || 0);
      world.update(dt, t);
      if (!gate || loopAt <= -99) return;
      const u = clock - loopAt;
      if (u < LOOP.span) {
        const p = ease(u / LOOP.span);
        // out: closes linearly to (almost) nothing. in: descends in log space
        // from BIG to exactly 1 — see LOOP's header for why the spaces differ.
        outGate.scale.setScalar(Math.max(1e-3, 1 - p));
        inGate.scale.setScalar(Math.exp(Math.log(LOOP.big) * (1 - p)));
      } else if (!settled) {
        // the swap, once, after the flight: the arrived gate IS the gate now,
        // the vanished one parks hidden at scale 1 to be the next arrival
        settled = true;
        outGate.visible = false;
        outGate.scale.setScalar(1);
        inGate.scale.setScalar(1);
        const was = outGate; outGate = inGate; inGate = was;
      }
    },
    dispose() {},
  };
}

// Set by eye, twice: the longer road at 9 read as too long, so it is back to
// the original 7 — over a road that is now a third longer and goes all the way
// through the gate. Same length of time, more ground covered, so the walk is
// brisker than it used to be.
const INTRO_SECONDS = 7;

// Returns the title-screen panel view + the dolly driver.
// camera is a THREE.PerspectiveCamera. Options: onDone(), onSound(bool).
export function makeIntro(camera, { onDone, onSound } = {}) {
  let u = 0, done = false;

  // No "Sound?" prompt any more: the title just names the book. Sound is on by
  // default and the mute button in the toolbar is always there, so there is
  // nothing to ask. The credit/link line can grow here later.
  const el = document.createElement('div');
  el.className = 'gg-view gg-title-view';
  el.innerHTML = '<h1>The Gateless Gate</h1>'
    + '<p class="sub">An interactive edition of the Mumonkan</p>';

  function apply() {
    const { pos, look } = introPath(u);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }
  apply();

  function finish() {
    if (done) return;
    done = true;
    onDone && onDone();
  }

  return {
    el,
    get done() { return done; },
    update(dt) {
      if (done) return;
      u = Math.min(1, u + dt / INTRO_SECONDS);
      apply();
      if (u >= 1) finish();
    },
    skip() { finish(); },
    dispose() { el.remove(); },
  };
}
