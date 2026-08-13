import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// No tree stands inside a mountain — scatter trees AND forest instances.
// The real offenders were the forests: a stand's disc (spread up to 16)
// overlaps the near mountain band's footprints wholesale, and for months
// the trees simply didn't know, so plenty of them stood inside the rock.
// makeForest skips those instances and composeWorld's scatter
// rejects those candidates now; this net keeps it that way for every
// scene — the 49 cases and both matter pages.
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
    // presence of the instances PROPERTY proves the avoid-aware path built
    // this forest; an EMPTY list is legal (k44's stands sat entirely inside
    // mountain rock — invisible before, empty now, and worth flagging)
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
