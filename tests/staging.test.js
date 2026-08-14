import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { CASES, slugify } from '../src/koans/index.js';
import { loadKoan, isStaged } from '../src/koans/registry.js';
import { rigCamera as sharedRig } from './helpers/rig-camera.js';
import { ACCENT, ACCENT_DEEP, ACCENT_LIGHT, PAPER } from '../src/palette.js';
import { DRAW_BUDGET } from '../src/budget.js';
import { SUN_PITCH_RANGE } from '../src/render/lights.js';
import { emitterCount } from '../src/audio/engine.js';
import { fakeCtx, hitAll } from './helpers/fake-ctx.js';
import { stubAudio } from './helpers/stub-audio.js';

// THE STAGING NET.
//
// Forty-odd dioramas is more art than any one of them can carry a bespoke test
// for, and bespoke tests are the wrong shape for this anyway: what goes wrong
// at volume is never "the composition is subtly off", it is a typo'd slug, an
// import that was never added, a fragment that returns an object where the
// debug panel wants numbers, or a scene that quietly allocates four hundred
// draw calls.
//
// So this builds EVERY staged case and holds all of them to the contract at
// once. A case that passes here is wired up; whether it is beautiful is a
// judgment call, not the suite's.
//
// TWO BUILDS PER CASE, not seven. The checks that need an audio engine and a
// camera (interaction-reaches-audio, placed-sound positions, seal in frame,
// draw budget, sun aim) used to live in five separate whole-book sweeps at
// the bottom of this file, each rebuilding all 49 cases — ~290 builds for a
// file whose cost is almost entirely builds (~0.7s each; the sweeps were the
// bulk of a 107-second file). Each case's own test now runs both halves on
// two builds: one with no audio and no camera (that absence is itself under
// test), one fully equipped. Only the whole-book judgment (the sun-quadrant
// spread) still reads across cases, at the bottom.

// The net's stub is the shared one WITH the wind bed recorded: case 19's
// touches genuinely answer with the wind level and nothing else — an
// editorial choice — so 'wind' entries must count as "the page answered"
// here. See helpers/stub-audio.js for why everyone else leaves them off.
const STUB_AUDIO = () => stubAudio({ recordLevels: true });

function rigCamera(mod, heading = null) {
  return sharedRig(mod.camera || {},
    { far: 200, ...(heading === null ? {} : { heading }) });
}

// THE THREE DRIFTLESS CASES. Not an oversight — an editorial choice, pinned
// in each case's own test: the man hanging by his teeth over the drop (5),
// the cat (14), and the top of the hundred-foot pole (46) get wind and no
// music drift. "Silence is right here." (Their TOUCHES answer now — see
// SILENT_BY_HISTORY below — but the ambient bed stays bare.) Everything else
// in the book carries the drift, and this list is how a NEW case that forgot
// it still gets caught.
const NO_DRIFT = [5, 14, 46];

// The book is ink on warm paper, with two deliberate exceptions: case 28 goes
// to night (and darker when the candle is blown out), and case 27 experiments
// with a red sky for the scene you erase. Both keep fog matched to the page, so
// nothing meets a horizon. The paper post pass multiplies, so a tinted page
// composites correctly.
const NON_PAPER_SKY = new Set([27, 28]);

// Cases that answer a touch with nothing ON PURPOSE — a different thing from
// the seven that were once here because no voice existed for them yet. The list
// is EMPTY now, and the emptying is the record worth keeping: the cat (14) and
// the hanging man (5) were the last two, the book's two hardest pages, and both
// came off in the interaction audit: a touched thing has to answer. What each
// answers with keeps the reasoning that put it here — the cat gets cloth, a
// brush of fur, and Kyogen a small chime, the least literal voice in the
// palette; neither is an impact, and nothing stages the harm the ink metaphor
// exists to avoid. Both stay on NO_DRIFT above; only the one-shots moved. The
// machinery stays for any future case that needs the silence.
const SILENT_BY_HISTORY = [];

// Case 37's pen used to sit at 185 draws — its lattice was dozens of separate
// bar meshes, each with its own outline. makePen now bakes each wall into one
// merged geometry, so the whole book is under budget with no exceptions.
const OVER_BUDGET_BY_HISTORY = {};

// Accents that are deliberately not a compact thing in the middle distance:
// 24's is the BIRDS (the meadow's blooms went to the kit's pale default when
// petals went whitish by default) — a flock circling at altitude that crosses
// the frame rather than sitting in it, so its world positions at t=0 prove
// nothing; 27's is the moon, sixty units out beyond the mountains — and
// measured while this exemption was being re-checked, it projects to screen y =
// 1.40 at the home framing and is off the edge at ALL 36 headings the orbit can
// reach, because that case pitches 22.4 degrees DOWN where case 19 (whose moon
// is its subject) pitches 8.6. Left as it is: case 27 does not need its moon in
// frame, and the camera is aimed deliberately here. 22's is the PATH, a
// ground-spanning ribbon whose mesh origin is not a meaningful point to project
// (the road is inherently in frame — it is the ground you are looking at). 36
// used to be here while its master opened far off in the fog; he now opens a
// stride past the traveller, so the ordinary check covers him again — and 34
// while its path carried the red; the seal moved to the hut, the home the case
// names, so the ordinary check covers it too.
const ACCENT_NOT_IN_FRAME = [22, 24, 27];

// Case 19 aims its key at its own moon, every frame, and clears the aim record
// to say so (k19.js). Nothing else in the book owns its light outright.
const SUN_OWNED_BY_CASE = [19];

// Every staged case's sun aim, collected by the per-case tests below and
// judged together at the bottom of the file — the spread is a property of the
// BOOK, not of any one case.
const aims = [];

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

    // EVERY CASE NAMES ITS OWN FRAMING. Four cases used to name no `camera:`
    // at all and fall through to DEFAULT_HOME, which meant their shot could
    // only be tuned by moving the whole book, and the Compose panel had
    // nowhere to paste its block back to. (The matter pages are not in
    // `staged` and are deliberately not covered: the afterword renders the
    // hub and must INHERIT its derived gateTarget — see afterword.js.)
    assert.ok(mod.camera, 'no camera: block — it would inherit DEFAULT_HOME');
    {
      const c = mod.camera;
      for (const k of ['distance', 'heading', 'pitch']) {
        assert.ok(Number.isFinite(c[k]), `camera.${k} is ${c[k]}`);
      }
      assert.ok(Array.isArray(c.target) && c.target.length === 3 && c.target.every(Number.isFinite),
        `camera.target is ${JSON.stringify(c.target)}`);
      assert.ok(c.distance > 3 && c.distance < 40, `camera distance ${c.distance}`);
      assert.ok(c.pitch > -78 && c.pitch < 78, `camera pitch ${c.pitch}`);
      // A block still written in the OLD vocabulary would not error — the rig
      // would ignore the unknown keys and quietly frame the case at the stock
      // heading and pitch, which is a composition silently thrown away. The
      // degrees are also an order of magnitude larger than the radians they
      // replaced, so a value left unconverted reads as a wild angle, not a
      // wrong one: pitch 1.27 is very nearly level.
      for (const dead of ['azimuth', 'polar', 'minPolar', 'maxPolar', 'azimuthRange']) {
        assert.equal(c[dead], undefined, `${mod.slug} still names ${dead} — heading/pitch degrees now`);
      }
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
    ctx.input.raycastFirst = hitAll();
    assert.doesNotThrow(() => ctx._taps.forEach((cb) => cb()), 'the interaction needs an audio engine');
    for (let i = 0; i < 120; i++) root.update(1 / 60, 4 + i / 60);

    assert.doesNotThrow(() => { root.onExit && root.onExit(); root.dispose(); });

    // ---- the second build: audio and camera equipped ---------------------
    // Everything from here used to be the five bottom-of-file sweeps — see
    // the header for the arithmetic that moved them.
    const audio = STUB_AUDIO();
    const actx = fakeCtx({ audio });
    const aroot = mod.build(actx);

    // the draw budget, counted straight off the built scene. DRAW_BUDGET
    // (src/budget.js) is the number the workbench readout shows live;
    // instanced fields (the meadow) are one call however many blades.
    let draws = 0;
    aroot.scene.traverse((o) => {
      if (o.isInstancedMesh || o.isPoints) draws += 1;
      else if (o.isMesh && o.material && o.material.visible !== false) draws += 1;
    });
    assert.ok(draws <= (OVER_BUDGET_BY_HISTORY[entry.id] || DRAW_BUDGET),
      `${draws} draw calls blows the budget`);

    aroot.setCamera(rigCamera(mod));
    aroot.update(1 / 60, 0);
    aroot.scene.updateMatrixWorld(true);

    // the seal is actually in the picture. Every case puts its one accent on
    // the thing the case turns on; off the edge at the home angle means the
    // composition is aimed at the wrong place — the failure that got case 37
    // its own camera block and case 47 its rebuilt mountains. Any of the
    // three mixes counts: the module's `accent` names the koan's hue, and
    // the object itself takes DEEP when it is a large mass or LIGHT when it
    // emits (case 29's flag is the seal even though it is ACCENT_DEEP).
    if (!ACCENT_NOT_IN_FRAME.includes(entry.id)) {
      const want = new Set([ACCENT, ACCENT_DEEP, ACCENT_LIGHT]
        .map((c) => new THREE.Color(c).getHexString()));
      const seals = [];
      aroot.scene.traverse((o) => {
        if (!o.isMesh || !o.material || !o.material.color) return;
        if (!want.has(o.material.color.getHexString())) return;
        seals.push(o.getWorldPosition(new THREE.Vector3()));
      });
      assert.ok(seals.length, 'no accent mesh at all');
      const cam = rigCamera(mod);
      const inFrame = seals.some((p) => {
        const v = p.clone().project(cam);
        return v.z > 0 && v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85;
      });
      const v0 = seals[0].clone().project(cam);
      assert.ok(inFrame, `the seal is out of frame: nearest projects to ${v0.x.toFixed(2)}, ${v0.y.toFixed(2)}`);
    }

    // the key stands somewhere a sun could be. The rail is SUN_PITCH_RANGE —
    // the workbench sliders' own range, so a case may ship any aim that can
    // be dialled. This catches a typo or a missing block, not a composition:
    // which way the light comes from is the case's call.
    const sun = aroot.scene.getObjectByProperty('isDirectionalLight', true);
    assert.ok(sun, 'no key light at all');
    assert.ok(sun.position.toArray().every(Number.isFinite), `key at ${sun.position.toArray()}`);
    if (!SUN_OWNED_BY_CASE.includes(entry.id)) {
      const aim = sun.userData.aim;
      assert.ok(aim, 'no sun aim recorded — the workbench cannot drive it');
      assert.ok(aim.pitch >= SUN_PITCH_RANGE[0] && aim.pitch <= SUN_PITCH_RANGE[1],
        `sun pitch ${aim.pitch} is outside the rail`);
      assert.ok(Number.isFinite(aim.heading), `sun heading ${aim.heading}`);
      aims.push(aim);
    }

    // the interaction reaches the audio engine, and every placed sound
    // carries a position an AudioParam can take. A diorama that answers a
    // touch with nothing is a bug we would otherwise only find by ear; a NaN
    // reaching an AudioParam kills the whole graph, and the engine's guard
    // turns it into silence — the hardest failure to notice in a book this
    // quiet. Tier 3 tableaux are exempt from the first half: their whole
    // point is that nothing answers.
    actx.input.raycastFirst = hitAll([1, 0.5, -2]);
    for (let n = 0; n < 3; n++) {
      actx._taps.forEach((cb) => cb());
      for (let i = 0; i < 60; i++) aroot.update(1 / 60, n + i / 60);
    }
    if (mod.tier !== 3 && !SILENT_BY_HISTORY.includes(entry.id)) {
      assert.ok(audio.calls.length, 'the case answers a touch with nothing');
    }
    for (const [kind, arg] of audio.calls) {
      const at = arg && arg.at;
      if (at === undefined || at === null) continue;
      assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z),
        `a ${kind} is placed at a non-finite position`);
    }
    aroot.dispose();
  });
}

test('any case silent by editorial choice makes no sound at all', async () => {
  // SILENT_BY_HISTORY only SUPPRESSES a failure in the per-case test above —
  // it never asserts anything of its own, so a case could sit on that list
  // without actually staying silent and nothing would catch it. This proves
  // the silence rather than merely excusing it. (The list is empty as of the
  // 2026-08 interaction audit — see its comment — so this currently proves a
  // vacuous truth, and stays for the next case that claims the silence.)
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
    ctx.input.raycastFirst = hitAll();
    for (let n = 0; n < 3; n++) {
      ctx._taps.forEach((cb) => cb());
      for (let i = 0; i < 60; i++) root.update(1 / 60, n + i / 60);
    }
    assert.deepEqual(audio.calls, [],
      `case ${id} is on SILENT_BY_HISTORY but made a sound: ${JSON.stringify(audio.calls)}`);
  }
});

// THE BOOK'S LIGHT, judged whole. Each case's own test above proved its key
// stands on the rail and pushed the aim into `aims`; what no single case can
// prove is that the aims are genuinely spread rather than one direction with
// a handful of exceptions — which is what the book was before the lighting
// pass, and what it would silently drift back into one copied block at a
// time. node:test runs this file's tests in declaration order, so every
// per-case test has run (and pushed) before this reads the collection.
test('the key stands in every quarter of the compass, across the book', () => {
  assert.ok(aims.length >= 17, `only ${aims.length} aims collected`);
  const quadrants = new Set(aims.map((a) => Math.floor((((a.heading % 360) + 360) % 360) / 90)));
  assert.equal(quadrants.size, 4, `the key never stands in every quarter: ${[...quadrants]}`);
});
