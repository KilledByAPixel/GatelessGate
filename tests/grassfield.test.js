import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import {
  patchDensity, grassPlacements, grassArea, setGrassReach, RIM_SHRINK,
} from '../src/kit/grassfield.js';
import { makeTuftField } from '../src/kit/tuftfield.js';
import { composeWorld } from '../src/kit/scenery.js';
import { groundHeight } from '../src/kit/ground.js';
import { setBreezePointer, clearBreeze } from '../src/kit/breeze.js';

// These guard a bug that shipped: the meadow cut a huge SQUARE out of itself
// around the staging. One octave of bilinear value noise on an integer lattice,
// thresholded to zero, leaves holes whose edges follow lattice-aligned
// iso-contours — and at the frequency it ran, one cell was wider than the
// visible field, so a single hash decided whether the middle of the shot had
// grass at all.
//
// Measured against the old code, the FLOOR assertion below is the one that
// catches it. The stand-size and isotropy assertions do not: value noise's
// autocorrelation is near-isotropic (ratio 1.31) even where its thresholded
// contours are square, so those two are supporting guards on stand scale, not
// proof that the squares are gone. What removed them is having no hard-zero
// region to draw an edge around.

const GRID = (fn) => {
  const out = [];
  for (let x = -18; x <= 18; x += 1.5) for (let z = -18; z <= 18; z += 1.5) out.push(fn(x, z));
  return out;
};

test('patchiness thins the meadow but never bares it', () => {
  const d = GRID((x, z) => patchDensity(x, z, 2349, 0.42));
  const min = Math.min(...d);
  const max = Math.max(...d);
  // Deliberately well under PATCH_FLOOR: this asserts the PROPERTY (thin grass
  // everywhere, never bare earth) rather than restating the constant, so the
  // floor stays free to be tuned for density without touching the test. The old
  // code scored 0.000 here.
  assert.ok(min > 0.15, `no bald ground anywhere: min ${min.toFixed(3)}`);
  assert.ok(max > 0.95, `full stands still exist: max ${max.toFixed(3)}`);

  // and it must still VARY — a flat field is the other failure, no visual rest
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length);
  assert.ok(sd > 0.15, `stands and clearings, not a uniform lawn: sd ${sd.toFixed(3)}`);
});

test('every case is staged on ground that has grass', () => {
  // composeWorld seeds the field with koan seed * 81
  for (const [name, x, z, seed] of [
    ['k1 dog', 0, 0, 1], ['k6 assembly', 1.2, -2.2, 6], ['k7 basin', 2.15, 0.9, 7],
    ['k29 monks', 1.4, 1.7, 29], ['k29 gate', 1.4, -2.6, 29], ['k37 buffalo', 1.0, 0.1, 37],
  ]) {
    let sum = 0;
    for (let a = 0; a < 8; a++) {
      sum += patchDensity(x + Math.cos(a / 8 * 6.28318) * 2.5,
        z + Math.sin(a / 8 * 6.28318) * 2.5, seed * 81, 0.42);
    }
    // guaranteed by the floor rather than by luck of the seed — which is the
    // point: before it existed, k29's gate and k6's assembly both scored 0.00
    assert.ok(sum / 8 > 0.18, `${name} stands in grass, not on a bald patch: ${(sum / 8).toFixed(2)}`);
  }
});

test('grass stands are smaller than the shot, and not axis-aligned', () => {
  // Autocorrelation length along each axis. The old lattice put one cell at
  // ~11.8 units, wider than the near field; stands must decorrelate well inside
  // it or a single patch can blank the whole view again.
  const at = (x, z) => patchDensity(x, z, 2349, 0.42);
  const samples = [];
  for (let x = -16; x <= 16; x += 0.5) for (let z = -16; z <= 16; z += 0.5) samples.push([x, z]);
  const base = samples.map(([x, z]) => at(x, z));
  const mean = base.reduce((s, v) => s + v, 0) / base.length;
  const varr = base.reduce((s, v) => s + (v - mean) ** 2, 0) / base.length;

  const corrAt = (dx, dz) => {
    let c = 0;
    for (let i = 0; i < samples.length; i++) {
      const [x, z] = samples[i];
      c += (base[i] - mean) * (at(x + dx, z + dz) - mean);
    }
    return c / samples.length / varr;
  };

  const dirs = { '+x': [1, 0], '+z': [0, 1], 'diag': [0.7071, 0.7071], 'anti': [0.7071, -0.7071] };
  const lengths = {};
  for (const [name, [ux, uz]] of Object.entries(dirs)) {
    let d = 0.5;
    while (d < 20 && corrAt(ux * d, uz * d) > 0.5) d += 0.5;
    lengths[name] = d;
  }
  // measured 3.5-5.5 units; the old single octave sat at 6.5-8.5
  for (const [name, d] of Object.entries(lengths)) {
    assert.ok(d < 6.5, `${name} stands decorrelate well inside the shot: ${d} units`);
  }
});

test('the breeze is invisible until a pointer moves', () => {
  // uPokeAmt = 0 is the whole feature switched off: a scene that is never
  // poked must render EXACTLY as it did before breeze.js existed. The wind
  // clock may tick all it likes — only real pointer motion may raise it.
  clearBreeze();
  const f = makeTuftField({ count: 300, radius: 20, seed: 2349 });
  const u = f.mesh.userData.uniforms;
  assert.equal(u.uPokeAmt.value, 0, 'born still');
  assert.ok(u.uPokePos, 'poke position uniform exists');
  assert.ok(u.uPokeDir, 'poke direction uniform exists — v2 is directional');
  assert.ok(u.uPokeR.value > 0, 'poke radius uniform exists');
  for (let i = 0; i < 240; i++) f.update(1 / 60, i / 60);
  assert.equal(u.uPokeAmt.value, 0, 'stays exactly zero with no pointer — not drifting');
  clearBreeze();
});

test('a sweep brushes the field ALONG the stroke, and release springs it back', () => {
  clearBreeze();
  const f = makeTuftField({ count: 300, radius: 20, seed: 2349 });
  const u = f.mesh.userData.uniforms;
  // a full second of brisk +x sweeping, so the spring settles on the stroke
  let x = 0;
  for (let i = 0; i < 60; i++) { x += 8 / 60; setBreezePointer(x, 0, 1 / 60); f.update(1 / 60, 4 + i / 60); }
  assert.ok(u.uPokeAmt.value > 0.3, `a swipe is felt: ${u.uPokeAmt.value.toFixed(3)}`);
  assert.ok(u.uPokeDir.value.x > 0.99 && Math.abs(u.uPokeDir.value.y) < 0.01,
    `and it points the way the pointer moved: (${u.uPokeDir.value.x.toFixed(3)}, ${u.uPokeDir.value.y.toFixed(3)})`);
  assert.ok(Math.abs(u.uPokePos.value.x - x) < 1e-9, 'the poke rides the pointer');

  // hand lifts: the response must cross ZERO along the old stroke (the spring
  // swings past rest — uPokeDir flips) before settling exactly still
  clearBreeze();
  const atRelease = u.uPokeAmt.value;
  let minAlong = Infinity;
  for (let i = 0; i < 240; i++) {
    f.update(1 / 60, 6 + i / 60);
    minAlong = Math.min(minAlong, u.uPokeAmt.value * u.uPokeDir.value.x);
  }
  assert.ok(minAlong < -atRelease * 0.05,
    `swings back past rest: min along-stroke ${minAlong.toFixed(4)} of held ${atRelease.toFixed(3)}`);
  for (let i = 0; i < 600; i++) f.update(1 / 60, 12 + i / 60);
  assert.ok(u.uPokeAmt.value < 0.01, `and the wake settles: ${u.uPokeAmt.value}`);
  clearBreeze();
});

test('grass plants on the surface it is given — and nothing moves when none is', () => {
  // groundFn is ADDITIVE: k11's rise is a prop the terrain function knows
  // nothing about, so the case hands placement the surface its meshes stand
  // on. Every scene that does NOT pass one must keep planting exactly where it
  // always did — this pins that, byte for byte.
  const opts = { count: 600, radius: 16, seed: 2349 };
  const plain = grassPlacements(opts);
  assert.ok(plain.length > 300, `placements to compare: ${plain.length}`);
  // the default has always been the terrain function itself, exactly — no sink
  for (const p of plain) {
    assert.equal(p.y, groundHeight(p.x, p.z, { seed: 21 }), 'default y IS groundHeight');
  }
  // groundFn: null is the "absent" spelling — identical output, not merely close
  assert.deepEqual(grassPlacements({ ...opts, groundFn: null }), plain);

  // a case-shaped surface: half plateau, half tilted plane
  const fn = (x, z) => (x > 0 ? 0.5 : 0) + 0.1 * z;
  const lifted = grassPlacements({ ...opts, groundFn: fn });
  assert.equal(lifted.length, plain.length, 'acceptance never reads the height');
  for (let i = 0; i < plain.length; i++) {
    const a = plain[i], b = lifted[i];
    // only y answers the surface — same blades, same spots, same look
    assert.equal(b.x, a.x);
    assert.equal(b.z, a.z);
    assert.equal(b.yaw, a.yaw);
    assert.equal(b.wide, a.wide);
    assert.equal(b.tall, a.tall);
    assert.deepEqual(b.tint, a.tint);
    // and the root sits a hair BELOW the surface, so it never floats off a facet
    assert.ok(Math.abs(b.y - (fn(b.x, b.z) - 0.02)) < 1e-12,
      `root buried in the given ground: ${b.y} vs surface ${fn(b.x, b.z)}`);
  }
});

// Ported from the blade field when it was cut: the SHIPPED field has to do
// this too, and it is the same placement layer underneath either way.
test('the field stands its instances on the supplied ground', () => {
  const fn = (x, z) => 2 + 0.05 * x - 0.03 * z;
  const f = makeTuftField({ count: 300, radius: 12, seed: 7, groundFn: fn });
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3();
  assert.ok(f.blades > 100, `plants to check: ${f.blades}`);
  for (let i = 0; i < f.blades; i++) {
    f.mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    assert.ok(Math.abs(p.y - (fn(p.x, p.z) - 0.02)) < 1e-5,
      `plant ${i} rooted in its ground: y ${p.y} at (${p.x}, ${p.z})`);
  }
});

test('the field actually places the plants it is asked for', () => {
  // The old rejection rates were so high the placement loop ran out of candidate
  // budget and quietly delivered half a meadow.
  const f = makeTuftField({ count: 6000, radius: 20, seed: 2349 });
  assert.ok(f.blades > 6000 * 0.98, `placed ${f.blades} of 6000`);
});

// THE RIM. The meadow should reach further AND taper off rather than stopping
// abruptly. The field always thinned toward its edge; what it never did was
// SHRINK, so the last plants standing on the boundary were full-height and drew
// the circle the thinning was meant to hide.
test('the meadow thins AND shrinks toward its edge, and is empty at the rim', () => {
  const radius = 24, taper = 0.45;
  const spots = grassPlacements({ count: 20000, radius, taper, seed: 2349 });
  const ring = (r0, r1) => spots.filter((p) => {
    const rr = Math.hypot(p.x, p.z);
    return rr >= r0 && rr < r1;
  });
  const density = (r0, r1) => ring(r0, r1).length / (Math.PI * (r1 * r1 - r0 * r0));
  const meanRim = (r0, r1) => {
    const g = ring(r0, r1);
    return g.reduce((s, p) => s + p.rim, 0) / Math.max(1, g.length);
  };

  // the core is solid and untouched: rim 0 means the renderers scale by 1
  assert.equal(meanRim(0, radius * taper * 0.9), 0, 'nothing shrinks inside the core');

  // density falls off, and keeps falling, all the way out
  const bands = [[10, 14], [14, 18], [18, 22], [22, 24]].map(([a, b]) => density(a, b));
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i] < bands[i - 1] * 0.75,
      `band ${i} keeps thinning: ${bands.map((d) => d.toFixed(1))}`);
  }

  // and so does plant size — this is the half that is new
  const sizes = [[10, 14], [14, 18], [18, 22], [22, 24]].map(([a, b]) => meanRim(a, b));
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1], `plants keep shrinking: ${sizes.map((s) => s.toFixed(2))}`);
  }
  assert.ok(sizes.at(-1) > 0.85, `the outermost survivors are ${(RIM_SHRINK * sizes.at(-1) * 100).toFixed(0)}% shorter`);

  // nothing stands outside the reach, and the tail really does reach it
  const rr = spots.map((p) => Math.hypot(p.x, p.z));
  assert.ok(Math.max(...rr) <= radius, 'nothing past the stated reach');
  assert.ok(Math.max(...rr) > radius * 0.95, 'and the field does get out there');
});

test('the taper is a real knob: pull it in and the dissolve starts earlier', () => {
  const opts = { count: 8000, radius: 24, seed: 2349 };
  const startOf = (taper) => {
    const spots = grassPlacements({ ...opts, taper });
    // the innermost plant that has begun to shrink at all
    return Math.min(...spots.filter((p) => p.rim > 0).map((p) => Math.hypot(p.x, p.z)));
  };
  const early = startOf(0.35), late = startOf(0.75);
  assert.ok(early < late - 5, `0.35 starts at ${early.toFixed(1)}, 0.75 at ${late.toFixed(1)}`);
  // and both still respect the same outer edge
  assert.ok(late < 24, 'the dissolve always fits inside the reach');
});

test('grassArea matches the placement rule it budgets for', () => {
  // composeWorld buys grass by this integral rather than by pi*r^2, so if the
  // falloff in grassPlacements is ever retuned without retuning the closed form
  // here, every scene's density silently moves. Checked against a numeric
  // integral of the SAME smoothstep the placement loop uses.
  const ss = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  for (const [radius, taper] of [[20, 0.62], [24, 0.45], [30, 0.3], [16, 0.8]]) {
    let numeric = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = (i + 0.5) * radius / N;
      numeric += (1 - ss((r - radius * taper) / (radius * (1 - taper)))) * 2 * Math.PI * r * (radius / N);
    }
    const closed = grassArea(radius, taper);
    assert.ok(Math.abs(closed - numeric) / numeric < 1e-3,
      `r=${radius} t=${taper}: closed ${closed.toFixed(1)} vs numeric ${numeric.toFixed(1)}`);
  }
});

test('reaching further buys more grass instead of spreading the same grass thinner', () => {
  // The failure this guards is the one that makes the reach slider useless: a
  // fixed plant count over a bigger disc is a SPARSER meadow, so "further"
  // would have read as "thinner" and the near field — the part the reader is
  // actually looking at — would have got worse every notch.
  const near = (scene) => {
    const field = scene.getObjectByName('grassfield');
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < field.count; i++) {
      field.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      if (Math.hypot(p.x, p.z) < 8) n++;
    }
    return n;
  };

  const at = (radius) => {
    setGrassReach(radius);
    const scene = new THREE.Scene();
    composeWorld(scene, { seed: 7, groundSeed: 21 });
    return { total: scene.getObjectByName('grassfield').count, near: near(scene) };
  };

  try {
    const short = at(18);
    const long = at(30);
    assert.ok(long.total > short.total * 1.3,
      `a longer reach buys more plants: ${short.total} -> ${long.total}`);
    // the near field is what must NOT change: same core density either way
    assert.ok(Math.abs(long.near - short.near) / short.near < 0.08,
      `the near field holds its density: ${short.near} vs ${long.near} inside r=8`);
  } finally {
    setGrassReach(24);   // module state — leave it as the rest of the suite expects
  }
});
