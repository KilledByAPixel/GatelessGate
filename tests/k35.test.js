import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k35 from '../src/koans/k35.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';
import { rigCamera } from './helpers/rig-camera.js';

// Case 35, the two souls. Frank restaged it: "instead of these 2 people
// walking, lets have 1 red person standing on the road with 2 children at
// either side. the other red person will be medtating under a tree nearby.
// also they will not be transparent anymore."
//
// So both of Seijo's lives are staged whole and solid — the family on the
// road, the woman under the tree — and the thing that used to carry the case's
// refusal (two half-there walkers pacing apart and back) is gone. These tests
// pin what replaced it, and the one property that survived the rewrite: there
// is still no way to address one of her on her own.

const fakeCtx = () => sharedCtx({ accent: k35.accent });

const staged = () => {
  const built = k35.build(fakeCtx());
  built.update(1 / 60, 0);
  built.scene.updateMatrixWorld(true);
  return built;
};

const collect = (scene, name) => {
  const out = [];
  scene.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};

// Nearest approach of a point to the road's centreline, off the ribbon the
// scene actually built rather than a second copy of its control points:
// makePath hangs sample() on the mesh it returns, so the road is queryable
// from the scene like any other prop.
const toRoad = (road, p) => {
  let best = Infinity;
  for (let i = 0; i <= 240; i++) {
    const s = road.sample(i / 240);
    best = Math.min(best, Math.hypot(s.x - p.x, s.z - p.z));
  }
  return best;
};

test('the two of her are solid — no ghosting anywhere on either', () => {
  // The old staging made both figures translucent and depthWrite:false, which
  // was the case's answer to "which is the true one": neither, quite. Frank
  // took it out ("they will not be transparent anymore"), so a stray clone of
  // that block coming back is a regression, not a tweak.
  const built = staged();
  const souls = collect(built.scene, 'soul');
  assert.equal(souls.length, 2, 'two of her');
  for (const s of souls) {
    s.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || !o.material) return;
      assert.equal(o.material.transparent, false, 'she is a woman, not an apparition');
      assert.equal(o.material.opacity, 1);
      assert.notEqual(o.material.depthWrite, false);
    });
  }
});

test('both of her carry the same red, and nobody else in the scene does', () => {
  // The seal is the pair. Painting the children in the accent too would spread
  // it over five figures and seal nothing, which is why they are ink.
  const built = staged();
  const reds = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT].map((c) => new THREE.Color(c).getHexString()));
  const isRed = (root) => {
    let found = false;
    root.traverse((o) => {
      if (o.isMesh && !o.userData.isOutline && o.material && o.material.color
        && reds.has(o.material.color.getHexString())) found = true;
    });
    return found;
  };
  for (const s of collect(built.scene, 'soul')) assert.ok(isRed(s), 'each of her is the accent');
  for (const k of collect(built.scene, 'child')) assert.ok(!isRed(k), 'the children are ink');
});

test('one life stands on the road with a child at either hand', () => {
  const built = staged();
  const road = built.scene.getObjectByName('path');
  assert.ok(road && typeof road.sample === 'function', 'the road is in the scene and queryable');

  const kids = collect(built.scene, 'child');
  assert.equal(kids.length, 2, 'two children, no more');

  // whichever of the two she is, she is the one standing in the lane
  const souls = collect(built.scene, 'soul');
  const walker = souls.slice().sort((a, b) => toRoad(road, a.position) - toRoad(road, b.position))[0];
  assert.ok(toRoad(road, walker.position) < 0.25,
    `she stands in the road, ${toRoad(road, walker.position).toFixed(2)} off its centreline`);

  // one child either side of her, close enough to be at her hands
  const offsets = kids.map((k) => {
    const dx = k.position.x - walker.position.x, dz = k.position.z - walker.position.z;
    assert.ok(Math.hypot(dx, dz) < 1.0, 'at her hand, not across the field');
    // signed offset across the road, using her own facing: bodies front local
    // +z, so her right in world is (cos psi, -sin psi)
    return dx * Math.cos(walker.rotation.y) - dz * Math.sin(walker.rotation.y);
  });
  assert.ok(offsets[0] * offsets[1] < 0, `one at either side, got ${offsets.map((o) => o.toFixed(2))}`);

  // and they are children: shorter than she is, and not the same height as
  // each other (two identical figures read as a copy-paste, not as siblings)
  const height = (o) => new THREE.Box3().setFromObject(o).max.y;
  assert.ok(kids.every((k) => height(k) < height(walker) * 0.8), 'small');
  assert.notEqual(height(kids[0]).toFixed(2), height(kids[1]).toFixed(2), 'and not twins');
});

test('the other life sits off the road, in the clear', () => {
  // This used to require her within 1.6 of a trunk — she was staged under a
  // hand-planted canopy. The restaging moved her back down the road to the
  // house end, seven units off that tree and 3.2 from the nearest scattered
  // one, and the composition is better for it (k35.js says why). So the
  // canopy requirement is gone; what is still worth pinning is that she is
  // off the road, clear of every trunk, and seated.
  const built = staged();
  const road = built.scene.getObjectByName('path');
  const souls = collect(built.scene, 'soul');
  const sitter = souls.slice().sort((a, b) => toRoad(road, b.position) - toRoad(road, a.position))[0];
  assert.ok(toRoad(road, sitter.position) > 0.9,
    `she is off the road, ${toRoad(road, sitter.position).toFixed(2)} from it`);

  const near = Math.min(...collect(built.scene, 'tree').map((t) =>
    Math.hypot(t.position.x - sitter.position.x, t.position.z - sitter.position.z)));
  assert.ok(near > 0.6, `beside a trunk, never inside one — nearest trunk ${near.toFixed(2)}`);

  // seated, so noticeably lower than the one on her feet
  const height = (o) => new THREE.Box3().setFromObject(o).max.y;
  const walker = souls.find((s) => s !== sitter);
  assert.ok(height(sitter) < height(walker) * 0.8, 'she is sitting');
});

test('the hand-planted tree is still hand-planted', () => {
  // The scatter is seeded and will move its own trees when a seed changes;
  // this one anchors the composition, so it must not quietly become one of
  // them. Pinned by position rather than by count, which a re-seed can match
  // by accident.
  const built = staged();
  const trees = collect(built.scene, 'tree');
  assert.ok(trees.some((t) => Math.hypot(t.position.x - 4.2, t.position.z - -3.5) < 0.01),
    'the planted tree stands at TREE — if it moved, move this with it on purpose');
});

test('touch either of her and BOTH answer, by the same amount', () => {
  // The one thing that survived the restaging. The old version pulled two
  // walkers together on a tap; this one breathes them both. Either way the
  // case refuses to let a reader address one life and not the other.
  const rung = [];
  const ctx = sharedCtx({
    accent: k35.accent,
    audio: { chimeStrike: (o) => rung.push(o) },
  });
  const built = k35.build(ctx);
  built.setCamera({});
  built.update(1 / 60, 0);
  const souls = collect(built.scene, 'soul');
  const rest = souls.map((s) => [s.rotation.z, s.position.y]);

  for (const target of ['family-hit', 'sitter-hit']) {
    const hit = built.scene.getObjectByName(target);
    assert.ok(hit, `${target} is in the scene`);
    ctx.input.raycastFirst = (cam, objs) => (objs.includes(hit) ? { object: hit, distance: 1 } : null);
    const before = built.fragment().touches;
    ctx._taps.forEach((cb) => cb());
    assert.equal(built.fragment().touches, before + 1, `${target} answers a touch`);
    built.update(1 / 60, 1 / 60);

    // the answer lands on BOTH of them, and identically
    const moved = souls.map((s, i) =>
      Math.abs(s.rotation.z - rest[i][0]) + Math.abs(s.position.y - rest[i][1]));
    assert.ok(moved.every((m) => m > 1e-3), `both of her answer ${target}: ${moved}`);
    assert.ok(Math.abs((souls[0].rotation.z) - (souls[1].rotation.z)) < 1e-9,
      'neither of her leans further than the other');
  }
  assert.equal(rung.length, 2, 'and each touch is a sound');

  // it fades: the answer is a breath, not a state the scene stays in
  for (let i = 0; i < 60 * 4; i++) built.update(1 / 60, i / 60);
  assert.equal(built.fragment().answer, 0, 'the touch fades all the way out');
});

test('both lives are in the picture, even in a narrow reading pane', () => {
  // The whole staging is "these two are the same person", and it fails the
  // moment one of them is off the edge. The stage canvas is the window minus a
  // panel that takes up to 40% of it, so a square-ish pane is the real worst
  // case — not the 1.78 the staging net checks with.
  const built = staged();
  const souls = collect(built.scene, 'soul');
  for (const aspect of [1.78, 1.0]) {
    const cam = rigCamera(k35.camera, { aspect });
    for (const s of souls) {
      const b = new THREE.Box3().setFromObject(s);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const v = new THREE.Vector3(x, y, z).project(cam);
        assert.ok(Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85,
          `at aspect ${aspect} a corner of her projects to ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`);
      }
    }
  }
});

test('the scene runs clean with no camera and no audio', () => {
  const bare = k35.build(sharedCtx());   // audio null, setCamera never called
  for (let i = 0; i < 300; i++) bare.update(1 / 60, i / 60);
  for (const [k, v] of Object.entries(bare.fragment())) {
    assert.ok(Number.isFinite(v), `fragment.${k} = ${v}`);
  }
});
