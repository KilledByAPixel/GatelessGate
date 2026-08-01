import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { tuftPixels, makeTuftField, TUFT_W, TUFT_H, TUFT_VARIANTS } from '../src/kit/tuftfield.js';

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
  assert.ok(f.mesh.userData.noOutline);
  const u = f.mesh.userData.uniforms;
  for (const k of ['uTime', 'uWind', 'uWindDir', 'uGustScale', 'uGustSpeed', 'uPokePos', 'uPokeAmt', 'uPokeR']) {
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
