import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { CASES, slugify } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT, PAPER } from '../src/palette.js';
import { emitterCount } from '../src/audio/engine.js';

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
    bell: rec('bell'), chimeStrike: rec('chime'), knock: rec('knock'),
    drip: rec('drip'), pour: rec('pour'),
    startAmbience: rec('start'), stopAmbience: rec('stop'), setWindLevel: rec('wind'),
    duck: rec('duck'),
  };
};

function fakeCtx(audio = null) {
  const taps = [], hovers = [];
  return {
    audio,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
    },
    _taps: taps, _hovers: hovers,
  };
}

function rigCamera(mod, azimuth = null) {
  const home = { distance: 11.5, target: [1.2, 1.35, 0.3], azimuth: 0.55, polar: 1.27, ...(mod.camera || {}) };
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

// The book is ink on warm paper in all forty-eight cases but one.
const NIGHT_CASE = 28;

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
    const ctx = fakeCtx(null);
    const root = mod.build(ctx);
    for (const fn of ['update', 'dispose', 'fragment', 'setCamera']) {
      assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
    }
    assert.ok(root.scene instanceof THREE.Scene);
    if (entry.id === NIGHT_CASE) {
      // Case 28 is the one case staged after dark, and the only one that goes
      // darker still: Ryutan blows the candle out and the page falls to ink so
      // the stars can come up. The paper pass is multiplicative, so the post
      // spine composites a dark page correctly rather than washing it back.
      const bg = root.scene.background.getHexString();
      assert.notEqual('#' + bg, PAPER.toLowerCase(), 'the night case should not be daylight');
      assert.equal('#' + root.scene.fog.color.getHexString(), '#' + bg,
        'fog must match the page, or the horizon reappears');
    } else {
      assert.equal('#' + root.scene.background.getHexString(), PAPER.toLowerCase(),
        'the page is always paper');
    }
    assert.ok(root.scene.fog, 'nothing may meet a horizon');

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

// Cases whose touch response is purely visual — a petal let go, a tail
// swished, an ink splash, a stack of cloth that refuses to lift. All of them
// were staged before the sound design landed, and none of them has been
// through Frank's ears with a voice attached yet. They are listed rather than
// fixed so the check below stays live for everything staged since.
const SILENT_BY_HISTORY = [1, 2, 5, 6, 14, 23, 37, 38, 40];

test('every staged interaction reaches the audio engine', async () => {
  // A diorama that answers a touch with nothing is a bug we would otherwise
  // only find by ear. Tap everything each case offers and require a sound —
  // tier 3 tableaux are exempt, since their whole point is that nothing
  // answers.
  const silent = [];
  for (const entry of staged) {
    const mod = await loadKoan(entry.slug);
    const audio = STUB_AUDIO();
    const ctx = fakeCtx(audio);
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

// Case 37's pen is built from lattice panels — five bars per panel, two panels
// per side, three sides — and every one of them takes an outline too. It has
// been over budget since it was staged; merging the lattice into one geometry
// is the fix, and it is a real change to a case Frank has already signed off,
// so it is recorded here rather than done in passing.
const OVER_BUDGET_BY_HISTORY = { 37: 190 };

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
