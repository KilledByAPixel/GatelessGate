import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { tuftPixels, makeTuftField, TUFT_W, TUFT_H, TUFT_VARIANTS } from '../src/kit/tuftfield.js';
import { GRASS_TONE } from '../src/kit/grassfield.js';

// alpha coverage of a horizontal band of one atlas variant, as a fraction
function coverage(data, variant, y0, y1) {
  const vw = TUFT_W / TUFT_VARIANTS;
  let on = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = variant * vw; x < (variant + 1) * vw; x++) {
      if (data[(y * TUFT_W + x) * 4 + 3] > 0) on++;
      n++;
    }
  }
  return on / n;
}

test('the tuft texture is deterministic and correctly sized', () => {
  const a = tuftPixels();
  const b = tuftPixels();
  assert.equal(a.length, TUFT_W * TUFT_H * 4);
  assert.deepEqual(a, b, 'same seed, same pixels — no hidden randomness');
});

test('tufts are rooted at the ground and taper away from it', () => {
  // row 0 is v=0 is the ground: a tuft is DENSE at its root and sparse at its
  // tips, or the card reads as a floating scribble rather than a plant
  const d = tuftPixels();
  for (let v = 0; v < TUFT_VARIANTS; v++) {
    const root = coverage(d, v, 0, Math.floor(TUFT_H / 3));
    const tips = coverage(d, v, Math.floor((2 * TUFT_H) / 3), TUFT_H);
    assert.ok(root > 0.10, `variant ${v} has substance at the root: ${root.toFixed(3)}`);
    assert.ok(root > tips * 2, `variant ${v} tapers upward: root ${root.toFixed(3)} vs tips ${tips.toFixed(3)}`);
    const total = coverage(d, v, 0, TUFT_H);
    assert.ok(total > 0.05 && total < 0.6, `variant ${v} is a tuft, not a wall or a wisp: ${total.toFixed(3)}`);
  }
});

test('the four variants are genuinely different silhouettes', () => {
  const d = tuftPixels();
  const vw = TUFT_W / TUFT_VARIANTS;
  for (let a = 0; a < TUFT_VARIANTS; a++) {
    for (let b = a + 1; b < TUFT_VARIANTS; b++) {
      let differ = 0, n = 0;
      for (let y = 0; y < TUFT_H; y += 2) {
        for (let x = 0; x < vw; x += 2) {
          const pa = d[(y * TUFT_W + a * vw + x) * 4 + 3] > 0;
          const pb = d[(y * TUFT_W + b * vw + x) * 4 + 3] > 0;
          if (pa !== pb) differ++;
          n++;
        }
      }
      assert.ok(differ / n > 0.05, `variants ${a} and ${b} differ: ${(differ / n).toFixed(3)}`);
    }
  }
});

test('a tuft costs two triangles, not ten', () => {
  const f = makeTuftField({ count: 500, radius: 20, seed: 11 });
  assert.equal(f.mesh.geometry.index.count, 6, 'one quad per tuft');
  assert.ok(f.tufts > 400, `placed most of what was asked: ${f.tufts}`);
  assert.equal(f.blades, f.tufts, 'API parity with the blade field');
});

test('the field wears the grassfield name and wiring the debug panel expects', () => {
  // visibility toggle, wind sliders and the material-swap exemption all key off
  // the name; the wind sliders reach in through userData.uniforms
  const f = makeTuftField({ count: 200, seed: 11 });
  assert.equal(f.mesh.name, 'grassfield');
  const u = f.mesh.userData.uniforms;
  for (const k of ['uTime', 'uWind', 'uWindDir', 'uGustScale', 'uGustSpeed', 'uPokePos', 'uPokeDir', 'uPokeAmt', 'uPokeR']) {
    assert.ok(u[k], `exposes ${k}`);
  }
  // the pointer's breeze is OFF until a pointer actually moves: an unpoked
  // scene renders identically to one built before the breeze existed
  assert.equal(u.uPokeAmt.value, 0, 'born still');
  assert.equal(f.mesh.castShadow, false, 'tufts throw no shadow maps');
  assert.ok(f.mesh.material.alphaTest > 0, 'cutout, not blending — no sort order to get wrong');
  f.update(1 / 60, 3.5);
  assert.equal(u.uTime.value, 3.5, 'update drives the wind clock');
});

test('tufts stand on the supplied ground, and on flat ground without one', () => {
  // same additive contract as the blade field: grassPlacements does the
  // sampling for both renderers, but each field feeds its instance matrices
  // itself — this pins that the tuft path forwards groundFn at all
  const fn = (x, z) => 1.5 + 0.04 * z;
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  const lifted = makeTuftField({ count: 300, radius: 12, seed: 11, groundFn: fn });
  assert.ok(lifted.tufts > 100, `tufts to check: ${lifted.tufts}`);
  for (let i = 0; i < lifted.tufts; i++) {
    lifted.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    assert.ok(Math.abs(p.y - (fn(p.x, p.z) - 0.02)) < 1e-5,
      `tuft ${i} rooted in its ground: y ${p.y} at (${p.x}, ${p.z})`);
  }
  // absent, the default is the terrain function — inside its flat radius, y = 0
  const plain = makeTuftField({ count: 300, radius: 8, seed: 11 });
  for (let i = 0; i < plain.tufts; i++) {
    plain.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    // === not strictEqual: decompose hands back -0, which is still ground zero
    assert.ok(p.y === 0, `tuft ${i} sits at ground zero without a ground fn: ${p.y}`);
  }
});

test('tufts respect keepouts the same way blades do', () => {
  const keep = { x: 0, z: 0, r: 6 };
  const f = makeTuftField({ count: 2000, radius: 18, seed: 11, keepout: [keep] });
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (let i = 0; i < f.tufts; i++) {
    f.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    assert.ok(Math.hypot(p.x, p.z) >= keep.r, `tuft ${i} outside the keepout: ${Math.hypot(p.x, p.z).toFixed(2)}`);
    assert.ok(s.x !== s.y || s.x !== 1, 'aspect varies per tuft');
  }
});

// THE TONE IS APPLIED ONCE. It used to be applied twice — the field material
// carried GRASS_TONE and every instance colour carried it again, and three.js
// multiplies the two — so the meadow rendered at the tone SQUARED: wash(0.40)
// came out around wash(0.69), darker than INK_LIT, which is the floor the style
// guide sets for anything lit. Nothing failed. The constant simply did not mean
// what it said, and every attempt to retune the grass moved it about twice as
// far as expected, which is a miserable thing to tune against.
test('the meadow renders at its stated tone, not at the square of it', () => {
  const f = makeTuftField({ count: 300, radius: 10, seed: 5 });
  const mat = f.mesh.material;
  assert.equal('#' + mat.color.getHexString(), GRASS_TONE.toLowerCase(),
    'the material carries the tone itself');

  // every instance colour is a VARIATION around 1, not a second copy of the base
  const c = new THREE.Color();
  let lo = Infinity, hi = -Infinity, sum = 0;
  for (let i = 0; i < f.mesh.count; i++) {
    f.mesh.getColorAt(i, c);
    lo = Math.min(lo, c.r); hi = Math.max(hi, c.r); sum += c.r;
  }
  const mean = sum / f.mesh.count;
  assert.ok(Math.abs(mean - 1) < 0.06, `instance colours hover around 1, got ${mean.toFixed(3)}`);
  assert.ok(lo < 1 && hi > 1, 'and they vary either side of it, not one-sided');
  assert.ok(hi - lo > 0.05, `there is still blade-to-blade drift (${(hi - lo).toFixed(3)})`);
  // WHAT THE RAMP RECEIVES is material x instance, and that is where the tone
  // and the drift both have to be checked. The multiplier's own spread looks
  // alarming on its own (0.5 .. 1.5) purely because it is a ratio against a
  // dark base — it is not a number anybody ever sees.
  const want = new THREE.Color(GRASS_TONE);
  assert.ok(Math.abs(mat.color.r * mean - want.r) < 0.02, 'material x instance lands on the tone');
  const spread = mat.color.r * (hi - lo);
  assert.ok(spread > 0.01, 'the meadow is not one flat colour');
  assert.ok(spread < want.r * 1.2, `and it is drift, not colour noise (${spread.toFixed(3)})`);
});

test('setTone moves the meadow live, emissive floor included', () => {
  const f = makeTuftField({ count: 100, radius: 10, seed: 5 });
  const before = f.mesh.material.color.getHexString();
  f.setTone('#334455');
  assert.equal(f.mesh.material.color.getHexString(), '334455');
  assert.equal(f.mesh.material.emissive.getHexString(), '334455',
    'the dark-mass lift tracks the tone, or a lighter meadow reads flat');
  assert.notEqual(f.mesh.material.color.getHexString(), before);
});
