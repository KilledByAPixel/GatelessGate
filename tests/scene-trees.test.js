import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// No tree stands inside a mountain — scatter trees AND forest instances. The
// real offenders were the forests: a stand's disc (spread up to 16) overlaps
// the near mountain band's footprints wholesale, and for months the trees
// simply didn't know, so plenty of them stood inside the rock. makeForest skips
// those instances and composeWorld's scatter rejects those candidates now; this
// net keeps it that way for every scene — the 49 cases and both matter pages.
//
// The margin: a mountain's rock rises from its base circle (footprint r),
// so anything inside ~0.85r pierces visible rock; right at the skirt a
// tree reads as brush at fog distance ("it can kind of look like
// bushes"), which is fine. Code rejects at 0.85r; the net asserts 0.8r,
// the slack keeping one refactor from tripping the other.

function treesVsMountains(scene) {
  const spots = [], feet = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (o.name === 'tree') spots.push({ x: o.position.x, z: o.position.z, kind: 'tree' });
    if (o.name === 'forest' && o.userData.instances) {
      for (const p of o.userData.instances) {
        spots.push({ x: o.position.x + p.x, z: o.position.z + p.z, kind: 'forest' });
      }
    }
    if (o.name === 'mountain' && o.userData.footprint) feet.push(o.userData.footprint);
  });
  return { spots, feet };
}

test('no scatter tree stands inside a mountain, anywhere in the book', async () => {
  const scenes = [];
  for (const c of CASES) {
    if (!isStaged(c.slug)) continue;
    const mod = await loadKoan(c.slug);
    scenes.push({ slug: c.slug, built: mod.build(fakeCtx()) });
  }
  for (const slug of ['preface', 'afterword']) {
    const mod = await loadKoan(slug);   // loadKoan resolves matter slugs too
    scenes.push({ slug, built: mod.build(fakeCtx()) });
  }

  for (const { slug, built } of scenes) {
    const { spots, feet } = treesVsMountains(built.scene);
    assert.ok(feet.length > 0, `${slug}: mountains carry no footprints`);
    // presence of the instances PROPERTY proves the avoid-aware path built this
    // forest; an EMPTY list is legal (k44's stands sat entirely inside mountain
    // rock — invisible before, empty now, and worth flagging)
    let stamped = 0;
    built.scene.traverse((o) => { if (o.name === 'forest') { assert.ok(Array.isArray(o.userData.instances), `${slug}: forest without instances stamp`); stamped++; } });
    assert.ok(stamped > 0, `${slug}: no forest meshes at all`);
    const bad = [];
    for (const t of spots) {
      for (const f of feet) {
        const d = Math.hypot(t.x - f.x, t.z - f.z);
        if (d <= f.r * 0.8) {
          bad.push(`${t.kind} at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) in mountain (${f.x.toFixed(1)}, ${f.z.toFixed(1)}) r=${f.r.toFixed(1)}`);
        }
      }
    }
    assert.equal(bad.length, 0, `${slug}: ${bad.length} embedded — ${bad.slice(0, 3).join('; ')}`);
    built.dispose && built.dispose();
  }
});

// ---- how the wood is joined ---------------------------------------------------
//
// A limb used to be its own tapered prism set down on its parent's tip, with a
// knot ball over the seam: the child's base ring, tilted against a parent no
// wider than itself, put its corners through the parent's faces at every fork,
// and the ball stood proud of both. Limbs are skinned as continuous tubes now
// (kit/limbs.js) — one child carries its parent on through the fork, the others
// are rooted INSIDE it — and each builder leaves the record of every join on
// `userData.limbs` so this net can hold the whole book to it.

const { makeTree } = await import('../src/kit/tree.js');
const { makeOak } = await import('../src/kit/oak.js');
const { makePine } = await import('../src/kit/pine.js');
const { makeForest } = await import('../src/kit/forest.js');
const { composeWorld, plantTree } = await import('../src/kit/scenery.js');
const THREE = await import('../lib/three.module.js');

const EPS = 1e-6;

function assertJoinsClean(tree, label) {
  const limbs = tree.userData.limbs;
  assert.ok(Array.isArray(limbs) && limbs.length > 0, `${label}: no userData.limbs`);
  const boles = limbs.filter((l) => l.gen === 0);
  assert.equal(boles.length, 1, `${label}: exactly one bole`);
  assert.ok(boles[0].r0 > 0, `${label}: the bole has a radius`);
  for (const l of limbs) {
    if (l.gen === 0) continue;
    for (const k of ['r0', 'parentR', 'offAxis']) {
      assert.ok(Number.isFinite(l[k]), `${label}: limb record without ${k}`);
    }
    assert.ok(l.offAxis + l.r0 <= l.parentR + EPS,
      `${label}: gen ${l.gen} base stands proud — offAxis ${l.offAxis.toFixed(4)} + r0 ${l.r0.toFixed(4)} > parent ${l.parentR.toFixed(4)}`);
    // The stricter half, and the one the eye actually sees: a tube is a PRISM,
    // so what a child ring has to stay inside is the parent's flat faces, not
    // the circle its corners lie on. `proud` is how far the worst corner of the
    // child's base ring stands outside those faces.
    assert.ok(l.proud <= EPS,
      `${label}: gen ${l.gen} base ring corner is ${l.proud.toFixed(4)} outside its parent's faces`);
  }
  return limbs;
}

test('no limb base stands proud of its parent', () => {
  for (const seed of [2, 5, 11, 20, 38, 907]) {
    const t = assertJoinsClean(makeTree({ seed }), `tree seed ${seed}`);
    assert.ok(t.some((l) => l.gen >= 2), `tree seed ${seed}: sub-branches are recorded too`);
    const o = assertJoinsClean(makeOak({ seed }), `oak seed ${seed}`);
    assert.ok(o.filter((l) => l.gen === 1).length >= 3, `oak seed ${seed}: the primaries are recorded`);
    assertJoinsClean(makeOak({ seed, reach: 1 }), `oak seed ${seed} at full reach`);
  }
});

// The widest the wood gets at height y: every triangle edge crossing the plane,
// measured from the bole's axis. Read off the built mesh rather than off a
// record, so a collar set down around the trunk shows up as what it is.
function radiusAt(geo, y) {
  const p = geo.attributes.position;
  let r = 0;
  for (let i = 0; i < p.count; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = i + e, b = i + (e + 1) % 3;
      const ya = p.getY(a), yb = p.getY(b);
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const t = (y - ya) / (yb - ya);
      r = Math.max(r, Math.hypot(
        p.getX(a) + (p.getX(b) - p.getX(a)) * t,
        p.getZ(a) + (p.getZ(b) - p.getZ(a)) * t));
    }
  }
  return r;
}

test('the root flare has no step', () => {
  const cases = [
    ['tree', makeTree({ height: 3.2, seed: 2 }), 3.2],
    ['tree', makeTree({ height: 4.2, seed: 9 }), 4.2],
    ['oak', makeOak({ height: 5.8, seed: 38 }), 5.8],
    ['oak', makeOak({ height: 5.0, seed: 13 }), 5.0],
    ['pine', makePine({ height: 4, seed: 3 }), 4],
  ];
  for (const [kind, tree, H] of cases) {
    const geo = (tree.getObjectByName('trunk') || tree).geometry;
    // from just above the ground to well past where any flare has run out
    const N = 80, top = 0.16 * H, dy = top / N;
    const prof = [];
    for (let i = 0; i <= N; i++) prof.push(radiusAt(geo, 1e-4 + i * dy));
    assert.ok(prof[0] > prof[N] * 1.2, `${kind}: the foot is wider than the bole (or there is no flare to test)`);
    let prevSlope = null;
    for (let i = 1; i <= N; i++) {
      const drop = prof[i - 1] - prof[i];
      assert.ok(drop >= -1e-5, `${kind}: bole widens with height at y=${(i * dy).toFixed(3)}`);
      // a STEP is radius lost in no height at all: a collar's top edge
      assert.ok(drop <= 1.4 * dy,
        `${kind}: a step at y=${(i * dy).toFixed(3)} — ${drop.toFixed(4)} of radius lost in ${dy.toFixed(4)}`);
      // and a flare that turns into the bole at one hard corner is a pedestal
      // the trunk stands ON; the widening has to arrive over several rings
      const slope = Math.atan2(drop, dy) * 180 / Math.PI;
      if (prevSlope !== null) {
        assert.ok(Math.abs(slope - prevSlope) < 22,
          `${kind}: the flare corners ${Math.abs(slope - prevSlope).toFixed(1)} degrees at y=${(i * dy).toFixed(3)}`);
      }
      prevSlope = slope;
    }
  }
});

test('scattered and planted trees share the limb builder', () => {
  // plantTree, every species it knows
  for (const kind of ['tree', 'oak', 'pine']) {
    const t = plantTree(null, { x: 6.2, z: -3.4, kind });
    assertJoinsClean(t, `plantTree ${kind}`);
  }
  // composeWorld's scatter, every treeKind
  for (const treeKind of ['tree', 'pine', 'mixed']) {
    const scene = new THREE.Scene();
    const world = composeWorld(scene, { seed: 7, treeKind, trees: 8, grass: 0, rocks: 0, bushes: 0 });
    assert.ok(world.trees.length >= 6, `${treeKind}: the scatter placed its trees`);
    const names = new Set();
    for (const t of world.trees) {
      names.add(t.name);
      assertJoinsClean(t, `scattered ${t.name} (${treeKind})`);
    }
    if (treeKind === 'mixed') assert.equal(names.size, 2, 'a mixed scatter holds both species');
    // The fog-line stand is ONE merged mesh with no per-tree object left to
    // carry a record, so it carries its templates' — the shapes every tree in
    // it is a stamped copy of.
    let stands = 0;
    scene.traverse((o) => {
      if (o.name !== 'forest') return;
      stands++;
      const limbs = o.userData.limbs;
      assert.ok(Array.isArray(limbs) && limbs.length > 0, `${treeKind}: forest carries no limb records`);
      for (const l of limbs) {
        if (l.gen === 0) continue;
        assert.ok(l.offAxis + l.r0 <= l.parentR + EPS && l.proud <= EPS,
          `${treeKind}: a forest template limb stands proud`);
      }
    });
    assert.ok(stands > 0, `${treeKind}: no forest built`);
  }
  // a broadleaf stand really does hold limbs, so the loop above is not vacuous
  const stand = makeForest({ count: 12, seed: 41, kind: 'tree' });
  assert.ok(stand.userData.limbs.some((l) => l.gen > 0), 'broadleaf templates record their forks');
});
