import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeVase } from '../src/kit/vase.js';
import k40 from '../src/koans/k40.js';
import { ACCENT } from '../src/palette.js';
import { fakeCtx as sharedCtx } from './helpers/fake-ctx.js';

const box = (o) => new THREE.Box3().setFromObject(o);
const UP = new THREE.Vector3(0, 1, 0);

// the vase's true lean, measured from the world, not from its bookkeeping:
// however the pivot rig is arranged inside, this is the angle the body makes
// with vertical
function tiltOf(group) {
  group.updateMatrixWorld(true);
  const q = group.getObjectByName('body').getWorldQuaternion(new THREE.Quaternion());
  return UP.clone().applyQuaternion(q).angleTo(UP);
}

// the lowest actual vertex of the vase in world space. Box3.setFromObject is
// no good mid-rock: it transforms the local AABB's square corners, which dip
// below ground where no real point of the round base does.
const _v = new THREE.Vector3();
function minYOf(group) {
  group.updateMatrixWorld(true);
  const body = group.getObjectByName('body');
  const pos = body.geometry.attributes.position;
  let min = Infinity;
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(body.matrixWorld);
    if (_v.y < min) min = _v.y;
  }
  return min;
}

const fakeCtx = () => sharedCtx({ accent: k40.accent, quality: 'high' });

// ---- the kit piece -------------------------------------------------------

test('makeVase is grounded and vase-shaped: taller than wide, neck narrower than belly', () => {
  const H = 0.55;
  const vase = makeVase({ height: H, seed: 40 });
  assert.equal(vase.group.name, 'vase');
  const body = vase.group.getObjectByName('body');
  assert.ok(body && body.isMesh, 'one lathed body');

  const b = box(vase.group);
  assert.ok(b.min.y > -0.02 && b.min.y < 0.02, `grounded at y=0, got ${b.min.y}`);
  assert.ok(b.max.y > H * 0.95 && b.max.y < H * 1.05, `reaches its nominal height, got ${b.max.y}`);

  const width = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  assert.ok((b.max.y - b.min.y) / width > 1.3,
    `a vase is taller than it is wide (or it reads as the bowl), got ${((b.max.y - b.min.y) / width).toFixed(2)}`);

  // the silhouette: widest at the belly, drawn in at the neck — measured from
  // the geometry itself, radius by height band
  const pos = body.geometry.attributes.position;
  let belly = 0, neck = 0;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
    if (y > 0.12 * H && y < 0.48 * H) belly = Math.max(belly, r);
    if (y > 0.60 * H && y < 0.87 * H) neck = Math.max(neck, r);
  }
  assert.ok(belly > 0.2 * H, `it has a belly, got r=${belly}`);
  assert.ok(neck < belly * 0.5, `the neck draws well in from the belly: neck ${neck} vs belly ${belly}`);
});

test('a nudge rocks it and the wobble decays back to standing, base never under ground', () => {
  const vase = makeVase({ height: 0.55, seed: 40 });
  const step = (i) => vase.update(1 / 60, i / 60);

  // untouched, it stands dead still — the stillness is the point
  for (let i = 0; i < 30; i++) {
    step(i);
    assert.equal(vase.tilt(), 0, 'no idle sway: the vase is still until touched');
  }
  assert.equal(vase.rocking(), false);
  assert.equal(tiltOf(vase.group), 0);

  vase.nudge();                    // Isan's foot, almost
  assert.equal(vase.nudges(), 1);

  let early = 0, late = 0;
  for (let i = 30; i < 66; i++) {  // the first 0.6 s
    step(i);
    early = Math.max(early, tiltOf(vase.group));
    assert.ok(minYOf(vase.group) > -0.005, 'pivoting on the base rim keeps it on the ground');
  }
  assert.ok(vase.rocking(), 'it is rocking');
  assert.ok(early > 0.03, `the nudge visibly tips it, got ${early}`);

  for (let i = 101; i < 138; i++) {  // 1.2–1.8 s after the nudge
    step(i);
    late = Math.max(late, tiltOf(vase.group));
  }
  assert.ok(late < early * 0.4, `the wobble decays: ${early} early vs ${late} late`);

  for (let i = 138; i < 230; i++) step(i);   // past 3 s
  assert.equal(vase.rocking(), false, 'back to rest in about two and a half seconds');
  assert.equal(vase.tilt(), 0);
  assert.ok(tiltOf(vase.group) < 1e-9, 'standing exactly upright again');
  const b = box(vase.group);
  assert.ok(Math.abs(b.min.y) < 0.005 && Math.abs(b.max.y - 0.55) < 0.01, 'settled exactly where it stood');
});

test('THE VASE CANNOT FALL: hammered for 20 s, the tilt never nears the tipping point', () => {
  // tipping for this form is atan(baseR / comHeight) ≈ 0.46 rad; the cap the
  // kit promises is 0.15. Everything below asserts against 0.155 so the vase
  // stays at a third of the angle it could not recover from.
  const vase = makeVase({ height: 0.55, seed: 40 });
  let peak = 0;
  for (let i = 0; i < 1200; i++) {           // 20 s at 60 fps
    if (i % 5 === 0) vase.nudge();           // kicked every few frames, 240 kicks
    vase.update(1 / 60, i / 60);
    const t = tiltOf(vase.group);
    peak = Math.max(peak, t);
    assert.ok(t <= 0.155, `tilt ${t} exceeded the cap at step ${i}`);
    assert.ok(minYOf(vase.group) > -0.005, `sank under the ground at step ${i}`);
  }
  assert.ok(peak > 0.1, `the cap is actually being exercised, got peak ${peak}`);
  assert.ok(peak <= 0.155, `peak tilt ${peak} must stay far short of tipping (0.46)`);

  // and when the kicking stops, it still rights itself
  for (let i = 1200; i < 1420; i++) vase.update(1 / 60, i / 60);
  assert.equal(vase.rocking(), false);
  assert.ok(tiltOf(vase.group) < 1e-9, 'upright after all of it');
});

test('the wobble is deterministic: same seed and same taps, same motion', () => {
  const drive = (seed) => {
    const vase = makeVase({ height: 0.55, seed });
    const snaps = [];
    for (let i = 0; i < 600; i++) {
      if (i === 45 || i === 200 || i === 204) vase.nudge();
      vase.update(1 / 60, i / 60);
      if (i % 97 === 0 || i === 599) {
        vase.group.updateMatrixWorld(true);
        snaps.push(Array.from(vase.group.getObjectByName('body').matrixWorld.elements));
      }
    }
    return snaps;
  };
  assert.deepEqual(drive(40), drive(40));

  // and the seed matters: a different vase rocks a different way
  const a = makeVase({ height: 0.55, seed: 40 });
  const b = makeVase({ height: 0.55, seed: 41 });
  for (const v of [a, b]) { v.update(1 / 60, 0); v.nudge(); v.update(1 / 60, 1 / 60); }
  a.group.updateMatrixWorld(true); b.group.updateMatrixWorld(true);
  assert.notDeepEqual(
    Array.from(a.group.getObjectByName('body').matrixWorld.elements),
    Array.from(b.group.getObjectByName('body').matrixWorld.elements),
    'seed picks the rock direction');
});

// ---- the case ------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k40.id, 40);
  assert.equal(k40.slug, 'tipping-over-a-water-vase');
  assert.equal(k40.accent, ACCENT);
  assert.equal(k40.tier, 1);
  assert.ok(/vase/i.test(k40.title), `title comes from the text artifact: ${k40.title}`);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k40.text[f] && k40.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.ok(Array.isArray(k40.ambience) && k40.ambience.length > 0);
  assert.ok(k40.ambience.includes('music'), 'the swells play here now');
  assert.equal(k40.mood, 'yo', 'the kick is play, not violence');
  assert.equal(typeof k40.build, 'function');
});

test('build stages the before: a standing vase, the elder, the crowd, and one monk on his feet', () => {
  const built = k40.build(fakeCtx());
  assert.ok(built.scene instanceof THREE.Scene);
  for (const fn of ['update', 'dispose', 'fragment']) {
    assert.equal(typeof built[fn], 'function', `root.${fn} missing`);
  }

  const vases = [], monks = [], huts = [], assemblies = [];
  built.scene.traverse((o) => {
    if (o.name === 'vase') vases.push(o);
    if (o.name === 'monk') monks.push(o);
    if (o.name === 'hut') huts.push(o);
    if (o.name === 'assembly') assemblies.push(o);
  });
  assert.equal(vases.length, 1, 'one vase — the whole test is one object');
  assert.equal(huts.length, 1, 'the hall behind the gathering');
  assert.equal(assemblies.length, 1, 'the seated assembly');
  assert.equal(monks.length, 2, 'Hyakujo, and the one monk on his feet');

  // the elder holds the staff; the other figure is the one about to act
  const elder = monks.find((m) => m.getObjectByName('staff'));
  const isan = monks.find((m) => !m.getObjectByName('staff'));
  assert.ok(elder, 'Hyakujo is the elder');
  assert.ok(isan, 'Isan carries nothing');

  // the vase STANDS — nothing has happened yet
  const vase = vases[0];
  assert.ok(tiltOf(vase) < 1e-9, 'the vase is upright: the before, never the after');
  const vb = box(vase);
  assert.ok(vb.max.y - vb.min.y < 0.7, 'small in frame — its red carries it');

  // Isan is a step forward of the whole seated crowd: nearer the vase than
  // any figure of the assembly
  const asm = assemblies[0];
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const dIsan = Math.hypot(isan.position.x - vase.position.x, isan.position.z - vase.position.z);
  for (let i = 0; i < asm.count; i++) {
    asm.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    const d = Math.hypot(p.x - vase.position.x, p.z - vase.position.z);
    assert.ok(dIsan < d, `Isan (${dIsan.toFixed(2)}) steps out in front of the crowd (${d.toFixed(2)})`);
  }

  // THE SEAL: the vase is red and glows on its own, and nothing else does
  const accentHex = new THREE.Color(ACCENT).getHexString();
  const body = vase.getObjectByName('body');
  assert.equal(body.material.color.getHexString(), accentHex, 'the vase carries the seal');
  assert.ok(body.material.emissiveIntensity > 0, 'the seal glows without help (SEAL_GLOW)');
  built.scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && !vase.getObjectById(o.id)) {
      assert.notEqual(o.material.color.getHexString(), accentHex,
        `nothing but the vase wears the seal: ${o.name}`);
    }
  });
});

test('the scene runs without a renderer or audio, and reports a finite fragment', () => {
  const built = k40.build(fakeCtx());
  built.setCamera(null);
  built.onEnter && built.onEnter();      // audio is null: must not throw
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  assert.equal(frag.nudges, 0, 'nobody has touched it');
  assert.equal(frag.rocking, false);
  built.onExit && built.onExit();
  built.dispose();
});

test('tapping the vase nudges it; it rocks, rights itself, and can never be knocked over', () => {
  const ctx = fakeCtx();
  const built = k40.build(ctx);
  assert.ok(ctx._taps.length > 0, 'there has to be something to find');
  built.setCamera(new THREE.PerspectiveCamera());

  // a tap that finds nothing does nothing
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(built.fragment().nudges, 0);

  // a tap on the vase is Isan's foot, almost
  const vase = built.scene.getObjectByName('vase');
  const body = vase.getObjectByName('body');
  ctx.input.raycastFirst = (cam, targets) =>
    (targets && targets.includes(body)) ? { object: body, point: new THREE.Vector3() } : null;
  ctx._taps.forEach((cb) => cb(400, 300));
  built.update(1 / 60, 1 / 60);
  let f = built.fragment();
  assert.equal(f.nudges, 1);
  assert.ok(f.rocking, 'it is rocking');
  assert.ok(f.rock > 0.01, `it visibly tips, got ${f.rock}`);

  // hammer it through the module for 12 s — the cap holds end to end
  let peak = 0;
  for (let i = 2; i < 60 * 12; i++) {
    if (i % 5 === 0) ctx._taps.forEach((cb) => cb(400, 300));
    built.update(1 / 60, i / 60);
    peak = Math.max(peak, tiltOf(vase));
    assert.ok(built.fragment().rock <= 0.155, 'the fragment agrees: capped');
  }
  assert.ok(peak > 0.1 && peak <= 0.155, `rocked hard but never toward falling, got ${peak}`);
  assert.ok(built.fragment().nudges > 100, 'every tap landed');

  // left alone, the question stands again
  for (let i = 60 * 12; i < 60 * 16; i++) built.update(1 / 60, i / 60);
  f = built.fragment();
  assert.equal(f.rocking, false);
  assert.equal(f.rock, 0);
  assert.ok(tiltOf(vase) < 1e-9, 'upright, unspilled, undecided');
});
