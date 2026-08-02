import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k12, { clipToLip } from '../src/koans/k12.js';
import { ACCENT } from '../src/palette.js';
import { groundHeight } from '../src/kit/ground.js';

// Zuigan on his ledge, calling himself. Two things this file guards, both of
// them Frank's round-12 notes:
//
//   * THE GIANT CLEARING. The cliff's void keepout is meant to stop grass
//     growing out over the drop, but its nearest mist circle is ~8 across and
//     centred only 2.7 back from the edge, so at full radius it reached onto
//     the standing ground and stripped the meadow off the whole ledge — the
//     bald ring around him.
//   * THE BUTTERFLIES, moved here out of case 19. They must not carry a second
//     red (the staff is the seal), and they must not land past the lip: the
//     ground formula they perch on knows nothing about the gorge drawn over it.

function fakeCtx() {
  const taps = [];
  return {
    audio: null,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: () => {},
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps,
  };
}

const staged = () => {
  const root = k12.build(fakeCtx());
  root.update(1 / 60, 0);
  root.scene.updateMatrixWorld(true);
  return root;
};

test('module shape matches the koan contract', () => {
  assert.equal(k12.id, 12);
  assert.equal(k12.slug, 'zuigan-calls-his-own-master');
  assert.equal(k12.accent, ACCENT);
  assert.equal(k12.mood, 'yo');
  assert.equal(typeof k12.build, 'function');
});

test('the grass reaches him: no bald ring around the one figure in the scene', () => {
  const root = staged();
  const grass = root.scene.getObjectByName('grassfield');
  assert.ok(grass, 'there is a meadow at all');

  // gather every blade's plan position, whatever mesh form the field takes
  const pts = [];
  grass.traverse((o) => {
    if (o.isInstancedMesh) {
      const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4);
        o.localToWorld(p);
        pts.push({ x: p.x, z: p.z });
      }
    }
  });
  assert.ok(pts.length > 100, `the field has to have blades in it, got ${pts.length}`);

  const zuigan = root.scene.getObjectByName('monk');
  const near = pts.filter((p) => Math.hypot(p.x - zuigan.position.x, p.z - zuigan.position.z) < 3);
  assert.ok(near.length > 100,
    `only ${near.length} blades within three units of him — the clearing is back`);

  // and the ledge is the DENSE part: past the lip the mask still thins it out,
  // so the meadow reads as stopping at the edge rather than carrying on over it
  const ledge = pts.filter((p) => p.z >= -1.3 && p.z < 2).length;
  const beyond = pts.filter((p) => p.z >= -8 && p.z < -4).length;
  assert.ok(ledge > beyond, `the drop should be barer than the ledge: ${ledge} vs ${beyond}`);
});

// The mask itself, away from a whole staged scene. Pulling a circle back must
// move ONLY its near edge — anything that shrinks the far edge as well would
// quietly unmask a strip of the gorge for grass to grow out over.
test('clipToLip pins the near edge to the line and leaves the far edge alone', () => {
  const before = [
    { x: 0, z: -2.7, r: 4.0 },     // reaches well past the lip
    { x: 6, z: -5.5, r: 4.8 },     // reaches a little past it
    { x: -6, z: -12.3, r: 5.4 },   // nowhere near it
    { x: 1, z: -1.6, r: 0.5 },     // so small that clipping would erase it
  ];
  const LIP = -1.3;
  const after = clipToLip(before, LIP);

  for (const c of after) {
    assert.ok(c.z + c.r <= LIP + 1e-9, `circle still reaches the ledge: ${c.z + c.r}`);
    assert.ok(c.r > 0, 'no inside-out circles');
    const orig = before.find((o) => o.x === c.x);
    assert.ok(Math.abs((c.z - c.r) - (orig.z - orig.r)) < 1e-9,
      `the far edge moved: ${c.z - c.r} vs ${orig.z - orig.r}`);
  }
  // the one that could not survive the clip is dropped rather than kept at a
  // negative radius
  assert.ok(!after.some((c) => c.x === 1), 'a circle clipped to nothing is dropped');
  // and one that never reached the lip is passed through untouched
  assert.deepEqual(after.find((c) => c.x === -6), before[2]);
});

test('the butterflies are here, they are not a second red, and they never perch past the lip', () => {
  const root = staged();
  const group = root.scene.getObjectByName('butterflies');
  assert.ok(group, 'the butterflies moved here from case 19');

  const each = [];
  group.traverse((o) => { if (o.name === 'butterfly') each.push(o); });
  assert.ok(each.length >= 4 && each.length <= 8, `a handful, got ${each.length}`);
  for (const b of each) {
    b.traverse((o) => {
      if (!o.isMesh) return;
      assert.notEqual('#' + o.material.color.getHexString(), ACCENT.toLowerCase(),
        'the staff is this case\'s one red thing');
      assert.equal(o.material.emissive.getHexString(), '000000', 'and only a seal glows');
      assert.equal(o.userData.noOutline, true, 'a hull on a paper-thin wing is a blot');
    });
  }

  // Drive a long stretch of the flight: they fly, they land, they fly again, and
  // at no point in the round may one of them be out over the drop — where a
  // "landing" would put it on an invisible floor five units above the gorge.
  let lowest = Infinity;
  for (let i = 0; i < 60 * 40; i++) {
    root.update(1 / 60, i / 60);
    if (i % 20) continue;
    root.scene.updateMatrixWorld(true);
    for (const b of each) {
      const p = b.getWorldPosition(new THREE.Vector3());
      assert.ok(p.z > -1.3, `a butterfly strayed over the drop at z=${p.z.toFixed(2)}`);
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
      // whenever one is down, it is down on the ground the meadow actually has
      if (p.y < 0.5) {
        const gh = groundHeight(p.x, p.z, { seed: 21 });
        assert.ok(p.y > gh - 0.05, `perched below the turf: ${p.y.toFixed(2)} vs ${gh.toFixed(2)}`);
        lowest = Math.min(lowest, p.y);
      }
    }
  }
  assert.ok(lowest < Infinity, 'they never came down at all — the perching is the good part');
});

test('calling startles them, and the fragment stays finite', () => {
  const ctx = fakeCtx();
  const root = k12.build(ctx);
  const hit = root.scene.getObjectByName('zuigan-hit');
  root.setCamera(new THREE.PerspectiveCamera());
  for (let i = 0; i < 240; i++) root.update(1 / 60, i / 60);
  const calm = root.fragment().flutter;

  ctx.input.raycastFirst = (cam, objs) => (objs.includes(hit) ? { object: hit, point: new THREE.Vector3() } : null);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().calls, 1, 'the call landed');
  assert.ok(root.fragment().flutter > calm + 0.5, 'and it put them up');

  for (let i = 0; i < 600; i++) root.update(1 / 60, 4 + i / 60);
  const frag = root.fragment();
  assert.ok(frag.flutter < 0.05, `they settle back to playing, got ${frag.flutter}`);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
});
