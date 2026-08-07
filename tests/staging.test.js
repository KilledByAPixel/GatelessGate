import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { CASES, slugify } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { DEFAULT_HOME_DISTANCE } from '../src/camera.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT, PAPER } from '../src/palette.js';
import { emitterCount } from '../src/audio/engine.js';
import { fakeCtx } from './helpers/fake-ctx.js';

// THE STAGING NET.
//
// Forty-odd dioramas is more art than any one of them can carry a bespoke test
// for, and bespoke tests are the wrong shape for this anyway: what goes wrong
// at volume is never "the composition is subtly off", it is a typo'd slug, an
// import that was never added, a fūrin hung after addOutlines, a fragment that
// returns an object where the debug panel wants numbers, or a scene that
// quietly allocates four hundred draw calls.
//
// So this builds EVERY staged case, with no audio and no camera, and holds all
// of them to the contract at once. A case that passes here is wired up; whether
// it is beautiful is Frank's call, not the suite's.

const STUB_AUDIO = () => {
  const calls = [];
  const rec = (kind) => (arg) => calls.push([kind, arg]);
  return {
    calls,
    bell: rec('bell'), chimeStrike: rec('chime'), cylinderStrike: rec('cylinder'), knock: rec('knock'),
    drum: rec('drum'), drip: rec('drip'), pour: rec('pour'), rainSurge: rec('rainSurge'),
    // the touch voices: ceramic, wood, cloth, air
    ceramic: rec('ceramic'), wood: rec('wood'), cloth: rec('cloth'), breath: rec('breath'),
    startAmbience: rec('start'), stopAmbience: rec('stop'), setWindLevel: rec('wind'),
    duck: rec('duck'),
  };
};

function rigCamera(mod, azimuth = null) {
  const home = { distance: DEFAULT_HOME_DISTANCE, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27, ...(mod.camera || {}) };
  const cam = new THREE.PerspectiveCamera(38, 1.78, 0.1, 200);
  const [tx, ty, tz] = home.target;
  const az = azimuth === null ? home.azimuth : azimuth;
  const sp = Math.sin(home.polar), cp = Math.cos(home.polar);
  cam.position.set(tx + home.distance * sp * Math.sin(az), ty + home.distance * cp, tz + home.distance * sp * Math.cos(az));
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
  return cam;
}

// THE THREE SILENT CASES. Not an oversight — an editorial choice, pinned in
// each case's own test: the man hanging by his teeth over the drop (5), the
// cat (14), and the top of the hundred-foot pole (46) get wind and nothing
// else. "Silence is right here." Everything else in the book carries the
// drift, and this list is how a NEW case that forgot it still gets caught.
const NO_DRIFT = [5, 14, 46];

// The book is ink on warm paper, with two deliberate exceptions: case 28 goes
// to night (and darker when the candle is blown out), and case 27 experiments
// with a red sky for the scene you erase. Both keep fog matched to the page, so
// nothing meets a horizon. The paper post pass multiplies, so a tinted page
// composites correctly.
const NON_PAPER_SKY = new Set([27, 28]);

const staged = [];
for (const c of CASES) if (isStaged(c.slug)) staged.push(c);

test('there are staged cases to check', () => {
  assert.ok(staged.length >= 17, `only ${staged.length} staged`);
});

for (const entry of staged) {
  test(`case ${entry.id} — ${entry.title}`, async () => {
    const mod = await loadKoan(entry.slug);

    // ---- the module contract -------------------------------------------
    assert.equal(mod.id, entry.id);
    assert.equal(mod.slug, entry.slug,
      `slug must equal slugify(title) — router and deep links go through it`);
    assert.equal(mod.slug, slugify(mod.title));
    assert.equal(mod.title, entry.title);
    assert.ok([ACCENT, ACCENT_DEEP, ACCENT_LIGHT].includes(mod.accent),
      `accent off the palette: ${mod.accent}`);
    assert.ok([0, 1, 2, 3].includes(mod.tier));
    for (const f of ['case', 'comment', 'verse']) {
      assert.ok(mod.text[f] && mod.text[f].trim().length > 0, `text.${f} empty`);
    }

    // ambience is a recipe of strings, and only main.js starts it
    assert.ok(Array.isArray(mod.ambience) && mod.ambience.length > 0, 'no ambience recipe');
    for (const item of mod.ambience) assert.equal(typeof item, 'string');
    if (!NO_DRIFT.includes(mod.id)) {
      assert.ok(mod.ambience.some((s) => s === 'music' || s.startsWith('music:')),
        'every scene carries the drift; the density rule thins it where it should');
    }
    assert.ok(emitterCount(mod.ambience) <= 4, 'more emitters than a quiet book wants');
    if (mod.mood !== undefined) assert.ok(['in', 'yo'].includes(mod.mood), `unknown mood ${mod.mood}`);
    if (mod.camera !== undefined) {
      const c = mod.camera;
      assert.ok(c.distance > 3 && c.distance < 40, `camera distance ${c.distance}`);
      assert.equal(c.target.length, 3);
      assert.ok(c.polar > 0.2 && c.polar < Math.PI - 0.2, `camera polar ${c.polar}`);
    }

    // ---- it builds, with no audio and no camera -------------------------
    const ctx = fakeCtx();
    const root = mod.build(ctx);
    for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
      assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
    }
    assert.ok(root.scene instanceof THREE.Scene);
    assert.ok(root.scene.fog, 'nothing may meet a horizon');
    if (NON_PAPER_SKY.has(entry.id)) {
      const bg = root.scene.background.getHexString();
      assert.notEqual('#' + bg, PAPER.toLowerCase(), 'this case deliberately tints the page');
      assert.equal('#' + root.scene.fog.color.getHexString(), '#' + bg,
        'fog must match the page, or the horizon reappears');
    } else {
      assert.equal('#' + root.scene.background.getHexString(), PAPER.toLowerCase(),
        'the page is always paper');
    }

    // the shared world grammar is present: every case is somewhere
    assert.ok(root.scene.getObjectByName('ground'), 'no ground');

    // ---- it runs -------------------------------------------------------
    root.onEnter && root.onEnter();
    for (let i = 0; i < 240; i++) root.update(1 / 60, i / 60);

    // nothing may go NaN — one bad closed form poisons a whole transform chain
    root.scene.updateMatrixWorld(true);
    let bad = null;
    root.scene.traverse((o) => {
      if (bad) return;
      const p = o.position, s = o.scale, r = o.rotation;
      if (![p.x, p.y, p.z, s.x, s.y, s.z, r.x, r.y, r.z].every(Number.isFinite)) bad = o.name || o.type;
    });
    assert.equal(bad, null, `${bad} has a non-finite transform`);

    // ---- the fragment is debug-panel shaped ------------------------------
    const frag = root.fragment();
    assert.ok(frag && typeof frag === 'object');
    for (const [k, v] of Object.entries(frag)) {
      assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment.${k} is ${v}`);
    }

    // ---- taps are safe before a camera arrives, and with no audio --------
    assert.doesNotThrow(() => ctx._taps.forEach((cb) => cb()), 'a tap before setCamera threw');
    root.setCamera(rigCamera(mod));
    root.update(1 / 60, 4);
    assert.doesNotThrow(() => ctx._taps.forEach((cb) => cb()), 'a tap that hit nothing threw');
    // and a tap that hits EVERYTHING must still be safe with no audio engine
    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null);
    assert.doesNotThrow(() => ctx._taps.forEach((cb) => cb()), 'the interaction needs an audio engine');
    for (let i = 0; i < 120; i++) root.update(1 / 60, 4 + i / 60);

    assert.doesNotThrow(() => { root.onExit && root.onExit(); root.dispose(); });
  });
}

// The two cases that answer a touch with nothing ON PURPOSE, which is a
// different thing from the seven that used to be on this list because no voice
// existed for them yet. The man hanging by his teeth over the drop (5) and the
// cat (14) are the book's two hardest pages, staged through ink metaphor and
// never through literal harm — and a sound effect on either would be the exact
// wrong note. They are also two of the three cases with no drift at all
// (NO_DRIFT, above): "silence is right here."
const SILENT_BY_HISTORY = [5, 14];

test('every staged interaction reaches the audio engine', async () => {
  // A diorama that answers a touch with nothing is a bug we would otherwise
  // only find by ear. Tap everything each case offers and require a sound —
  // tier 3 tableaux are exempt, since their whole point is that nothing
  // answers.
  const silent = [];
  for (const entry of staged) {
    const mod = await loadKoan(entry.slug);
    const audio = STUB_AUDIO();
    const ctx = fakeCtx({ audio });
    const root = mod.build(ctx);
    root.setCamera(rigCamera(mod));
    root.update(1 / 60, 0);
    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null);
    for (let n = 0; n < 3; n++) {
      ctx._taps.forEach((cb) => cb());
      for (let i = 0; i < 60; i++) root.update(1 / 60, n + i / 60);
    }
    if (!audio.calls.length && mod.tier !== 3 && !SILENT_BY_HISTORY.includes(entry.id)) {
      silent.push(entry.id);
    }
  }
  assert.deepEqual(silent, [], `these cases answer a touch with nothing: ${silent}`);
});

test('the two cases silent by editorial choice make no sound at all', async () => {
  // SILENT_BY_HISTORY only SUPPRESSES a failure in the test above — it never
  // asserts anything of its own, so a case could sit on that list without
  // actually staying silent and nothing would catch it. Cases 5 and 14 are
  // the book's two hardest pages, handled through ink metaphor rather than a
  // sound effect; this proves the silence rather than merely excusing it.
  for (const id of SILENT_BY_HISTORY) {
    const entry = staged.find((e) => e.id === id);
    assert.ok(entry, `case ${id} is not staged`);
    const mod = await loadKoan(entry.slug);
    const audio = STUB_AUDIO();
    const ctx = fakeCtx({ audio });
    const root = mod.build(ctx);
    root.setCamera(rigCamera(mod));
    root.update(1 / 60, 0);
    // Without this, a case that lost its tap registration entirely would
    // still pass — zero calls either way — and prove nothing about the
    // editorial silence this test exists to check.
    assert.ok(ctx._taps.length > 0, `case ${id} registered no tap at all`);
    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(), distance: 1 } : null);
    for (let n = 0; n < 3; n++) {
      ctx._taps.forEach((cb) => cb());
      for (let i = 0; i < 60; i++) root.update(1 / 60, n + i / 60);
    }
    assert.deepEqual(audio.calls, [],
      `case ${id} is on SILENT_BY_HISTORY but made a sound: ${JSON.stringify(audio.calls)}`);
  }
});

test('every placed sound carries a position an AudioParam can take', async () => {
  // A NaN reaching an AudioParam throws and kills the whole graph. The engine
  // guards it, but a case that computes a bad position is still a bug — and
  // one that only shows up as silence, which is the hardest kind to notice in
  // a book this quiet.
  const bad = [];
  for (const entry of staged) {
    const mod = await loadKoan(entry.slug);
    const audio = STUB_AUDIO();
    const ctx = fakeCtx({ audio });
    const root = mod.build(ctx);
    root.setCamera(rigCamera(mod));
    root.update(1 / 60, 0);
    ctx.input.raycastFirst = (cam, objs) => (objs && objs.length
      ? { object: objs[0], point: new THREE.Vector3(1, 0.5, -2), distance: 1 } : null);
    for (let n = 0; n < 3; n++) {
      ctx._taps.forEach((cb) => cb());
      for (let i = 0; i < 60; i++) root.update(1 / 60, n + i / 60);
    }
    // STUB_AUDIO records each call as [kind, arg]
    for (const [kind, arg] of audio.calls) {
      const at = arg && arg.at;
      if (at === undefined || at === null) continue;
      if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) {
        bad.push(`${entry.id}:${kind}`);
      }
    }
  }
  assert.deepEqual(bad, [], `these cases place a sound at a non-finite position: ${bad}`);
});

// Case 37's pen used to sit at 185 draws — its lattice was dozens of separate
// bar meshes, each with its own outline. makePen now bakes each wall into one
// merged geometry, so the whole book is under budget with no exceptions.
const OVER_BUDGET_BY_HISTORY = {};

// Accents that are deliberately not a compact thing in the middle distance:
// 24's is the BIRDS (the meadow's blooms went to the kit's pale default when
// Frank ruled petals whitish by default) — a flock circling at altitude that
// crosses the frame rather than sitting in it, so its world positions at t=0
// prove nothing; 27's is the moon,
// sixty units out beyond the mountains; 22's is the PATH, a ground-spanning
// ribbon whose mesh origin is not a meaningful point to project (the road is
// inherently in frame — it is the ground you are looking at). 36 used to be
// here while its master opened far off in the fog; he now opens a stride
// past the traveller, so the ordinary check covers him again — and 34 while
// its path carried the red; the seal moved to the hut (Frank: the house is
// his home), so the ordinary check covers it too.
const ACCENT_NOT_IN_FRAME = [22, 24, 27];

test('the seal of each case is actually in the picture', async () => {
  // Every case puts its one accent on the thing the case turns on. If that
  // object is off the edge at the home angle, the composition is aimed at the
  // wrong place — which is exactly the failure that got case 37 its own camera
  // block and case 47 its rebuilt mountains. Cheap to check across all of them.
  const off = [];
  for (const entry of staged) {
    if (ACCENT_NOT_IN_FRAME.includes(entry.id)) continue;
    const mod = await loadKoan(entry.slug);
    const root = mod.build(fakeCtx());
    root.update(1 / 60, 0);
    root.scene.updateMatrixWorld(true);

    // any of the three mixes counts: the module's `accent` names the koan's
    // hue, and the object itself takes DEEP when it is a large mass or LIGHT
    // when it emits (see the palette's note). Case 29's flag is the seal even
    // though the flag is ACCENT_DEEP and the module declares ACCENT.
    const want = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
      .map((c) => new THREE.Color(c).getHexString()));
    const seals = [];
    root.scene.traverse((o) => {
      if (!o.isMesh || o.userData.isOutline || !o.material || !o.material.color) return;
      if (!want.has(o.material.color.getHexString())) return;
      seals.push(o.getWorldPosition(new THREE.Vector3()));
    });
    if (!seals.length) { off.push([entry.id, 'no accent mesh at all']); continue; }

    const cam = rigCamera(mod);
    const inFrame = seals.some((p) => {
      const v = p.clone().project(cam);
      return v.z > 0 && v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85;
    });
    if (!inFrame) {
      const v = seals[0].clone().project(cam);
      off.push([entry.id, `nearest seal projects to ${v.x.toFixed(2)}, ${v.y.toFixed(2)}`]);
    }
  }
  assert.deepEqual(off, [], `the seal is out of frame: ${JSON.stringify(off)}`);
});

test('no staged scene blows the draw budget', async () => {
  // < 150 draw calls per scene, and outlines double every mesh that takes one.
  // Instanced fields (the meadow) are one call however many blades they carry.
  const over = [];
  for (const entry of staged) {
    const mod = await loadKoan(entry.slug);
    const root = mod.build(fakeCtx());
    let calls = 0;
    root.scene.traverse((o) => {
      if (o.isInstancedMesh || o.isPoints) calls += 1;
      else if (o.isMesh && o.material && o.material.visible !== false) calls += 1;
    });
    const budget = OVER_BUDGET_BY_HISTORY[entry.id] || 150;
    if (calls > budget) over.push([entry.id, calls]);
  }
  assert.deepEqual(over, [], `over budget: ${JSON.stringify(over)}`);
});
