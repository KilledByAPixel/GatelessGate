import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { mergeSimple } from '../src/kit/scatter.js';
import { makeTree } from '../src/kit/tree.js';
import { pineGeometry, makePine } from '../src/kit/pine.js';
import {
  FOLIAGE, FOLIAGE_PARS, FOLIAGE_BODY, FOLIAGE_WIND_SHARE,
  applyFoliageWind, stepFoliageWind, setFoliageWeather,
} from '../src/kit/foliage.js';

// The wind in the trees is baked, not animated: the mesh is merged and there
// are no branch objects left to rotate, so every moving part's identity lives
// in vertex attributes laid down at build time. These hold the bake honest —
// the shader itself needs a GL context and is judged by eye.

const attr = (geo, name) => geo.getAttribute(name);
const vals = (geo, name) => Array.from(attr(geo, name).array);

// ---- mergeSimple's extras ---------------------------------------------------

test('mergeSimple spreads a per-part scalar across exactly that part\'s vertices', () => {
  const a = new THREE.BoxGeometry(1, 1, 1);        // 36 verts non-indexed
  const b = new THREE.ConeGeometry(1, 1, 3);
  const an = a.toNonIndexed().attributes.position.count;
  const bn = b.toNonIndexed().attributes.position.count;

  const merged = mergeSimple([a, b], { aSway: [0.25, 0.75] });
  const sway = vals(merged, 'aSway');
  assert.equal(sway.length, an + bn, 'one value per vertex, both parts');
  assert.ok(sway.slice(0, an).every((v) => v === 0.25), 'the first part got its own value');
  assert.ok(sway.slice(an).every((v) => v === 0.75), 'and the second got its own');
});

test('mergeSimple without extras is byte-for-byte what it always was', () => {
  const geos = () => [new THREE.BoxGeometry(1, 1, 1), new THREE.ConeGeometry(1, 1, 5)];
  const plain = mergeSimple(geos());
  assert.equal(plain.getAttribute('aSway'), undefined, 'no attribute nobody asked for');
  assert.deepEqual(Object.keys(plain.attributes).sort(), ['normal', 'position']);
  // and the geometry itself is untouched by the feature existing
  const withExtras = mergeSimple(geos(), { aSway: [1, 1] });
  assert.deepEqual(
    Array.from(plain.attributes.position.array),
    Array.from(withExtras.attributes.position.array),
    'extras must not disturb a single vertex');
});

test('a miscounted extras list is a hard error, not a silently short buffer', () => {
  const geos = [new THREE.BoxGeometry(1, 1, 1), new THREE.BoxGeometry(1, 1, 1)];
  assert.throws(() => mergeSimple(geos, { aSway: [0.5] }), /aSway has 1 values for 2/);
});

// ---- the tree ---------------------------------------------------------------

test('a tree bakes the wind attributes: wood is not foliage, and the tips move most', () => {
  const tree = makeTree({ height: 3.2, seed: 4 });
  const trunk = tree.getObjectByName('trunk');
  const canopy = tree.getObjectByName('canopy');

  for (const m of [trunk, canopy]) {
    for (const name of ['aSway', 'aPhase', 'aLeaf', 'aColumn']) {
      assert.ok(attr(m.geometry, name), `${m.name} carries ${name}`);
      assert.equal(attr(m.geometry, name).count, m.geometry.attributes.position.count,
        `${m.name}.${name} is one value per vertex`);
    }
    assert.ok(vals(m.geometry, 'aSway').every((v) => v >= 0 && v <= 1),
      `${m.name} sway stays normalised`);
  }

  // aLeaf is what gates the flutter: the canopy shivers, the wood must not
  assert.ok(vals(canopy.geometry, 'aLeaf').every((v) => v === 1), 'the canopy IS foliage');
  assert.ok(vals(trunk.geometry, 'aLeaf').every((v) => v === 0), 'the wood is not');

  // the outermost leaf is the far end of the longest path — it must reach 1,
  // or the whole weighting is scaled against the wrong maximum
  assert.ok(Math.max(...vals(canopy.geometry, 'aSway')) > 0.999, 'the tips reach full sway');

  // and the foot of the trunk does not move at all: this is the entire
  // difference between "wind in the tree" and the bowing tree it replaced
  assert.ok(Math.min(...vals(trunk.geometry, 'aSway')) === 0, 'the trunk foot is pinned');
  const meanTrunk = vals(trunk.geometry, 'aSway').reduce((a, b) => a + b, 0) / attr(trunk.geometry, 'aSway').count;
  const meanLeaf = vals(canopy.geometry, 'aSway').reduce((a, b) => a + b, 0) / attr(canopy.geometry, 'aSway').count;
  // 1.15, not something greedier: most WOOD vertices belong to the many small
  // outer limbs rather than to the bole, so the wood's own mean already sits
  // well up the tree. The gap that matters is the one at the foot, pinned above.
  assert.ok(meanLeaf > meanTrunk * 1.15,
    `leaves sit further out than wood: ${meanTrunk.toFixed(3)} vs ${meanLeaf.toFixed(3)}`);
});

test('leaf clusters do not share one phase — a cluster shivers, it does not slide', () => {
  const canopy = makeTree({ height: 3.2, seed: 4 }).getObjectByName('canopy');
  const distinct = new Set(vals(canopy.geometry, 'aPhase'));
  assert.ok(distinct.size > 6, `blobs need their own offsets, got ${distinct.size}`);
});

// THE REGRESSION THIS FILE EXISTS FOR. The phase jitter was first drawn from
// tree.js's main `rnd` stream, which shifted every fork count and spread angle
// after it and quietly rebuilt every tree in the book. Only k38's oak-width
// test noticed. Wind is decoration; it must not be able to move a branch.
test('adding wind moved no geometry: a seed still grows the exact same tree', () => {
  const a = makeTree({ height: 3.2, seed: 11 });
  const b = makeTree({ height: 3.2, seed: 11 });
  for (const name of ['trunk', 'canopy']) {
    assert.deepEqual(
      Array.from(a.getObjectByName(name).geometry.attributes.position.array),
      Array.from(b.getObjectByName(name).geometry.attributes.position.array),
      `${name} is deterministic`);
  }
  // The pin with teeth. Two identical trees agreeing proves only that hash1 is
  // a function; what actually caught the stream bug was a number measured
  // against the tree's SHAPE. These are seed 11's, snapshotted after the phase
  // draws were moved onto their own counter and confirmed against k38's oak
  // comparison. Retuning the tree on purpose means updating them on purpose —
  // a wind tweak must never be able to.
  const trunk = a.getObjectByName('trunk');
  const canopy = a.getObjectByName('canopy');
  assert.equal(trunk.geometry.attributes.position.count, 4752, 'trunk vertex count is frozen');
  assert.equal(canopy.geometry.attributes.position.count, 2916, 'canopy vertex count is frozen');
  const box = new THREE.Box3().setFromObject(a);
  assert.ok(Math.abs(box.max.y - 3.2459) < 1e-3, `crown height frozen, got ${box.max.y}`);
});

// ---- the pine ---------------------------------------------------------------

test('a pine is one bending mast: the tiers ride the bole rather than sliding off it', () => {
  const H = 4;
  const geo = pineGeometry({ height: H, tiers: 5, seed: 3 });
  const sway = vals(geo, 'aSway');
  const phase = vals(geo, 'aPhase');
  const leaf = vals(geo, 'aLeaf');
  const column = vals(geo, 'aColumn');

  // THE FIX THIS TEST GUARDS. Displacing each tier by its own amount while the
  // bole stood still slid the cones off the trunk — Frank: "it feels kinda
  // lopsided... it's moving way too much off the side". Every part of a pine
  // now shares one cantilever, and the tiers may only differ from it by a
  // sliver, so they cannot leave the trunk's curve again.
  assert.ok(column.every((v) => Math.abs(v - 1 / H) < 1e-9),
    'every part of the mast carries the same 1/height normaliser');
  const lo = Math.min(...sway), hi = Math.max(...sway);
  assert.ok(hi / lo < 1.25,
    `bole and crown must bend as one: weights span ${lo.toFixed(3)}..${hi.toFixed(3)}`);
  assert.ok(lo > 0, 'the bole bends too — it is the mast, not a fence post');

  // ...and the base is still pinned, which is now the HEIGHT term's job (h*h in
  // kit/foliage.js) rather than a zeroed weight. A part cannot express that, so
  // there is nothing to assert here but the normaliser above; what would break
  // it is aColumn going to 0, which the first assertion catches.

  // The tiers are foliage but barely flutter: a full leaf-cluster shiver on a
  // cone this size was the other half of the sideways wobble.
  const tierLeaf = leaf.filter((v) => v > 0);
  assert.ok(tierLeaf.length > 0 && tierLeaf.every((v) => v < 0.4),
    'a tier gets a whisper of flutter, not a cluster\'s worth');
  assert.ok(leaf.some((v) => v === 0), 'the trunk gets none at all');

  // "the wind kinda goes through": one phase per tier, rising, so the bend
  // arrives at the skirt first and reaches the crown late — that lag IS the
  // hierarchy Frank asked for.
  const tiers = [];
  for (let i = 0; i < sway.length; i++) {
    if (leaf[i] === 0) continue;
    if (!tiers.length || tiers[tiers.length - 1].phase !== phase[i]) {
      tiers.push({ sway: sway[i], phase: phase[i] });
    }
  }
  assert.equal(tiers.length, 5, `one entry per tier, got ${tiers.length}`);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].phase > tiers[i - 1].phase,
      `tier ${i} must lag tier ${i - 1}: ${tiers[i - 1].phase} -> ${tiers[i].phase}`);
    assert.ok(tiers[i].phase - tiers[i - 1].phase < 0.6,
      'and lag it only slightly, or the tiers read as separate events again');
  }
});

test('a broadleaf is not a mast — it keeps the branching model', () => {
  const tree = makeTree({ height: 3.2, seed: 4 });
  for (const name of ['trunk', 'canopy']) {
    const geo = tree.getObjectByName(name).geometry;
    assert.ok(attr(geo, 'aColumn'), `${name} still declares aColumn`);
    assert.ok(vals(geo, 'aColumn').every((v) => v === 0),
      `${name} takes the path-length profile, not the cantilever`);
  }
});

// ---- the material plumbing --------------------------------------------------

test('applyFoliageWind hangs both hooks a material needs to animate', () => {
  // customProgramCacheKey is not optional (see foliage.js's own comment on
  // applyFoliageWind): without it, three.js keys compiled programs by
  // material type plus a handful of flags, so a wind-injected Lambert and a
  // plain Lambert hash to the same program and whichever built second wins —
  // trees standing dead still, or wearing the grass's bend, depending on
  // which case loaded first. Both hooks are this function's whole job, so
  // this is a test of applyFoliageWind itself, not of any rebuild downstream.
  const m = applyFoliageWind(new THREE.MeshLambertMaterial({ color: 0x333333 }));
  // typeof-only checks pass on ANY material — THREE.Material.prototype already
  // defines both as a no-op and a `""` key, so a bare, untouched
  // MeshLambertMaterial reports 'function' for each too. Object.hasOwn pins
  // that applyFoliageWind actually hung its OWN hooks on this instance.
  assert.ok(Object.hasOwn(m, 'onBeforeCompile'), 'onBeforeCompile must be an own property, not inherited');
  assert.ok(Object.hasOwn(m, 'customProgramCacheKey'), 'customProgramCacheKey must be an own property, not inherited');
  // and the cache key's VALUE, not just its type: a key that fell back to the
  // prototype's `""` would still be 'function' but would no longer distinguish
  // a wind-injected material from a plain one.
  const key = m.customProgramCacheKey();
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0, 'the cache key must be a non-empty string, distinct from the prototype default ""');
});

test('a pine and a tree both carry the foliageWind flag bakeStatic reads', () => {
  // bakeStatic's canMerge refuses to merge a foliage-wind mesh, because
  // merging would drop its per-vertex wind attributes; this is the flag it
  // checks
  assert.equal(makePine({}).userData.foliageWind, true);
  const tree = makeTree({});
  assert.equal(tree.getObjectByName('trunk').userData.foliageWind, true);
  assert.equal(tree.getObjectByName('canopy').userData.foliageWind, true);
});

test('the shader chunk declares what it reads, and the body feeds it world space', () => {
  for (const name of ['aSway', 'aPhase', 'aLeaf']) {
    assert.ok(FOLIAGE_PARS.includes(`attribute float ${name};`), `${name} is declared`);
  }
  for (const u of Object.keys(FOLIAGE)) {
    assert.ok(FOLIAGE_PARS.includes(u), `${u} is declared in the chunk that uses it`);
  }
  // the gust must be sampled at the UNDISPLACED position, or the offset drives
  // its own input and the tree drifts
  assert.ok(FOLIAGE_BODY.includes('vec4(position, 1.0)'),
    'sample world space from `position`, never from `transformed`');
});

test('the workbench\'s one wind reaches the trees, scaled down on the way in', () => {
  const before = FOLIAGE.uFoliageWind.value;
  try {
    setFoliageWeather({ wind: 1.5, gustScale: 0.01, gustSpeed: 12 });
    assert.ok(Math.abs(FOLIAGE.uFoliageWind.value - 1.5 * FOLIAGE_WIND_SHARE) < 1e-9,
      'a tree takes a fraction of the grass\'s wind — a blade lies flat, a tree must not');
    assert.equal(FOLIAGE.uFoliageGustScale.value, 0.01, 'same gust field as the meadow');
    assert.equal(FOLIAGE.uFoliageGustSpeed.value, 12);

    setFoliageWeather({ wind: -3 });
    assert.equal(FOLIAGE.uFoliageWind.value, 0, 'a negative slider stills it rather than inverting it');

    stepFoliageWind(7.5);
    assert.equal(FOLIAGE.uFoliageTime.value, 7.5);
    stepFoliageWind(NaN);
    assert.equal(FOLIAGE.uFoliageTime.value, 0, 'a non-finite clock never reaches the shader');
  } finally {
    FOLIAGE.uFoliageWind.value = before;      // shared module state — leave it as found
    stepFoliageWind(0);
  }
});
