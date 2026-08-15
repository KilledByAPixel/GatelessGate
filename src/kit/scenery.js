import { makeGround, groundHeight } from './ground.js';
import { makeMountains, mountainFootprints } from './mountains.js';
import { makeForest } from './forest.js';
import { makeRocks, makeBushes, makeBoulder } from './scatter.js';
import { grassReach, grassArea, GRASS_BASE_AREA } from './grassfield.js';
import { makeTuftField } from './tuftfield.js';
import { makeGrassShade } from './grassshade.js';

// THERE IS ONE GRASS RENDERER. There were two — makeGrassField's geometric
// blades and makeTuftField's camera-facing cards — chosen between here off a
// `grassStyle` flag driven by a workbench switch that shipped defaulting to
// tufts and never moved. The blades were dev-only for their whole life, so
// every retune of the meadow had two places to land and one of them did not
// matter. They were cut; the cards are the grass.
import { makeTree } from './tree.js';
import { makePine } from './pine.js';
import { makeOak } from './oak.js';
import { hash1 } from '../util/noise.js';
import { wash } from '../palette.js';

const TAU = Math.PI * 2;
const SPECIES = { tree: makeTree, pine: makePine, oak: makeOak };

// ONE TREE, WHERE YOU SAY. composeWorld scatters the midground on a ring and
// keeps it off the staging; this is the other thing a case wants — "put a pine
// THERE" — and it used to be four lines every time, one of which (the y) was
// usually wrong.
//
// plantTree(scene, { x: 6.2, z: -3.4, kind: 'pine', height: 4.4 })
//
// Only x and z are required. `kind` is 'tree' (broadleaf), 'pine' or 'oak';
// `height` falls through to the species default; `rotation` is seeded from the
// position when you don't name one, so two trees never stand in the same pose
// and the same file always builds the same wood. Anything else you pass goes
// straight to the builder (canopyColor, trunkColor, reach — the pine takes
// `color`, the other two take the pair).
//
// IT DELIBERATELY DOES NO KEEPOUT WORK. This is the override — you asked for a
// tree at that spot, so it stands there, and if scatter should stay off it the
// case adds `{ at: <the returned tree>, r }` to composeWorld's keepout list.
//
// The y is the whole reason this exists. groundHeight is flat within nine units
// of the origin, so every tree hand-placed near the middle of a scene got away
// with y = 0 for years; out past that the terrain rolls a unit either way and a
// tree at 0 floats or sinks — the fog-line stands sat buried. This samples the
// same surface the scatter does, and takes `groundFn` for a case whose ground
// is more than the terrain function.
//
export function plantTree(scene, {
  x = 0, z = 0,
  kind = 'tree',
  height = null,
  rotation = null,
  seed = null,
  groundSeed = 21,
  groundFn = null,
  sink = 0.06,           // the scatter's own, so a trunk never hovers on a slope
  ...opts
} = {}) {
  const build = SPECIES[kind];
  // A hard error, not a fall-through to the broadleaf: a typo'd species that
  // quietly plants the default is a scene that looks wrong with nothing to read.
  if (!build) throw new Error(`plantTree: unknown kind "${kind}" — tree, pine or oak`);

  // Seeded from WHERE IT STANDS when no seed is given. Determinism holds (no
  // Math.random anywhere), two trees at different spots differ without being
  // told to, and nudging one re-rolls its shape — which is the right default
  // for a prop being placed by eye, and overridable with `seed` the moment a
  // particular tree is worth keeping.
  const key = seed === null ? (Math.round(x * 1000) * 31 + Math.round(z * 1000) * 131) | 0 : seed;

  const t = build({ seed: key, ...(height === null ? {} : { height }), ...opts });
  const y = (groundFn ? groundFn(x, z) : groundHeight(x, z, { seed: groundSeed })) - sink;
  t.position.set(x, y, z);
  t.rotation.y = rotation === null ? hash1(key, 7717) * TAU : rotation;
  if (scene) scene.add(t);
  return t;
}

// ONE BOULDER, WHERE YOU SAY — plantTree's sibling, for rock. Same contract:
// only x and z required, y sampled from the same surface the scatter uses
// (hand-placed y = 0 floats or sinks past the flat nine units), rotation and
// shape seeded from the position unless pinned, and DELIBERATELY NO KEEPOUT
// WORK — this is the override, so the case adds { at: <the rock>, r } itself.
// `size` is a plain scale on the ~1-unit lump cluster: 1.5–2.2 is "boulder",
// chest-high to head-high beside a 1.6-unit figure.
export function plantRock(scene, {
  x = 0, z = 0,
  size = 1.0,
  seed = null,
  rotation = null,
  groundSeed = 21,
  groundFn = null,
  sink = 0.12,           // the scatter's own, scaled with the rock like its instances
  color,
} = {}) {
  const key = seed === null ? (Math.round(x * 1000) * 31 + Math.round(z * 1000) * 131) | 0 : seed;
  const rock = makeBoulder({ size, seed: key, ...(color === undefined ? {} : { color }) });
  const y = (groundFn ? groundFn(x, z) : groundHeight(x, z, { seed: groundSeed })) - sink * size;
  rock.position.set(x, y, z);
  rock.rotation.y = rotation === null ? hash1(key, 7717) * TAU : rotation;
  if (scene) scene.add(rock);
  return rock;
}

// A keepout circle, written the way a case actually thinks about it: "keep the
// scatter off THIS THING". Pass anything with a `.position` — a monk, a hut, a
// group — and it reads the coordinates off it.
//
// The alternative was writing them twice: `monk.position.set(3.6, 0, 3.4)` and
// then `{ x: 3.6, z: 3.4, r: 1.2 }` a few lines later, two sets of numbers for
// one fact. They drift the moment anyone nudges a figure, and nothing fails —
// the scatter just quietly stops respecting something, or clears a bald patch
// of grass where nothing stands any more.
//
// Still takes plain `{x, z, r}` for the circles that are not objects: a path's
// own keepout(), a swathe of open water, the air over a gorge.
export function around(obj, r) {
  const p = obj && obj.position ? obj.position : obj;
  return { x: p.x, z: p.z, r };
}

// And the same thing accepted inline, so `{ at: monk, r: 1.2 }` works in the
// list without a wrapping call. Normalised once here, so everything downstream
// — rocks, bushes, both grass fields — still sees nothing but {x, z, r}.
const asCircle = (k) => (k && k.at ? around(k.at, k.r) : k);

// CAN THE READER EVER SEE THIS SPOT?
//
// Half the midground trees in the book stand where the lens never points: 51%
// are outside the frame at the home framing and 18% are outside it at EVERY
// heading the orbit can reach. Those last ones are pure waste — nothing should
// spawn where the camera can never point — and because the placement loop
// RETRIES on a rejection, refusing them does not thin the wood, it moves those
// trees to where they show. Same budget, more scene.
//
// The test is horizontal only, and deliberately: a tree is tall, the pitch
// drifts, the reader drags, and the vertical edges of the frame are the ones a
// mistake is invisible in until somebody looks up. Left and right are what a
// 103-degree orbit actually moves.
//
// The margins are chosen against what the frame can actually be, because the
// cost of being wrong is a bald wedge that appears when the reader drags:
//
//   HALF_VIEW is deliberately WIDER than the shipped lens at any window shape
//   anyone will open the book in, with the pointer parallax and the ambient
//   drift allowed for on top. A tighter margin relocates more trees, but buys
//   it by assuming a frame narrower than an ultrawide monitor actually gives.
//
//   ARC_SAMPLES spans the drag range. Visibility over the arc is smooth, and
//   anything wide enough to be worth drawing is visible across far more than
//   one step.
//
//   PAD is canopy, added as a real angle at the distance in hand: a trunk just
//   outside the frame still shows its leaves. (This was briefly subtracted in
//   COSINE space, which at these angles is worth about three times the angle
//   intended and quietly cut the cull to a third of its size.)
const HALF_VIEW = 42;
const ARC_SAMPLES = 13;
const PAD = 1.5;
const DEG = Math.PI / 180;

export function seenFrom(x, z, view) {
  const { heading = 31.5, pitch = 17.2, distance = 11.5, target = [0, 1.1, 0], headingRange = 51.5 } = view;
  const R = distance * Math.cos(pitch * DEG);                  // the eye's own radius, in plan
  for (let i = 0; i < ARC_SAMPLES; i++) {
    const h = (heading - headingRange + (2 * headingRange * i) / (ARC_SAMPLES - 1)) * DEG;
    const ex = target[0] + R * Math.sin(h), ez = target[2] + R * Math.cos(h);
    const vx = x - ex, vz = z - ez;
    const d = Math.hypot(vx, vz);
    if (d < 1e-6) return true;                                 // standing on the lens
    // forward is the way the lens points: from the eye back toward the target
    const cos = (vx * -Math.sin(h) + vz * -Math.cos(h)) / d;
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
    if (ang <= HALF_VIEW + Math.atan(PAD / d) / DEG) return true;
  }
  return false;
}

// The shared scene grammar: every case sits in the same kind of world —
// rolling ground, mountains and forest in the fog, and a dressed midground
// (scatter trees, rocks, bushes, grass). Foreground staging stays per-koan.
// `keepout` circles ({x, z, r}, or {at: object, r}) protect staging and paths
// from scatter.
export function composeWorld(scene, {
  seed = 1,
  groundSeed = 21,
  // The earth's own value. Almost always WASH.ground — but a scene under snow
  // is a scene where the ground has gone pale, and that is one parameter, not
  // a second world grammar.
  groundColor = null,
  // A coast, passed straight through to the ground (see groundHeight). The
  // case is responsible for keeping scatter and grass off the water with
  // keepout circles — placement never samples the shore itself.
  shore = null,
  keepout = [],
  // Grass wants a DIFFERENT mask from props. A rock must not spawn inside a
  // monk, but grass should grow right up around his feet — clearing a wide
  // circle around every figure is what makes a meadow look staged. Pass only
  // what genuinely covers the ground here (a worn trail, a stone base).
  // Defaults to `keepout` so existing callers keep their old behaviour.
  grassKeepout = null,
  // (x, z) => y of the surface the grass stands on, for a case whose ground is
  // more than the terrain function — k11's rise is a prop the terrain knows
  // nothing about, and grass planted at terrain height knifed up through it.
  // The case owns the shape, so the case supplies the function (typically
  // max(groundHeight, its own relief)); absent, the fields keep planting at
  // groundHeight(groundSeed) — this world's own terrain — exactly as before.
  groundFn = null,
  trees = 5,
  treeRing = [7, 20],
  // The scatter's species, so a case controls what grows in it: 'tree' (the
  // broadleaf, bit-identical to before this option existed), 'pine', or 'mixed'
  // — a seeded half-and-half. The wind FLAVOR in a case's ambience
  // ('wind:0.2:pine') is a separate, audio-only choice; matching the two is the
  // case's own job.
  treeKind = 'mixed',
  // The case's own framing, so the scatter can refuse spots the reader can
  // never look at (seenFrom, above). Pass the same object the module's
  // `camera:` names. Absent, nothing is culled beyond the old z > 6 rule and
  // the placement is bit-identical to before this existed.
  view = null,
  rocks = 12,
  bushes = 9,
  // Blades in the instanced field, not clumps. This used to be 52000 back when
  // patchiness threw half of them away; once the field stopped cutting holes in
  // itself every one of them got placed and the meadow turned into a mat.
  //
  // The number is quoted for the base reach and taper. Move either and the
  // budget scales with grassArea, below — otherwise pushing the meadow out just
  // spreads the same grass thinner, which is not what "further" means.
  grass = 34000,
  // How far the meadow reaches and where it starts dissolving. Default to the
  // module-level pair the workbench's two sliders drive (grassfield.js), so a
  // case can still pin its own and be immune to the sliders.
  grassRadius = null,
  grassTaper = null,
  // THE DARK UNDER THE GRASS: true for the tuned default, a 0..1 number to set
  // how deep it goes, false to switch it off for a page that wants clean ground
  // (a snowfield, a swept apron). See grassshade.js — it is occlusion baked into
  // the ground's colour, not a shadow, because a field of camera-facing cards
  // cannot cast one that holds still.
  grassShade = true,
  // HOW WINDY THIS CASE IS, for the grass alone. Each one is THE SAME NUMBER
  // ITS WORKBENCH SLIDER SHOWS — find a value by dragging, type that value
  // here. Not multipliers: a multiplier means the case reads differently
  // depending on where the slider happened to be left, which is the opposite
  // of pinning a scene's weather.
  //
  //   grassWind       "Grass wind"  — amplitude. How far a tuft leans, at an
  //                   unchanged rate; a big value is a stronger wind, never a
  //                   faster one.
  //   grassGustScale  "Gust patch"  — a FREQUENCY, like the slider: LOWER is a
  //                   broader gust (the patch is ~1/value world units across).
  //   grassGustSpeed  "Gust drift"  — world units/sec the gust field slides
  //                   downwind; the knob that makes wind visibly travel
  //                   through the meadow instead of it breathing in place.
  //
  // null means "whatever the slider says", which is what every case did before
  // these existed, so leaving them out changes nothing. A case that DOES pin a
  // value hands it to its slider on arrival, so the panel shows what the page
  // is actually doing and dragging still auditions from there.
  //
  // The grass only. A chime's liveliness is its own setWindLevel() and the
  // audible wind is the ambience recipe's `wind:` token — three dials, on
  // purpose, because a still-looking meadow under a ringing eave is a real
  // picture and one number could not ask for it.
  grassWind = null,
  grassGustScale = null,
  grassGustSpeed = null,
  forests = [
    { center: [-19, 0, -27], spread: 13, count: 55 },
    { center: [16, 0, -31], spread: 14, count: 40, color: wash(0.55) },
  ],
  mountains = [
    { count: 8, distance: 52, arcSpan: 3.6, color: wash(0.16), hScale: 0.7 },   // farthest band
    { count: 5, distance: 33, arcSpan: 2.4, color: wash(0.28), hScale: 0.5 },
  ],
} = {}) {
  // one shape from here down, whichever way the case wrote them
  keepout = keepout.map(asCircle);
  if (grassKeepout) grassKeepout = grassKeepout.map(asCircle);

  const ground = makeGround({
    seed: groundSeed,
    ...(groundColor ? { color: groundColor } : {}),
    ...(shore ? { shore } : {}),
  });
  scene.add(ground);
  // The mountains' base circles, computed ONCE from the same seeds the meshes
  // use: forests and scatter trees refuse to stand inside them — otherwise
  // trees stand inside the mountain. 0.85·r is where a trunk starts piercing
  // visible rock; the very skirt stays plantable and reads as brush at fog
  // distance.
  const footprints = mountains.flatMap((m, i) =>
    mountainFootprints({ seed: seed * 31 + i * 7, ...m }));

  // WHAT THIS WORLD WAS TOLD, left on the scene for the layout guides to draw
  // (src/dev/overlay.js, the workbench's "Layout guides"). Keepouts and
  // footprints are invisible by nature — they are circles nothing is ever drawn
  // at — so the only way to see whether one is guarding the thing it was
  // written for has been to move a prop and look at what the scatter did. Data
  // only: no meshes, no draws, nothing rendered unless the guides are switched
  // on. Recorded AFTER asCircle, so the guides show the circles that were
  // actually applied rather than the mixture of forms the case wrote.
  scene.userData.layout = {
    groundSeed,
    groundFn,
    keepout,
    grassKeepout: grassKeepout || keepout,
    treeRing: [treeRing[0], treeRing[1]],
    footprints,
  };
  mountains.forEach((m, i) => scene.add(makeMountains({ seed: seed * 31 + i * 7, ...m })));
  // The fog-line stands follow the case's treeKind ('tree' keeps their
  // classic mixed blend — an all-sapling fog line was nobody's ask), and
  // they plant on this world's own terrain. A forest entry's own fields
  // (via ...f) still override both.
  forests.forEach((f, i) => scene.add(makeForest({
    seed: seed * 41 + i * 11, avoid: footprints, groundSeed,
    ...(treeKind !== 'tree' ? { kind: treeKind } : {}),
    ...f,
  })));

  // midground trees: real kit trees on a ring, avoiding keepouts
  const sceneTrees = [];
  let placed = 0, tries = 0;
  while (placed < trees && tries < trees * 14) {
    tries++;
    const a = hash1(tries * 5 + 2, seed * 17) * Math.PI * 2;
    const r = treeRing[0] + hash1(tries * 5 + 3, seed * 17) * (treeRing[1] - treeRing[0]);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 6) continue; // keep the near-camera foreground open
    // ...and off the spots no reachable heading can see. A rejection costs a
    // try, not a tree: the loop keeps going until it has placed its quota, so
    // this moves the wood into frame rather than thinning it.
    if (view && !seenFrom(x, z, view)) continue;
    if (keepout.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    if (footprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r * 0.85)) continue;
    // hash1 is stateless, so the extra draw for 'mixed' shifts no existing
    // stream — 'tree' scenes stay bit-identical to before treeKind existed
    const pine = treeKind === 'pine'
      || (treeKind === 'mixed' && hash1(tries * 5 + 6, seed * 17) < 0.5);
    const t = pine
      ? makePine({ seed: seed * 100 + placed, height: 3.2 + hash1(tries * 5 + 4, seed) * 1.8 })
      : makeTree({ seed: seed * 100 + placed, height: 2.6 + hash1(tries * 5 + 4, seed) * 1.6 });
    // ON the terrain, not at sea level: the ring reaches r = 20 and the ground
    // out there rolls a good unit either way — trees planted at y 0 floated on
    // the dips and buried on the rises. Slight sink so no trunk hovers on a
    // slope edge. groundFn first, same as the grass: a case with reshaped
    // terrain owns the surface.
    const ty = (groundFn ? groundFn(x, z) : groundHeight(x, z, { seed: groundSeed })) - 0.06;
    t.position.set(x, ty, z);
    t.rotation.y = hash1(tries * 5 + 5, seed) * Math.PI * 2;
    scene.add(t);
    sceneTrees.push(t);
    placed++;
  }

  // The trees deliberately do NOT answer the pointer's breeze. v1 tilted each
  // scattered tree on a damped spring, and it was pulled: the trees were
  // knocked around far too much — a whole-group tilt pivots at the trunk's
  // base, and no gentle amplitude makes that read as a canopy. The grass is the
  // instrument now; if trees ever join back in it has to be canopy-only
  // deformation, not a base pivot (treeSpringStep in breeze.js is kept,
  // uncalled, for that day).

  scene.add(makeRocks({ count: rocks, seed: seed * 51, groundSeed, keepout }));
  scene.add(makeBushes({ count: bushes, seed: seed * 61, groundSeed, keepout }));

  // the meadow: one instanced field, wind animated in the vertex shader. The
  // caller must drive world.update(dt, simTime) or the wind stands still.
  // `grass` is a blade budget; a tuft card shows several blades. The divisor
  // was 3 at first, and about twice the coverage reads better; at two triangles
  // each even this is a fraction of the blade field's geometry.
  //
  // THE REACH, and why the budget moves with it. Both fields place at even area
  // density, so a fixed count spread over a bigger disc is a thinner meadow —
  // the "further" slider would have read as "sparser", which is the opposite of
  // the ask. Scaling by the area ratio holds the core density where it was
  // tuned and spends the extra purely on the ground the field newly covers.
  const { radius: reach, taper } = grassReach();
  const radius = grassRadius === null ? reach : grassRadius;
  const rimTaper = grassTaper === null ? taper : grassTaper;
  const budget = grass * grassArea(radius, rimTaper) / GRASS_BASE_AREA;
  // A card carries a whole tuft, so it takes FEWER of them to cover the same
  // ground than it took blades — hence the divisor. The budget above is still
  // expressed in blade-equivalents, so a case's grass count means what it
  // always meant.
  const field = makeTuftField({
    count: Math.round(budget / 1.5), radius, taper: rimTaper, seed: seed * 81, groundSeed,
    keepout: grassKeepout || keepout, groundFn,
  });

  // The case's weather, applied here and left on the field for the workbench to
  // find. Applied as well as recorded: the field is right from its first frame,
  // rather than only from whenever debug.apply() next runs.
  const gu = field.mesh.userData;
  gu.caseWind = grassWind;
  gu.caseGustScale = grassGustScale;
  gu.caseGustSpeed = grassGustSpeed;
  if (grassWind !== null) gu.uniforms.uWind.value = grassWind;
  if (grassGustScale !== null) gu.uniforms.uGustScale.value = grassGustScale;
  if (grassGustSpeed !== null) gu.uniforms.uGustSpeed.value = grassGustSpeed;
  scene.add(field.mesh);

  // THE DARK UNDER THE GRASS. Not a cast shadow — the meadow is billboards and
  // cannot throw a sensible one (see grassshade.js) — but the ground genuinely
  // is darker where the grass is thick, and that is the part that reads. Baked
  // once here from the field's own placements and multiplied into the ground's
  // colour through `map`, so it costs nothing per frame and cannot swim as the
  // camera moves. Nothing rebuilds this material on the way to the screen, so
  // the map reaches the shipped look exactly as set here.
  if (grassShade && field.spots.length) {
    ground.material.map = makeGrassShade({
      // the ground's OWN width, off the geometry rather than a constant here
      // that could drift from makeGround's default
      spots: field.spots, radius, groundSize: ground.geometry.parameters.width,
      strength: grassShade === true ? undefined : grassShade,
    });
    ground.material.needsUpdate = true;
  }

  return {
    trees: sceneTrees,
    mountainFootprints: footprints,
    grass: field,
    ground,
    update(dt, simTime) { field.update(dt, simTime); },
  };
}
