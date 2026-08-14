import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k47 from '../src/koans/k47.js';
import { bySlug } from '../src/koans/index.js';
import TEXT from '../src/koans/text/mumonkan.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT, PAPER } from '../src/palette.js';
import { fakeCtx, hitOnly } from './helpers/fake-ctx.js';
import { stubAudio } from './helpers/stub-audio.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';

// Case 47 is almost pure composition — one road, three barriers across it, a
// walker between the first and the second — so what can go quietly wrong is
// compositional: a gate drifting off the road, the seal landing on the wrong
// barrier, the third gate either fully swallowed by the fog or not dissolving
// at all, or the stack collapsing into a single silhouette somewhere in the
// orbit. All of that is checkable with numbers, so it is checked here.

const SEAL = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
  .map((c) => new THREE.Color(c).getHexString()));

// place a camera exactly where the case's own `camera` block puts it
const rigCamera = (heading = k47.camera.heading, aspect = 1.78) =>
  sharedRig(k47.camera, { heading, aspect });

// The barriers STANDING ON THE ROAD, nearest (largest z) first.
//
// There are FOUR gates now and only three of them are on the road: the fourth
// waits in the slot behind the reader, undrawn, for the next slide to bring it
// up. `visible` is the honest filter — it is exactly what the renderer uses —
// and every compositional check below is about what is in the picture.
function gatesByDepth(scene) {
  const gates = [];
  scene.traverse((o) => { if (o.name === 'gate' && o.visible) gates.push(o); });
  gates.sort((a, b) => b.position.z - a.position.z);
  return gates;
}

const postMat = (gate) => gate.children.find((c) => c.name === 'post').material;
const lintelTop = (gate) => {
  const h = gate.children.find((c) => c.name === 'lintel');
  return new THREE.Vector3(gate.position.x, gate.position.y + h.position.y, gate.position.z);
};

// densely resampled centreline for straddle checks
function centreline(scene, n = 400) {
  const path = scene.getObjectByName('path');
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(path.sample(i / n));
  return pts;
}
const nearestOn = (pts, x, z) => pts.reduce(
  (best, p) => {
    const d = Math.hypot(x - p.x, z - p.z);
    return d < best.d ? { d, p } : best;
  },
  { d: Infinity, p: null },
);

// ---- the module -------------------------------------------------------------

test('module shape matches the koan contract', () => {
  assert.equal(k47.id, 47);
  assert.equal(k47.slug, 'three-gates-of-tosotsu');
  const idx = bySlug('three-gates-of-tosotsu');
  assert.ok(idx && idx.id === 47, 'the slug is the one the index derives from the title');
  assert.equal(k47.accent, ACCENT);
  assert.equal(k47.tier, 1);
  assert.equal(k47.title, 'Three Gates of Tosotsu');
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k47.text[f] && k47.text[f].trim().length > 0, `text.${f} empty`);
  }
  // the case file must never author prose — it all comes from TEXT[47]. Said
  // against the text module itself rather than against a phrase out of it: this
  // matched /three barriers/ until the 2026 pass wrote "three gates", agreeing
  // with the case's own title, and the test failed for an edit that was right.
  // Comparing the two is the actual claim and cannot go stale.
  assert.equal(k47.text.case, TEXT[47].case);
  assert.equal(k47.text.comment, TEXT[47].comment);
  assert.equal(k47.text.verse, TEXT[47].verse);
  // the furin token went with the chime it named — see the note in the case
  assert.deepEqual(k47.ambience, ['wind:0.16', 'music']);
  assert.equal(typeof k47.build, 'function');
  assert.ok(k47.camera && k47.camera.target, 'this case frames itself');
});

// ---- the staging ------------------------------------------------------------

test('three barriers straddle one road, in order, stepping down with depth', () => {
  const root = k47.build(fakeCtx());
  assert.ok(root.scene instanceof THREE.Scene);
  assert.equal(root.scene.fog.density, 0.030, 'the wash math below assumes the house fog');
  assert.equal(root.scene.background.getHexString(), new THREE.Color(PAPER).getHexString());

  const gates = gatesByDepth(root.scene);
  assert.equal(gates.length, 3, 'Tosotsu built three');

  const pts = centreline(root.scene);
  let lastZ = Infinity, lastH = Infinity;
  for (const [i, g] of gates.entries()) {
    // ON the road: the gate's centre sits essentially on the centreline (the
    // ribbon's half-width never drops below ~0.72)
    const { d, p } = nearestOn(pts, g.position.x, g.position.z);
    assert.ok(d < 0.5, `gate ${i + 1} strays ${d.toFixed(2)} from the centreline`);
    // and square to it: rotation matches the road's heading where it stands
    let dh = ((g.rotation.y - p.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    assert.ok(Math.abs(dh) < 0.15, `gate ${i + 1} sits ${dh.toFixed(2)} rad off the road's heading`);
    // in sequence down the road, each smaller than the last
    assert.ok(g.position.z < lastZ, 'gates come near, middle, far');
    const h = new THREE.Box3().setFromObject(g);
    const height = h.max.y - h.min.y;
    assert.ok(height < lastH, `gate ${i + 1} should step down in size, got ${height.toFixed(2)}`);
    lastZ = g.position.z; lastH = height;
    // deep placements sit on the terrain, not floating at y=0 over a rise
    const sunk = g.position.y <= p.y + 1e-6;
    assert.ok(sunk, `gate ${i + 1} floats above the road: y=${g.position.y} road=${p.y}`);
    assert.ok(g.position.y > p.y - 0.4, `gate ${i + 1} is buried: y=${g.position.y} road=${p.y}`);
  }
});

test('all three barriers carry the seal; the fog does the hierarchy', () => {
  // Overriding the middle-only draft: three red gates on one road, with
  // DISTANCE as the differentiator — the near one full-blooded, the far one a
  // red ghost half into the paper. Each takes the deep mix like the title
  // screen's gate, and each glows on its own (washMaterial keys off the accent
  // family; k47 never sets emissive by hand).
  const root = k47.build(fakeCtx());
  const gates = gatesByDepth(root.scene);
  const deepHex = new THREE.Color(ACCENT_DEEP).getHexString();
  for (const [i, g] of gates.entries()) {
    assert.ok(SEAL.has(postMat(g).color.getHexString()), `barrier ${i + 1} carries the seal`);
    assert.equal(postMat(g).color.getHexString(), deepHex, `barrier ${i + 1} takes the deep mix`);
    assert.equal(postMat(g).emissiveIntensity, 0.5, `barrier ${i + 1} glows like every seal`);
  }
});

test('the walker is on the road, between the first barrier and the second', () => {
  const root = k47.build(fakeCtx());
  const monks = [];
  root.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 1, 'one walker, nothing else on the road');
  const monk = monks[0];
  const gates = gatesByDepth(root.scene);
  assert.ok(monk.position.z < gates[0].position.z && monk.position.z > gates[1].position.z,
    `mid-journey: z=${monk.position.z.toFixed(1)} should sit between ${gates[0].position.z.toFixed(1)} and ${gates[1].position.z.toFixed(1)}`);
  const pts = centreline(root.scene);
  const { d, p } = nearestOn(pts, monk.position.x, monk.position.z);
  assert.ok(d < 0.6, `the walker stands ON the road, got ${d.toFixed(2)} off the centreline`);
  // facing the way the road goes — toward the second barrier, back to the lens
  let dh = ((monk.rotation.y - p.heading) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  assert.ok(Math.abs(dh) < 0.2, `the walker faces down the road, got ${dh.toFixed(2)} rad off`);
});

// ---- the fog does the arguing ----------------------------------------------

test('presence recedes barrier by barrier: solid, softening, dissolving', () => {
  // FogExp2 wash ~ 1 - exp(-(density*d)^2), with d approximated as euclidean
  // distance from the home camera (view depth differs by a cosine — the bands
  // are wide enough to absorb it). The third barrier must be dissolving but
  // not gone; the first must be solid ink.
  const root = k47.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const cam = rigCamera();
  const gates = gatesByDepth(root.scene);
  const wash = gates.map((g) => {
    const d = lintelTop(g).distanceTo(cam.position);
    const f = root.scene.fog.density * d;
    return 1 - Math.exp(-f * f);
  });
  assert.ok(wash[0] < 0.15, `the first barrier is a few steps ahead, got ${(wash[0] * 100).toFixed(0)}%`);
  assert.ok(wash[1] > 0.15 && wash[1] < 0.45, `the second is present but softening, got ${(wash[1] * 100).toFixed(0)}%`);
  assert.ok(wash[2] > 0.50 && wash[2] < 0.75, `the third is dissolving, not gone, got ${(wash[2] * 100).toFixed(0)}%`);
  assert.ok(wash[0] < wash[1] && wash[1] < wash[2], 'presence recedes in order');
});

test('the three lintels stack in frame at home, at every aspect', () => {
  const root = k47.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const gates = gatesByDepth(root.scene);
  for (const aspect of [1.78, 1.30, 0.80]) {
    const cam = rigCamera(k47.camera.heading, aspect);
    let lastY = -Infinity;
    for (const [i, g] of gates.entries()) {
      const v = lintelTop(g).project(cam);
      assert.ok(Math.abs(v.x) < 0.92, `gate ${i + 1} lintel in frame at aspect ${aspect}, x=${v.x.toFixed(2)}`);
      assert.ok(v.y > -0.5 && v.y < 0.92, `gate ${i + 1} lintel in the upper band, y=${v.y.toFixed(2)}`);
      assert.ok(v.y > lastY, 'each barrier a step higher up the frame than the last');
      lastY = v.y;
    }
  }
});

test('the stack never collapses into one silhouette across the orbit', () => {
  // At the heading where the camera crosses the road's axis the three centres
  // nearly coincide — there the near-largest size stepping must keep them
  // nested as three distinct frames (projected width ratio); everywhere else
  // the centres themselves must separate. Checked at home +-29 degrees as staged.
  const root = k47.build(fakeCtx());
  root.scene.updateMatrixWorld(true);
  const gates = gatesByDepth(root.scene);
  for (const daz of [-28.6, -14.3, 0, 14.3, 28.6]) {
    const cam = rigCamera(k47.camera.heading + daz);
    const proj = gates.map((g) => {
      const c = lintelTop(g).project(cam);
      // post-to-post width on screen
      const half = new THREE.Box3().setFromObject(g);
      const w = (half.max.x - half.min.x) / 2;   // gates face nearly down z: x-extent is the span
      const y = g.position.y + 3.0;
      const pl = new THREE.Vector3(g.position.x - w, y, g.position.z).project(cam);
      const pr = new THREE.Vector3(g.position.x + w, y, g.position.z).project(cam);
      return { c, hw: Math.hypot(pl.x - pr.x, pl.y - pr.y) / 2 };
    });
    for (const [a, b] of [[0, 1], [1, 2]]) {
      const sep = Math.hypot(proj[a].c.x - proj[b].c.x, proj[a].c.y - proj[b].c.y);
      const ratio = proj[a].hw / proj[b].hw;
      assert.ok(sep > 0.25 || ratio > 1.3,
        `heading ${(k47.camera.heading + daz).toFixed(1)}: gates ${a + 1}/${b + 1} sep=${sep.toFixed(2)} ratio=${ratio.toFixed(2)} — one silhouette`);
    }
  }
});

// ---- the moment -------------------------------------------------------------

test('the tap zones are frames, not doorways — a tap through the arch falls through', () => {
  const root = k47.build(fakeCtx());
  const gates = gatesByDepth(root.scene);
  for (const [i, g] of gates.entries()) {
    const slabs = g.children.filter((c) => c.name === 'gatehit');
    assert.ok(slabs.length >= 3, `gate ${i + 1} offers its posts and lintel to a fingertip`);
    for (const s of slabs) {
      assert.equal(s.visible, false, 'the renderer never sees a tap zone');
      // no slab may cover the middle of the doorway at torso height, or the
      // near gate would swallow taps aimed through its arch at the two beyond
      const { width, height } = s.geometry.parameters;
      const inX = Math.abs(0 - s.position.x) < width / 2;
      const inY = Math.abs(1.3 - s.position.y) < height / 2;
      assert.ok(!(inX && inY), `gate ${i + 1} slab covers the doorway at (0, 1.3)`);
    }
  }
});

test('each barrier answers with its own bell, the nearest the biggest', () => {
  const bells = [];
  const audio = {
    bell: (o) => bells.push(o.preset),
    startAmbience: () => {}, stopAmbience: () => {}, setWindLevel: () => {},
  };
  const ctx = fakeCtx({ audio });
  const root = k47.build(ctx);
  assert.ok(ctx._taps.length > 0, 'the case has to offer something to find');
  root.setCamera(rigCamera());
  const gates = gatesByDepth(root.scene);
  const slabOf = (i) => gates[i].children.find((c) => c.name === 'gatehit');

  // a tap that hits nothing changes nothing
  ctx._taps.forEach((cb) => cb(10, 10));
  const counts = (f) => ({ taps1: f.taps1, taps2: f.taps2, taps3: f.taps3 });
  assert.deepEqual(counts(root.fragment()), { taps1: 0, taps2: 0, taps3: 0 });

  // tap each barrier and check the counter and the preset both route to it.
  // Each tap advances the clock past the per-bell cooldown first (see the
  // cooldown test below) — index 1 is tapped twice here, and without the
  // advance the second tap would land inside its own cooldown window and be
  // silently swallowed rather than ringing a second time. Presets follow
  // GATE_PRESETS in k47.js: near gate biggest bell, far gate smallest —
  // task-12's migration off the raw f0 ramp (62 + 18*i).
  const expect = [0, 0, 0];
  let clock = 0;
  for (const [i, preset] of [[1, 'temple'], [2, 'hand'], [0, 'great'], [1, 'temple']]) {
    clock += 0.6;
    root.update(0, clock);
    ctx.input.raycastFirst = hitOnly(slabOf(i));
    ctx._taps.forEach((cb) => cb(10, 10));
    expect[i]++;
    assert.equal(bells[bells.length - 1], preset, `barrier ${i + 1} rings preset=${preset}`);
  }
  assert.deepEqual(counts(root.fragment()), { taps1: expect[0], taps2: expect[1], taps3: expect[2] });
  assert.ok(bells.includes('great') && bells.includes('temple') && bells.includes('hand'), 'three bells, stepped by size');

  // and with no audio at all, the counter still counts and nothing throws.
  // Target-aware, like the loop above: the handler probes the furin first,
  // and a mock that answers every raycast would feed the tap to the chime.
  const quiet = fakeCtx();
  const qroot = k47.build(quiet);
  qroot.setCamera(rigCamera());
  const qgates = gatesByDepth(qroot.scene);
  const qhit = qgates[2].children.find((c) => c.name === 'gatehit');
  quiet.input.raycastFirst = hitOnly(qhit);
  quiet._taps.forEach((cb) => cb(10, 10));
  assert.equal(qroot.fragment().taps3, 1);
});

test('a bell cannot be re-struck inside its cooldown — holding the pointer down must not stack strikes without limit', () => {
  // The bug found in review: k47 had no tap cooldown at all, and the shimmer
  // cluster took a strike from 22 to 36 oscillators — so a held pointer or a
  // fast tapper could stack strikes without limit. k49's idiom
  // (`clock - lastRing > 0.5`) fixes it here per barrier.
  const bells = [];
  const audio = { ...stubAudio(), bell: (o) => bells.push(o.f0) };
  const ctx = fakeCtx({ audio });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  const gates = gatesByDepth(root.scene);
  const slab0 = gates[0].children.find((c) => c.name === 'gatehit');
  const slab1 = gates[1].children.find((c) => c.name === 'gatehit');

  root.update(0, 0);
  ctx.input.raycastFirst = hitOnly(slab0);
  ctx._taps.forEach((cb) => cb(10, 10));    // first strike on barrier 1
  ctx._taps.forEach((cb) => cb(10, 10));    // immediate repeat, inside the 0.5s cooldown
  ctx._taps.forEach((cb) => cb(10, 10));    // and again
  assert.equal(root.fragment().taps1, 1, 'repeats inside the cooldown must not stack');
  assert.equal(bells.length, 1, 'only one strike actually rang');

  // a different barrier is a DIFFERENT bell — its own cooldown, not blocked
  // by barrier 1's
  ctx.input.raycastFirst = hitOnly(slab1);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().taps2, 1, 'a different barrier rings on its own cooldown');
  assert.equal(bells.length, 2);

  // past the cooldown, barrier 1 answers again
  root.update(0.6, 0.6);
  ctx.input.raycastFirst = hitOnly(slab0);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().taps1, 2, 'a tap after the cooldown rings again');
  assert.equal(bells.length, 3);
});

test('nothing hangs from a barrier any more', () => {
  // A single furin under the near gate's lintel was this page's ambient voice.
  // The near barrier is not a fixed object now, and a chime hung on it was
  // ruled out before the slide was built. It would have ridden one gate up the
  // road and out into the fog, taking the page's only continuous sound with it
  // and bringing it back four taps later.
  const struck = [];
  const audio = { ...stubAudio(), chimeStrike: (o) => struck.push(o) };
  const root = k47.build(fakeCtx({ audio }));
  let hung = 0;
  root.scene.traverse((o) => { if (o.name === 'furin' || o.userData.hungBy === 'hangChimes') hung++; });
  assert.equal(hung, 0, 'no chime rides the barriers');

  // and nothing speaks on its own: every sound on this page is the reader's
  for (let i = 0; i * (1 / 60) < 300; i++) root.update(1 / 60, i / 60);
  assert.equal(struck.length, 0, `the page stayed quiet: ${struck.length} strikes`);
});

// ---- the road turns over ---------------------------------------------------
// The staging IS the case: Tosotsu's three barriers are three
// questions, and the joke the composition could never tell on its own is that
// passing one does not leave you with two. Touch any gate and the whole road
// slides one place forward — a fourth comes up out of the space behind the
// reader, and the one that was furthest walks on until the fog has it.
test('a tap slides the road one place, and every slot stays filled', () => {
  const audio = { bell() {} };
  const ctx = fakeCtx({ audio });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  const before = gatesByDepth(root.scene).map((g) => g.position.z);
  assert.equal(before.length, 3, 'three on the road to begin with');
  assert.equal(root.fragment().slides, 0);
  // 0 + 1 + 2 + 3: every slot filled exactly once, which is the invariant the
  // whole rotation has to preserve
  assert.equal(root.fragment().slotSum, 6);

  const slab = gatesByDepth(root.scene)[0].children.find((c) => c.name === 'gatehit');
  ctx.input.raycastFirst = hitOnly(slab);
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  run(0.1);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().slides, 1);
  assert.equal(root.fragment().sliding, 1, 'the road is moving');

  run(3.2);
  assert.equal(root.fragment().sliding, 0, 'and it arrives');
  assert.equal(root.fragment().slotSum, 6, 'every slot filled exactly once, still');
  const after = gatesByDepth(root.scene).map((g) => g.position.z);
  assert.equal(after.length, 3, 'three on the road afterwards too — never two, never four');
  // and they are standing where the three barriers stood: the road looks the
  // same, which is the entire point
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(after[i] - before[i]) < 0.05,
      `slot ${i + 1} is occupied again (${after[i].toFixed(2)} vs ${before[i].toFixed(2)})`);
  }
});

test('the road can turn over for ever without drifting', () => {
  // four slides is a full rotation: every gate has been through every slot and
  // the picture must be bit-for-bit the one it started as
  const ctx = fakeCtx({ audio: stubAudio() });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  const snap = () => gatesByDepth(root.scene)
    .map((g) => `${g.position.x.toFixed(4)},${g.position.y.toFixed(4)},${g.position.z.toFixed(4)},${g.scale.x.toFixed(4)}`)
    .join(' | ');
  const start = snap();

  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  run(0.1);
  for (let n = 0; n < 4; n++) {
    const slab = gatesByDepth(root.scene)[0].children.find((c) => c.name === 'gatehit');
    ctx.input.raycastFirst = hitOnly(slab);
    ctx._taps.forEach((cb) => cb(10, 10));
    run(3.2);
    assert.equal(gatesByDepth(root.scene).length, 3, `three on the road after slide ${n + 1}`);
  }
  assert.equal(root.fragment().slides, 4);
  assert.equal(snap(), start, 'a full rotation puts the road back exactly where it was');
});

test('a second tap cannot restart a slide that is already running', () => {
  const ctx = fakeCtx({ audio: stubAudio() });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  run(0.1);
  const slab = gatesByDepth(root.scene)[0].children.find((c) => c.name === 'gatehit');
  ctx.input.raycastFirst = hitOnly(slab);

  ctx._taps.forEach((cb) => cb(10, 10));
  run(1.0);
  // past the bell's own 0.5s cooldown, so this tap is a real one and is
  // refused by the SLIDE guard rather than by the bell's
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().slides, 1, 'the road finishes the move it is making');
  run(3.0);
  ctx._taps.forEach((cb) => cb(10, 10));
  assert.equal(root.fragment().slides, 2, 'and moves again once it has arrived');
});

test('the gate waiting behind the reader is not drawn until it starts to move', () => {
  // The road only begins a few units behind the home camera, so "behind the
  // reader" is a couple of metres and not a county. Parked visible, that gate
  // stands in the composition: the walker stops reading as a man between the
  // first barrier and the second, and the orbit swings a huge near gate through
  // frame. (Both of those were caught by the tests above when it was drawn.)
  const ctx = fakeCtx({ audio: stubAudio() });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  const all = [];
  root.scene.traverse((o) => { if (o.name === 'gate') all.push(o); });
  assert.equal(all.length, 4, 'four gates exist');
  assert.equal(all.filter((g) => g.visible).length, 3, 'three of them are drawn');

  const slab = gatesByDepth(root.scene)[0].children.find((c) => c.name === 'gatehit');
  ctx.input.raycastFirst = hitOnly(slab);
  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  run(0.1);
  ctx._taps.forEach((cb) => cb(10, 10));
  run(0.5);
  assert.equal(all.filter((g) => g.visible).length, 4, 'all four are drawn while the road moves');
  run(3.0);
  assert.equal(all.filter((g) => g.visible).length, 3, 'and one is parked again afterwards');
});

test('the scene runs without a renderer or audio, and reports a finite fragment', () => {
  const root = k47.build(fakeCtx());
  root.setCamera(null);
  root.onEnter && root.onEnter();        // audio is null: must not throw
  const ctx2 = fakeCtx();                // taps with no camera set must be safe
  const root2 = k47.build(ctx2);
  ctx2._taps.forEach((cb) => cb(10, 10));
  const f2 = root2.fragment();
  assert.deepEqual({ taps1: f2.taps1, taps2: f2.taps2, taps3: f2.taps3 }, { taps1: 0, taps2: 0, taps3: 0 });
  for (let i = 0; i < 120; i++) root.update(1 / 60, i / 60);
  const frag = root.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const [k, v] of Object.entries(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} = ${v}`);
  }
  root.onExit && root.onExit();
  root.dispose();
});

test('the far barrier dwindles as it goes, and nothing blinks on the way round', () => {
  // TWO FAULTS, both at the ends of the slide, both found by eye.
  //
  // The far gate arrived at the GONE slot still at 0.82 scale, thirty units out
  // — just legible against the paper — and then the wrap took it in one frame,
  // popping out of existence rather than receding. Fog and distance alone were
  // not enough.
  //
  // And the ARRIVING gate blinked out for exactly one frame at the end of the
  // slide. Its position was right the whole time, which is what made it puzzling
  // ("it's in the correct position, so I don't know why"): visibility was
  // written inside the placement loop, which runs BEFORE the slot bookkeeping,
  // so on the single frame a slide ended the arriving gate was still recorded as
  // parked and was hidden — then shown again a frame late.
  const ctx = fakeCtx({ audio: stubAudio() });
  const root = k47.build(ctx);
  root.setCamera(rigCamera());
  const all = [];
  root.scene.traverse((o) => { if (o.name === 'gate') all.push(o); });

  let t = 0;
  const run = (secs) => { for (const end = t + secs; t < end; t += 1 / 60) root.update(1 / 60, t); };
  run(0.1);
  const slab = gatesByDepth(root.scene)[0].children.find((c) => c.name === 'gatehit');
  ctx.input.raycastFirst = hitOnly(slab);

  const far = gatesByDepth(root.scene)[2];      // the one about to walk into the fog
  const startScale = far.scale.x;
  ctx._taps.forEach((cb) => cb(10, 10));

  let smallest = Infinity;
  let fewestDrawn = 4;
  let worstScaleStep = 0;
  let prev = all.map((g) => g.scale.x);
  for (let i = 0; i < 60 * 3.4; i++) {
    run(1 / 60);
    fewestDrawn = Math.min(fewestDrawn, all.filter((g) => g.visible).length);
    smallest = Math.min(smallest, far.scale.x);
    all.forEach((g, k) => { worstScaleStep = Math.max(worstScaleStep, Math.abs(g.scale.x - prev[k])); });
    prev = all.map((g) => g.scale.x);
  }
  assert.ok(smallest < startScale * 0.2, `it dwindles on the way out (${startScale.toFixed(2)} -> ${smallest.toFixed(2)})`);
  // NEVER fewer than three on the road, on any frame of the slide — that is the
  // blink, stated as the thing a reader would actually notice
  assert.equal(fewestDrawn, 3, 'three barriers are drawn on every single frame');
  // the wrap itself is a jump in scale (a speck at one end, full size behind
  // the reader at the other) and is allowed to be: it happens on a gate that is
  // not drawn on either side of it
  assert.ok(worstScaleStep < 1.1, 'and no DRAWN gate changes size by more than it could be seen to');
});
