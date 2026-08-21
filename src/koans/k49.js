import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, ACCENT_DEEP, WASH } from '../palette.js';
import {
  composeWorld, makePath, makeBasin, makeWater, makeKoi, makeBirds, makeMonk, faceMonk, makeLantern,
  makeGate, makeLights, makeCylinderChime,
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
// every unstaged case — and holds them quiet. And it ends on a red torii gate
// standing at the head of the path — the same gate the title screen opens on,
// so the reader leaves by the door they entered — the last and only warm mark
// in the book. (It was Amban's ENSO for a while, a circle drawn as one
// brushstroke; the torii is the shipped seal.) Everything is here.
//
// It used to be the bare default landscape (a place the koan had not been set
// in). That was a fair ending, but this is the intended one.
// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
// ---- THE GATE OPENS -------------------------------------------------------
// Touch the torii and it GROWS: bottom still flush with the ground it stands
// on, up and out past the edges of the frame until the posts are off both sides
// and the lintel is over the top — at which point there is no gate on the page
// at all, only the country it framed. Then it comes back to its own size.
//
// It is the right gesture for the last page of the book. This is the gate the
// title screen opens on and the whole book's one red thing; the afterword past
// it registers no tap at all. The reader's last act is to make the gateless
// gate large enough to walk through without noticing, which is the only joke
// the Mumonkan tells in its own title.
//
// SCALED ABOUT ITS OWN ORIGIN, which makeGate puts at the foot of the posts, so
// growing it keeps it planted rather than lifting it off the road. The chime
// hung under its lintel is a child and grows with it — deliberate: a bronze
// tube left hanging at its own size in mid-air while the beam it hangs from
// leaves the frame would be the one thing that gave the trick away.
// MEASURED, not guessed: the timber leaves the home frame between 3x and 4x —
// the posts pass the sides, the tie and the lintel go over the top — and is
// well clear of a narrow reading pane as well as of 16:9 by 9x. GROW is tuned
// by eye above that floor. There is a ceiling on how far it is worth taking:
// the gate stays in its own plane about twelve units out, so however wide it
// grows it never crosses the near plane, and past the point where it has
// already gone there is nothing left to see it do.
//
// It never clears at EVERY heading, and cannot: an object big enough to stand
// around the camera has some part of itself in shot from somewhere. That is the
// look's problem and the look's privilege — this is composed for home.
const GROW = 12;
const GROW_IN = 2.6;      // out, slowly
const GROW_HOLD = 1.8;    // held there, which is the beat where the gate is gone
const GROW_OUT = 3.4;     // and slower still coming back
const GROW_SPAN = GROW_IN + GROW_HOLD + GROW_OUT;
const growEase = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// 1 at rest, GROW at the widest. A pure function of seconds since the touch, so
// nothing accumulates and it is exactly its own size again afterwards.
function growAt(u) {
  if (!(u >= 0) || u >= GROW_SPAN) return 1;
  let k;
  if (u < GROW_IN) k = growEase(u / GROW_IN);
  else if (u < GROW_IN + GROW_HOLD) k = 1;
  else k = 1 - growEase((u - GROW_IN - GROW_HOLD) / GROW_OUT);
  // geometric rather than linear: the last doublings have to take as long as
  // the first or the whole thing arrives in the first half-second and then
  // creeps
  return Math.pow(GROW, k);
}

const CAM = { distance: 12.5, target: [0.2, 1.5, -2.4], heading: 33.1, pitch: 21.2 };
  export default {
  id: ID,
  slug: 'amban-s-addition',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 3,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // Amban wrote this one's comment and verse, and the source headings say so.
  labels: TEXT[ID].labels,
  // Used to carry a water bed (water:0.26); off for the same reason as every
  // other pond and basin in the book — see makeWaterBed's comment in
  // synths.js. A tap on the water still rings a drip.
  // 'cylinder' names the single deep bronze hung under the closing gate's
  // own lintel — the same red torii the intro opens on, so it earns a
  // settled, single note rather than the lively cluster case 29 and case 47
  // give their own gates: the book is at rest, not arguing about the wind.
  ambience: ['wind:0.16', 'birds', 'cylinder', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.028);
  // The last page: the day ending behind the same torii the book
  // opened on, with the shadows running back toward the reader.
  scene.add(makeLights({ sun: { heading: 161, pitch: 40 } }));
  
  // the path that has run under the whole book, one last time, straight down
  // into the fog
  const road = makePath({ from: [0.4, 9], to: [-7.4, -29.2], width: 1.6, seed: ID, groundSeed: 21, wander: 2.7 });
  scene.add(road);
  
  const lantern = makeLantern({ height: 1.1 });
  lantern.position.set(-2.8, 0, -2.5);
  scene.add(lantern);
  
  // ---- the pond, off to the left ----------------------------------------
  const POND = { x: 2.1, z: -1.6, size: 4.2, inner: 2.15, outer: 2.55, rim: 0.42, floor: 0.02, surface: 0.3 };
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
  length: 0.66, depth: 0.19, surfaceAt: water.swellAt,
  });
  koi.group.position.set(POND.x, POND.surface, POND.z);
  scene.add(koi.group);
  
  // ---- birds crossing the sky -------------------------------------------
  const birds = makeBirds({ count: 7, seed: ID, center: [0.5, -3.0], height: 6.4, spread: 5.4 });
  scene.add(birds.group);
  
  // ---- the traveller, PAST the gate, walking on -------------------------
  // The reader, at the end — already through the gate, a little way down the
  // far side, back to us, walking on into the fog. He has passed through; the
  // book is behind him.
  const you = makeMonk({ height: 1.6, elder: true });
  const yb = road.sample(0.56);
  const yp = { x: yb.x + yb.perp.x * 0.35, z: yb.z + yb.perp.z * 0.35 };
  you.position.set(yp.x, .1, yp.z);
  scene.add(you);
  
  // ---- THE GATE, at the head of the path -------------------------------
  // A red torii straddling the road, the way out of the book — and the same
  // gate the title screen opens on, so the reader leaves through the door they
  // came in by. It is the whole book's one red thing. Deep red rather than
  // full accent: a big timber frame in bright vermillion would glare (the
  // same call the intro gate makes).
  const gate = makeGate({ width: 2.6, height: 3.0, color: ACCENT_DEEP });
  const ep = road.sample(0.34);
  gate.position.set(ep.x, 0, ep.z);
  gate.rotation.y = ep.heading;    // its opening aligned down the path
  scene.add(gate);
  
  // One bronze cylinder hung toward one end of the lintel's own flat span,
  // not dead centre over the road — local to the gate so it stays square
  // to it wherever the road happens to place it. |x| < width*0.364 stays
  // flush underside (k29's own derivation); -0.75 sits close to that edge
  // at this width (2.6, span |x| < 0.946) rather than near the middle.
  const closingChime = makeCylinderChime({
  size: 0.4, seed: 49, cordLength: .2,
  onStrike: (note, force, pos) => audio && audio.cylinderStrike({ note, force, at: pos }),
  });
  closingChime.group.position.set(-0.75, 2.5, 0);
  gate.add(closingChime.group);
  
  const world = composeWorld(scene, {
  view: CAM,
  seed: 24,
  groundSeed: 21,
  trees: 4,
  keepout: [
  ...road.keepout(33, 2),
  { x: POND.x, z: POND.z, r: POND.outer + 0.8 },
  { x: yp.x, z: yp.z, r: 1.0 },
  { x: ep.x, z: ep.z, r: 1.4 },
  ],
  grassKeepout: [...road.keepout(26, 1.0), { x: POND.x, z: POND.z, r: POND.outer + 0.4 }],
  // the book at rest. Each is the same number its workbench slider reads —
  // these three are the stock weather; drag a slider, then type what you found.
  // grassGustScale is a frequency like its "Gust patch" slider: LOWER = broader.
  grassWind: 4.5,        // "Grass wind"  — how far the grass leans
  grassGustScale: 0.1,   // "Gust patch"  — gust breadth (~1/value units across)
  grassGustSpeed: 4.1,   // "Gust drift"  — how fast gusts cross the meadow
  });

  // face him on down the road, away from us — he has gone through
  const away = road.sample(0.1);
  faceMonk(you, { x: away.x, z: away.z });
  
  // ---- the moment: pass through -----------------------------------------
  // Touch the gate and a bell sounds, once, the way a temple bell marks a
  // threshold. Touch the water and it rings where you touched. Nothing here is
  // a puzzle; the book is over.
  const gateHit = new THREE.Mesh(
  new THREE.BoxGeometry(2.9, 3.2, 0.8),
  new THREE.MeshBasicMaterial({ visible: false }));
  gateHit.name = 'gate-hit';
  gateHit.position.set(ep.x, 1.6, ep.z);
  gateHit.rotation.y = ep.heading;
  scene.add(gateHit);
  
  const surface = water.group.children.find((c) => c.name === 'surface');
  
  let camera = null;
  let clock = 0;
  let rings = 0;
  let rippled = 0;
  let grewAt = -99;

  // brushing the water stirs it — mini-ripples by pointer speed (the
  // water's breeze; see stir in src/kit/water.js). Silent: the drip is the tap's.
  input.onHover(() => {
  if (!camera || !surface) return;
  const hit = input.raycastFirst(camera, [surface]);
  if (!hit) return;
  const local = water.group.worldToLocal(hit.point.clone());
  water.stir(local.x, local.z);
  });

  input.onTap(() => {
  if (!camera) return;
  // the closing chime first: it hangs inside the gate's own big
  // forgiving hit-box, so it has to be probed and returned on before
  // that box gets a chance to ring the passage-bell instead
  if (closingChime.pick(camera, input)) { closingChime.ring(0.75); return; }
  if (input.raycastFirst(camera, [gateHit])) {
  // ONE RING, AS THE GATE STARTS TO GROW — "the opening" here is this
  // page's own gesture, nothing to do with the title screen (the torii is
  // built fresh above; only its design is shared). The guard is the
  // gesture's clock rather than a cooldown of the bell's own, because the
  // hit box stays behind at the size and place the gate started while the
  // gate itself grows past clickable: unguarded, the empty spot kept
  // ringing mid-open — a gate you could see and another you could hear.
  if (clock - grewAt < GROW_SPAN) return;
  touched && touched();
  grewAt = clock;
  rings++;
  // the voice of the threshold: bell({ preset, size, gain }) — preset
  // 'hand' | 'temple' | 'great' picks the bonsho, size overrides its
  // depth, gain the loudness
  audio && audio.bell({ preset: 'hand', gain: 0.5, at: gate.position });
  return;
  }
  if (surface) {
  const hit = input.raycastFirst(camera, [surface]);
  if (hit) {
  // no touched() — the gate is the find that closes the book (above)
  const local = water.group.worldToLocal(hit.point.clone());
  water.ripple(local.x, local.z);
  koi.startle();      // ...and the fish put on a little speed (kit/koi.js)
  audio && audio.drip({ loud: true, at: hit.point });
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
  closingChime.setWindLevel(1);   // a settled wind — see k47's furin
  closingChime.update(dt, simTime);
  gate.scale.setScalar(growAt(clock - grewAt));
  },
  fragment() {
  return {
  rings, rippled, koi: koi.fishCount(), birds: birds.count(),
  chimeStrikes: closingChime.strikes(),
  // 1 at rest, GROW at the widest
  gateScale: +gate.scale.x.toFixed(3),
};
      },
      dispose() {},
    };
  },
};
