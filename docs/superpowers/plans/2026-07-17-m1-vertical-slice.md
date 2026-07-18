# M1 Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn The Gateless Gate from an M0 look-dev scene into the M1 interactive book: a skippable gate intro → a table-of-contents menu of all 49 cases → case 29 as a complete book page (ambient two-monk diorama, real text, narration, subtle wind, tap-the-flag wind toggle, meditation timer with a bell), with `read`/`sat` progress persisted to localStorage.

**Architecture:** Build on the merged M0 kit (island/monk/tree/gate/flag/outlines/dissolve/camera/verlet/noise). Add a mode machine (intro/menu/koan/sit) orchestrated by `src/main.js`, a `SceneManager` that swaps roots through the ink dissolve and disposes GPU resources, a lazy koan-module registry, procedural audio (wind + temple bell) and `speechSynthesis` narration, DOM UI (menu, kakemono scroll, sit, onboarding, HUD), and a text pipeline that converts Frank's reference file into a committed data module. Every pure/logic module is Node-tested; DOM/Three/audio runtime code stays thin and is browser-verified in the final task.

**Tech Stack:** Vanilla JS + vendored Three.js r0.185.1, native ES modules, no build step, `node --test`, `http-server` on port 8105.

## Global Constraints

- **No build step.** Native ES modules, relative imports only. Three is imported ONLY as `import * as THREE from '<rel>/lib/three.module.js'` (`../lib/…` from `src/`, `../../lib/…` from `src/*/`).
- **Determinism:** no `Math.random`, `Date.now()`, or wall-clock in `src/` — the SINGLE exception is the rAF timestamp in `src/main.js` pacing the fixed step. **Audio code is exempt** (`src/audio/**` may use `Math.random` for noise buffers and reads `ctx.currentTime`). Simulation advances only in fixed `STEP = 1/60` ticks; `window.gate.step(n)` must be reproducible for non-audio state.
- **Palette (exact):** paper `#F3EDDF`, ink `#1E1E24`, dark gray `#55555E`, light gray `#9A9AA3`, accent `#C73E3A`. Import from `src/palette.js`; never inline these hexes elsewhere (module-local set-dressing tones are the only exception).
- **Progress semantics:** a case is `read` (auto, set when opened) or `sat` (earned, set only when a sit timer *completes* — any preset; `Esc`/early exit never stamps). There is no "done" and no manual toggle.
- **Interactions are never required and never hinted by UI.** Hover reactivity *is* the hint. No cursor changes, no tooltips, no "click me".
- **Narration is `speechSynthesis` only.** No audio files, no runtime WASM TTS. The `speak()` interface stays thin.
- **Tests:** `node --test`, files in `tests/`, no DOM/WebGL/WebAudio required to pass (Three loads in Node; `document`/`AudioContext`/`speechSynthesis` do NOT — keep code touching them out of the tested path).
- **Performance:** `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`; < 150 draw calls per scene; 60 fps desktop target.
- **Commits:** every commit uses two `-m` flags, the second exactly `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Working directory** for all commands: `C:\dev\claude\gateless_gate` (the repo root; `git` and `npm` run from here).
- **Slugs are derived from titles** by a shared `slugify` (lowercase, non-alphanumeric → `-`, trim `-`). Case 29's slug is therefore `not-the-wind-not-the-flag`. The koan module's `slug` field matches its derived slug.

---

### Task 1: Text pipeline — parser, build script, generated artifact

**Files:**
- Create: `scripts/lib/parse-mumonkan.js` (pure parser)
- Create: `scripts/build-text.js` (reads `local/gateless-gate.txt`, writes the artifact)
- Create (generated, committed): `src/koans/text/mumonkan.js`
- Test: `tests/parse-mumonkan.test.js`, `tests/text-artifact.test.js`

**Interfaces:**
- Consumes: `local/gateless-gate.txt` (gitignored, present on disk).
- Produces:
  - `parseMumonkan(text)` → `{ about: string, cases: { [id:number]: { title, case, comment, verse, extra? } } }`. Case headers `^(\d{1,2})\. (.+)$`; case = paragraphs before the `Mumon's comment:`/`Amban's comment:` marker; comment = marker paragraph (label stripped) through the second-to-last paragraph; verse = the last paragraph; front matter before case 1 → `about`; entry 49 gets `extra: true`.
  - `src/koans/text/mumonkan.js`: `export const about = '…'; export default { 1: {…}, …, 49: {…, extra:true} }`.

- [ ] **Step 1: Write the failing parser test**

`tests/parse-mumonkan.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMumonkan } from '../scripts/lib/parse-mumonkan.js';

const FIXTURE = `THE GATELESS GATE

Translated by A and B (1934). Public domain.

1. Joshu's Dog

A monk asked Joshu: "Has a dog Buddha-nature?"

Joshu answered: "Mu."

Mumon's comment: To realize Zen one has to pass the barrier.

More comment here.

Has a dog Buddha-nature? If you say yes or no, you lose it.

2. Hyakujo's Fox

Once Hyakujo lectured and an old man attended.

Mumon's comment: How can this answer make a fox?

The same dice shows two faces.

49. Amban's Addition

Amban, a layman, said something pointed.

Amban's comment: Where did that teaching come from?

When two thieves meet they need no introduction.
`;

test('parses front matter, cases, comment/verse split', () => {
  const { about, cases } = parseMumonkan(FIXTURE);
  assert.match(about, /THE GATELESS GATE/);
  assert.match(about, /Public domain/);
  assert.deepEqual(Object.keys(cases).map(Number).sort((a, b) => a - b), [1, 2, 49]);

  const c1 = cases[1];
  assert.equal(c1.title, "Joshu's Dog");
  assert.match(c1.case, /A monk asked Joshu/);
  assert.match(c1.case, /Joshu answered: "Mu\."/);
  assert.doesNotMatch(c1.case, /Mumon's comment/);
  assert.match(c1.comment, /^To realize Zen/);          // label stripped
  assert.match(c1.comment, /More comment here\./);        // spans paragraphs
  assert.equal(c1.verse, 'Has a dog Buddha-nature? If you say yes or no, you lose it.');
  assert.ok(!c1.extra);
});

test('marks the 49th (Amban) as extra and strips its label', () => {
  const { cases } = parseMumonkan(FIXTURE);
  assert.equal(cases[49].extra, true);
  assert.match(cases[49].comment, /^Where did that teaching/);
  assert.equal(cases[49].verse, 'When two thieves meet they need no introduction.');
});

test('every parsed field is non-empty', () => {
  const { cases } = parseMumonkan(FIXTURE);
  for (const id of Object.keys(cases)) {
    for (const f of ['title', 'case', 'comment', 'verse']) {
      assert.ok(cases[id][f].trim().length > 0, `case ${id} ${f} empty`);
    }
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/parse-mumonkan.test.js`
Expected: FAIL — cannot find module `../scripts/lib/parse-mumonkan.js`.

- [ ] **Step 3: Implement the parser**

`scripts/lib/parse-mumonkan.js`:
```js
// Pure parser for the Senzaki–Reps Gateless Gate plain-text rendering.
// No I/O, no Three, no wall-clock — just string → structured data.

const MARKER = /^(Mumon's comment:|Amban's comment:)\s*/;

export function parseMumonkan(text) {
  const norm = text.replace(/\r\n/g, '\n');
  const headerRe = /^(\d{1,2})\. (.+)$/gm;
  const heads = [];
  let m;
  while ((m = headerRe.exec(norm))) {
    heads.push({ id: Number(m[1]), title: m[2].trim(), start: m.index, headLen: m[0].length });
  }
  if (!heads.length) throw new Error('no case headers found');

  const about = norm.slice(0, heads[0].start).trim();
  const cases = {};
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i];
    const end = i + 1 < heads.length ? heads[i + 1].start : norm.length;
    const body = norm.slice(h.start + h.headLen, end).trim();
    const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const mi = paras.findIndex((p) => MARKER.test(p));
    if (mi === -1) throw new Error(`case ${h.id}: no comment marker`);
    const caseParas = paras.slice(0, mi);
    const commentParas = paras.slice(mi).map((p, k) => (k === 0 ? p.replace(MARKER, '') : p));
    const verse = commentParas.pop() || '';
    const entry = {
      title: h.title,
      case: caseParas.join('\n\n'),
      comment: commentParas.join('\n\n'),
      verse,
    };
    if (h.id === 49) entry.extra = true;
    cases[h.id] = entry;
  }
  return { about, cases };
}
```

- [ ] **Step 4: Run parser test to verify it passes**

Run: `node --test tests/parse-mumonkan.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the build script and generate the artifact**

`scripts/build-text.js`:
```js
// Rerunnable: local/gateless-gate.txt -> src/koans/text/mumonkan.js
// Run: node scripts/build-text.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMumonkan } from './lib/parse-mumonkan.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcTxt = path.join(root, 'local', 'gateless-gate.txt');
const outFile = path.join(root, 'src', 'koans', 'text', 'mumonkan.js');

// Hand-fixes for any case the uniform rules misparse (id -> partial entry). Empty for now.
const OVERRIDES = {};

const raw = fs.readFileSync(srcTxt, 'utf8');
const { about, cases } = parseMumonkan(raw);
for (const [id, patch] of Object.entries(OVERRIDES)) cases[id] = { ...cases[id], ...patch };

const ids = Object.keys(cases).map(Number).sort((a, b) => a - b);
const problems = [];
for (const id of ids) {
  for (const f of ['title', 'case', 'comment', 'verse']) {
    if (!cases[id][f] || !cases[id][f].trim()) problems.push(`case ${id}: empty ${f}`);
  }
}

console.log('id  verse-len  case-len  comment-len  title');
for (const id of ids) {
  const c = cases[id];
  console.log(
    String(id).padStart(2), String(c.verse.length).padStart(9), String(c.case.length).padStart(8),
    String(c.comment.length).padStart(11), ' ', c.title,
  );
}

if (ids.length !== 49) problems.push(`expected 49 entries, got ${ids.length}`);
if (problems.length) {
  console.error('\nBUILD FAILED:\n' + problems.join('\n'));
  process.exit(1);
}

const body = ids.map((id) => `  ${id}: ${JSON.stringify(cases[id])},`).join('\n');
const out = `// GENERATED by scripts/build-text.js from local/gateless-gate.txt — do not edit by hand.
export const about = ${JSON.stringify(about)};
export default {
${body}
};
`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(`\nWrote ${outFile} (${ids.length} cases).`);
```

Run: `node scripts/build-text.js`
Expected: prints the length table, ends with `Wrote …/mumonkan.js (49 cases).`, exit 0.
(If it prints `BUILD FAILED` for some case, that case misparsed — report it as NEEDS_CONTEXT with the offending case ids and the table; do not hand-edit the artifact.)

- [ ] **Step 6: Write the artifact validation test**

`tests/text-artifact.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import TEXT, { about } from '../src/koans/text/mumonkan.js';

test('committed artifact has 49 complete entries', () => {
  const ids = Object.keys(TEXT).map(Number).sort((a, b) => a - b);
  assert.equal(ids.length, 49);
  assert.equal(ids[0], 1);
  assert.equal(ids[48], 49);
  for (const id of ids) {
    for (const f of ['title', 'case', 'comment', 'verse']) {
      assert.ok(TEXT[id][f] && TEXT[id][f].trim().length > 0, `case ${id} ${f} empty`);
    }
  }
  assert.equal(TEXT[49].extra, true);
  assert.ok(about && about.length > 0);
});

test('case 29 is the wind-and-flag koan', () => {
  assert.match(TEXT[29].title, /Flag/i);
});
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS (all M0 tests + the new parser + artifact tests).

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/parse-mumonkan.js scripts/build-text.js src/koans/text/mumonkan.js tests/parse-mumonkan.test.js tests/text-artifact.test.js
git commit -m "feat: text pipeline — parse reference into committed mumonkan data" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Koan index and registry

**Files:**
- Create: `src/koans/index.js`, `src/koans/registry.js`
- Test: `tests/koan-index.test.js`

**Interfaces:**
- Consumes: `src/koans/text/mumonkan.js` (Task 1).
- Produces:
  - `src/koans/index.js`: `slugify(str)`, `CASES` (array of `{ id, slug, title, extra }` for all 49, id-ascending), `byId(id)`, `bySlug(slug)`.
  - `src/koans/registry.js`: `isRegistered(slug)` → boolean, `loadKoan(slug)` → `Promise<module.default | null>`. Loaders keyed by id; only case 29 registered in M1.

- [ ] **Step 1: Write the failing test**

`tests/koan-index.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, byId, bySlug, slugify } from '../src/koans/index.js';
import { isRegistered, loadKoan } from '../src/koans/registry.js';

test('slugify', () => {
  assert.equal(slugify('Not the Wind, Not the Flag'), 'not-the-wind-not-the-flag');
  assert.equal(slugify("Joshu's Dog"), 'joshu-s-dog');
});

test('CASES has 49 unique ids and slugs', () => {
  assert.equal(CASES.length, 49);
  assert.equal(new Set(CASES.map((c) => c.id)).size, 49);
  assert.equal(new Set(CASES.map((c) => c.slug)).size, 49);
  assert.equal(CASES[0].id, 1);
  assert.equal(CASES[48].id, 49);
  assert.equal(CASES[48].extra, true);
});

test('byId / bySlug', () => {
  const c = byId(29);
  assert.equal(c.slug, 'not-the-wind-not-the-flag');
  assert.equal(bySlug(c.slug).id, 29);
  assert.equal(byId(999), null);
  assert.equal(bySlug('nope'), null);
});

test('only case 29 is registered in M1', async () => {
  assert.equal(isRegistered('not-the-wind-not-the-flag'), true);
  assert.equal(isRegistered("joshu-s-dog"), false);
  const mod = await loadKoan('not-the-wind-not-the-flag');
  assert.equal(mod.id, 29);
  assert.equal(await loadKoan('joshu-s-dog'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/koan-index.test.js`
Expected: FAIL — cannot find module `../src/koans/index.js`.

- [ ] **Step 3: Implement index and registry**

`src/koans/index.js`:
```js
import TEXT from './text/mumonkan.js';

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export const CASES = Object.keys(TEXT)
  .map(Number)
  .sort((a, b) => a - b)
  .map((id) => ({ id, slug: slugify(TEXT[id].title), title: TEXT[id].title, extra: !!TEXT[id].extra }));

const BY_ID = new Map(CASES.map((c) => [c.id, c]));
const BY_SLUG = new Map(CASES.map((c) => [c.slug, c]));

export const byId = (id) => BY_ID.get(id) || null;
export const bySlug = (slug) => BY_SLUG.get(slug) || null;
```

`src/koans/registry.js`:
```js
import { bySlug } from './index.js';

// Lazy loaders keyed by numeric id (stable). M1 registers only case 29.
const LOADERS = {
  29: () => import('./k29.js'),
};

export function isRegistered(slug) {
  const c = bySlug(slug);
  return !!(c && LOADERS[c.id]);
}

export async function loadKoan(slug) {
  const c = bySlug(slug);
  const loader = c && LOADERS[c.id];
  if (!loader) return null;
  return (await loader()).default;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/koan-index.test.js`
Expected: the first three tests PASS; the fourth (`loadKoan`) will FAIL to import `./k29.js` (not built until Task 13). To keep the suite green now, TEMPORARILY skip the registration assertion: change the fourth test body to only assert `isRegistered` results and `loadKoan('joshu-s-dog') === null`, and add a comment `// full load verified in Task 13`. Re-run: PASS (all 4).

Replace the fourth test with:
```js
test('registration table (k29 load verified in Task 13)', async () => {
  assert.equal(isRegistered('not-the-wind-not-the-flag'), true);
  assert.equal(isRegistered('joshu-s-dog'), false);
  assert.equal(await loadKoan('joshu-s-dog'), null);
});
```

- [ ] **Step 5: Commit**

```bash
git add src/koans/index.js src/koans/registry.js tests/koan-index.test.js
git commit -m "feat: koan index (49 cases) and lazy registry" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Save state

**Files:**
- Create: `src/save.js`
- Test: `tests/save.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createSave(storage, key = 'gateless-gate-v1')` → `{ state(), markRead(slug), markSat(slug), setSound(on), setOnboarded() }`. `storage` is any `{ getItem(k), setItem(k,v) }`. State shape `{ read:{}, sat:{}, soundOn:true, lastSlug:null, onboarded:false }`. `markRead` also sets `lastSlug`. Corrupt/missing JSON → blank state, no throw.

- [ ] **Step 1: Write the failing test**

`tests/save.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../src/save.js';

function fakeStorage(seed = {}) {
  const d = { ...seed };
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; } };
}

test('blank state when empty', () => {
  const s = createSave(fakeStorage());
  assert.deepEqual(s.state(), { read: {}, sat: {}, soundOn: true, lastSlug: null, onboarded: false });
});

test('markRead sets read + lastSlug and persists', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markRead('wind-flag');
  assert.equal(s.state().read['wind-flag'], true);
  assert.equal(s.state().lastSlug, 'wind-flag');
  const reloaded = createSave(st);
  assert.equal(reloaded.state().read['wind-flag'], true);
  assert.equal(reloaded.state().lastSlug, 'wind-flag');
});

test('markSat, setSound, setOnboarded persist', () => {
  const st = fakeStorage();
  const s = createSave(st);
  s.markSat('wind-flag'); s.setSound(false); s.setOnboarded();
  const r = createSave(st).state();
  assert.equal(r.sat['wind-flag'], true);
  assert.equal(r.soundOn, false);
  assert.equal(r.onboarded, true);
});

test('corrupt JSON falls back to blank', () => {
  const s = createSave(fakeStorage({ 'gateless-gate-v1': '{not json' }));
  assert.deepEqual(s.state().read, {});
  assert.equal(s.state().soundOn, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/save.test.js`
Expected: FAIL — cannot find module `../src/save.js`.

- [ ] **Step 3: Implement save**

`src/save.js`:
```js
// Injectable-storage progress + settings. Pure logic; the browser passes localStorage.

export function createSave(storage, key = 'gateless-gate-v1') {
  const blank = () => ({ read: {}, sat: {}, soundOn: true, lastSlug: null, onboarded: false });
  let state;
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    state = { ...blank(), ...(parsed || {}) };
    state.read = state.read || {};
    state.sat = state.sat || {};
  } catch {
    state = blank();
  }
  const persist = () => { try { storage.setItem(key, JSON.stringify(state)); } catch { /* quota/denied: ignore */ } };
  return {
    state: () => state,
    markRead(slug) { state.read[slug] = true; state.lastSlug = slug; persist(); },
    markSat(slug) { state.sat[slug] = true; persist(); },
    setSound(on) { state.soundOn = !!on; persist(); },
    setOnboarded() { state.onboarded = true; persist(); },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/save.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/save.js tests/save.test.js
git commit -m "feat: localStorage save (read/sat/sound/onboarded)" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Kit facade + monk pointing pose

**Files:**
- Create: `src/kit/index.js`
- Modify: `src/kit/monk.js`
- Test: `tests/kit-monk-pose.test.js`

**Interfaces:**
- Consumes: existing kit builders.
- Produces:
  - `src/kit/index.js` re-exports: `makeIsland, makeMonk, makeTree, makeGate, makeFlag, makeBlobShadow` and (from render) `makeLights, toonMaterial, addOutlines`.
  - `makeMonk({ height, stout, color, hat, pose })` — `pose` defaults `'stand'`; `pose: 'point'` adds a raised arm mesh named `arm`. Default silhouette unchanged (no arm).

- [ ] **Step 1: Write the failing test**

`tests/kit-monk-pose.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeMonk } from '../src/kit/monk.js';
import * as kit from '../src/kit/index.js';

test('default monk has no arm; point pose adds one', () => {
  const stand = makeMonk({});
  assert.equal(stand.children.find((c) => c.name === 'arm'), undefined);
  const point = makeMonk({ pose: 'point' });
  const arm = point.children.find((c) => c.name === 'arm');
  assert.ok(arm, 'point pose must add an arm');
  // arm reaches above the body (raised, gesturing up)
  const box = new THREE.Box3().setFromObject(arm);
  const bodyTop = 1.6 * 0.62;
  assert.ok(box.max.y > bodyTop, `arm should rise above the body top ${bodyTop}, got ${box.max.y}`);
});

test('kit facade re-exports the builders', () => {
  for (const fn of ['makeIsland', 'makeMonk', 'makeTree', 'makeGate', 'makeFlag', 'makeBlobShadow', 'makeLights', 'toonMaterial', 'addOutlines']) {
    assert.equal(typeof kit[fn], 'function', `kit.${fn} missing`);
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/kit-monk-pose.test.js`
Expected: FAIL — cannot find module `../src/kit/index.js`.

- [ ] **Step 3: Add the pose to the monk, create the facade**

In `src/kit/monk.js`, change the signature and append the arm before `return g;`. Replace the whole file with:
```js
import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The kit monk, first pass: capsule body, sphere head, cone hat.
// Featureless by design — ink figures have no faces (a smile is an event).
// pose 'point' raises one arm (used to stage arguments, e.g. case 29).
export function makeMonk({ height = 1.6, stout = 1, color = INK, hat = true, pose = 'stand' } = {}) {
  const g = new THREE.Group();
  g.name = 'monk';
  const mat = toonMaterial({ color });
  const bodyH = height * 0.62;
  const bodyR = 0.16 * height * stout;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyH - bodyR * 2, 4, 12), mat);
  body.name = 'body';
  body.position.y = bodyH / 2;
  const headR = 0.11 * height;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), mat);
  head.name = 'head';
  head.position.y = bodyH + headR * 0.9;
  g.add(body, head);
  if (hat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(headR * 1.9, headR * 1.35, 14), mat);
    cone.name = 'hat';
    cone.position.y = bodyH + headR * 1.85;
    g.add(cone);
  }
  if (pose === 'point') {
    const armLen = height * 0.4;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035 * height, armLen, 3, 8), mat);
    arm.name = 'arm';
    // shoulder near the top of the body, arm angled up-and-forward (+x)
    arm.position.set(bodyR * 0.7, bodyH * 0.86, 0);
    arm.rotation.z = -1.15; // rotate the vertical capsule toward +x and up
    arm.translateY(armLen / 2); // pivot from the shoulder end
    g.add(arm);
  }
  return g;
}
```

`src/kit/index.js`:
```js
// The kit facade: one import surface for koan modules (ctx.kit).
export { makeIsland } from './island.js';
export { makeMonk } from './monk.js';
export { makeTree } from './tree.js';
export { makeGate } from './gate.js';
export { makeFlag } from './flag.js';
export { makeBlobShadow } from '../render/blobshadow.js';
export { makeLights, toonMaterial } from '../render/toon.js';
export { addOutlines } from '../render/outlines.js';
```

- [ ] **Step 4: Run to verify pass, then the full suite**

Run: `node --test tests/kit-monk-pose.test.js` → PASS (2).
Run: `npm test` → PASS (M0 monk tests still green — default monk unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/kit/index.js src/kit/monk.js tests/kit-monk-pose.test.js
git commit -m "feat: kit facade + monk point pose" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Interactive flag (wind level, toggle, hover puff)

**Files:**
- Modify: `src/kit/flag.js`
- Test: `tests/flag-interactive.test.js`

**Interfaces:**
- Consumes: `createCloth`, `stepCloth`, `clothEnergy` from `src/sim/verlet.js`; `noise3`.
- Produces: `makeFlag({...})` now returns `{ group, mesh, update, cloth, setWindTarget(0|1), toggleWind() → boolean, isWindOn() → boolean, windLevel() → number, hoverAt(lx, ly) }`. `windLevel` eases toward the target with ~0.7 s time constant (≈2 s full ramp). Wind forces scale by `windLevel`. `hoverAt(lx, ly)` (cloth-local coords) injects a decaying localized puff (falloff radius ~0.4, ~0.6 s life). `mesh` is the cloth mesh (for raycast/`worldToLocal` in the koan).

- [ ] **Step 1: Write the failing test**

`tests/flag-interactive.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFlag } from '../src/kit/flag.js';
import { clothEnergy } from '../src/sim/verlet.js';

const DT = 1 / 60;
const run = (f, n, t0 = 0) => { for (let i = 1; i <= n; i++) f.update(DT, t0 + i * DT); };

test('wind off settles the cloth; wind on revives it', () => {
  const f = makeFlag({ seed: 11 });
  assert.equal(f.isWindOn(), true);
  f.setWindTarget(0);
  run(f, 240);
  assert.ok(f.windLevel() < 0.05, `windLevel ${f.windLevel()}`);
  const still = clothEnergy(f.cloth);
  assert.ok(still < 0.01, `settled energy ${still}`);
  f.setWindTarget(1);
  run(f, 240, 4);
  assert.ok(f.windLevel() > 0.9, `windLevel ${f.windLevel()}`);
  assert.ok(clothEnergy(f.cloth) > still * 2, 'wind should re-energize the cloth');
});

test('toggleWind flips the target and reports it', () => {
  const f = makeFlag({ seed: 11 });
  assert.equal(f.toggleWind(), false); // was on → now off
  assert.equal(f.isWindOn(), false);
  assert.equal(f.toggleWind(), true);
  assert.equal(f.isWindOn(), true);
});

test('hoverAt injects energy into a still flag', () => {
  const f = makeFlag({ seed: 11 });
  f.setWindTarget(0);
  run(f, 300);
  const before = clothEnergy(f.cloth);
  f.hoverAt(0.75, -0.6); // middle-ish of the cloth (local coords)
  run(f, 8, 5);
  assert.ok(clothEnergy(f.cloth) > before, `hover should stir the cloth: ${before} -> ${clothEnergy(f.cloth)}`);
});

test('cloth mesh is exposed for raycasting', () => {
  const f = makeFlag({});
  assert.ok(f.mesh && f.mesh.name === 'cloth');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/flag-interactive.test.js`
Expected: FAIL — `f.setWindTarget is not a function`.

- [ ] **Step 3: Rewrite the flag with controllable wind + puffs**

Replace `src/kit/flag.js` with:
```js
import * as THREE from '../../lib/three.module.js';
import { createCloth, stepCloth } from '../sim/verlet.js';
import { noise3 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { ACCENT, INK } from '../palette.js';

// Case 29's flag. Wind is a controllable [0..1] level (click toggles it, ~2 s ramp);
// hover injects decaying localized puffs. These behaviors travel with the component.
const WIND_TAU = 0.7;      // ~2 s to full
const PUFF_RADIUS = 0.4;
const PUFF_LIFE = 0.6;

export function makeFlag({ cols = 24, rows = 16, width = 1.5, poleH = 3.4, seed = 11, color = ACCENT } = {}) {
  const group = new THREE.Group();
  group.name = 'flag';

  const poleMat = toonMaterial({ color: INK });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, poleH, 8), poleMat);
  pole.name = 'pole';
  pole.position.y = poleH / 2;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), poleMat);
  finial.name = 'finial';
  finial.position.y = poleH + 0.04;
  group.add(pole, finial);

  const spacing = width / (cols - 1);
  const clothH = (rows - 1) * spacing;
  const cloth = createCloth(cols, rows, spacing, (c, r) => c === 0);

  const geo = new THREE.PlaneGeometry(width, clothH, cols - 1, rows - 1);
  const mesh = new THREE.Mesh(geo, toonMaterial({ color, side: THREE.DoubleSide }));
  mesh.material.fog = false;
  mesh.name = 'cloth';
  mesh.userData.noOutline = true;
  mesh.position.set(0.045, poleH - 0.06, 0);
  group.add(mesh);

  const copyPositions = () => {
    const p = geo.attributes.position;
    for (let i = 0; i < cloth.pins.length; i++) {
      p.setXYZ(i, cloth.positions[i * 3], cloth.positions[i * 3 + 1], cloth.positions[i * 3 + 2]);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  copyPositions();

  let windTarget = 1;
  let windLevel = 1;
  const puffs = []; // { x, y, age }

  const update = (dt, simTime) => {
    windLevel += (windTarget - windLevel) * (1 - Math.exp(-dt / WIND_TAU));
    for (const pf of puffs) pf.age += dt;
    while (puffs.length && puffs[0].age > PUFF_LIFE) puffs.shift();
    const t = simTime * 0.9;
    stepCloth(cloth, dt, {
      gravity: [0, -3.5, 0],
      iterations: 4,
      damping: 0.99,
      force: (x, y, z, i) => {
        const gust = (1.8 + 3.4 * noise3(x * 0.5 + t, y * 0.5, t * 0.8, seed)) * windLevel;
        const flap = (noise3(x * 1.3, y * 1.3 + t * 1.4, t * 1.2, seed + 4) - 0.5) * 7.0 * windLevel;
        const lift = (noise3(x * 0.7 + 9, t * 0.6, y * 0.7, seed + 9) - 0.5) * 2.0 * windLevel;
        let pz = 0, py = 0;
        for (const pf of puffs) {
          const dx = x - pf.x, dy = y - pf.y;
          const fall = Math.exp(-(dx * dx + dy * dy) / (PUFF_RADIUS * PUFF_RADIUS)) * (1 - pf.age / PUFF_LIFE);
          pz += fall * 6.0;
          py += fall * 1.5;
        }
        return [gust, lift + py, flap + pz];
      },
    });
    copyPositions();
  };

  return {
    group,
    mesh,
    cloth,
    update,
    setWindTarget(v) { windTarget = v ? 1 : 0; },
    toggleWind() { windTarget = windTarget < 0.5 ? 1 : 0; return windTarget >= 0.5; },
    isWindOn() { return windTarget >= 0.5; },
    windLevel() { return windLevel; },
    hoverAt(lx, ly) { puffs.push({ x: lx, y: ly, age: 0 }); if (puffs.length > 8) puffs.shift(); },
  };
}
```

- [ ] **Step 4: Run to verify pass, then the full suite**

Run: `node --test tests/flag-interactive.test.js` → PASS (4).
Run: `npm test`. The M0 `tests/flag.test.js` determinism test may still pass (default wind on, same forces × windLevel≈1). If its exact-equality assertion now drifts because `windLevel` starts at 1 and eases (staying 1 when target is 1), it remains bit-identical. Expected: PASS. If M0 flag.test.js fails on the vertex-count/structure assertions, they are unchanged so it will pass.

- [ ] **Step 5: Commit**

```bash
git add src/kit/flag.js tests/flag-interactive.test.js
git commit -m "feat: interactive flag — wind level, click toggle, hover puff" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Audio — synth tables, engine, narration

**Files:**
- Create: `src/audio/synths.js`, `src/audio/engine.js`, `src/audio/narration.js`
- Test: `tests/audio.test.js`

**Interfaces:**
- Consumes: `src/save.js` (engine reads/writes soundOn).
- Produces (pure, tested): `windParams(level)` → `{ gain, cutoff, lfoDepth }` (monotonic in level); `bellPartials(f0)` → array of `{ freq, amp, decay }`; `parseRecipe(str)` → `{ type, level }`; `chunkSentences(text)` → string[].
- Produces (browser, untested): `makeWind(ctx, dest)` → `{ setLevel(v), stop() }`; `strikeBell(ctx, dest, { f0, gain })`; `createAudio(save)` → `{ ctx, master, unlock(), setSound(on), startAmbience(recipe), stopAmbience(), setWindLevel(v), bell(opts), playMusic(), stopMusic(), musicVolume(v) }`; `createNarration()` → `{ speak(text, {rate, onEnd, onSection}), stop() }`.

- [ ] **Step 1: Write the failing test**

`tests/audio.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windParams, bellPartials } from '../src/audio/synths.js';
import { parseRecipe } from '../src/audio/engine.js';
import { chunkSentences } from '../src/audio/narration.js';

test('windParams monotonic and bounded', () => {
  const lo = windParams(0), hi = windParams(1);
  assert.ok(hi.gain > lo.gain && hi.cutoff > lo.cutoff);
  assert.ok(lo.gain >= 0 && hi.gain <= 1);
  const mid = windParams(0.5);
  assert.ok(mid.gain > lo.gain && mid.gain < hi.gain);
  assert.deepEqual(windParams(2), windParams(1)); // clamps
});

test('bellPartials are inharmonic and decaying', () => {
  const p = bellPartials(62);
  assert.ok(p.length >= 4);
  assert.equal(p[0].freq, 62 * p[0].ratioCheck ?? p[0].freq); // freq derived from f0
  for (const x of p) {
    assert.ok(x.freq > 0 && x.amp > 0 && x.decay > 0);
  }
  // not a pure harmonic stack (some ratio is non-integer)
  const ratios = p.map((x) => x.freq / 62);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05));
});

test('parseRecipe', () => {
  assert.deepEqual(parseRecipe('wind:0.25'), { type: 'wind', level: 0.25 });
  assert.deepEqual(parseRecipe('wind'), { type: 'wind', level: 1 });
});

test('chunkSentences splits on sentence boundaries', () => {
  const out = chunkSentences('A monk asked Joshu. Joshu answered: "Mu." Is that all?');
  assert.equal(out.length, 3);
  assert.match(out[0], /^A monk asked Joshu\.$/);
  assert.match(out[2], /Is that all\?$/);
  assert.deepEqual(chunkSentences('   '), []);
});
```

Note: fix the bellPartials test's first assertion — replace the `ratioCheck` line with a plain check:
```js
  assert.ok(p[0].freq > 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/audio.test.js`
Expected: FAIL — cannot find module `../src/audio/synths.js`.

- [ ] **Step 3: Implement synths, engine, narration**

`src/audio/synths.js`:
```js
// Procedural voices. Pure param tables are tested; the node builders are browser-only.
// (Audio is exempt from the determinism rule — Math.random for noise is fine here.)

export function windParams(level) {
  const l = Math.max(0, Math.min(1, level));
  return { gain: 0.08 + 0.22 * l, cutoff: 400 + 1000 * l, lfoDepth: 0.3 + 0.5 * l };
}

export function bellPartials(f0 = 62) {
  return [
    [1.0, 1.0, 10], [1.5, 0.6, 8], [2.0, 0.45, 6], [2.66, 0.3, 4.5],
    [3.01, 0.22, 3], [4.13, 0.14, 2],
  ].map(([r, a, d]) => ({ freq: f0 * r, amp: a, decay: d }));
}

export function makeWind(ctx, dest) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(dest); src.start();
  return {
    setLevel(v) {
      const p = windParams(v);
      g.gain.setTargetAtTime(p.gain, ctx.currentTime, 0.3);
      lp.frequency.setTargetAtTime(p.cutoff, ctx.currentTime, 0.3);
    },
    stop() { try { src.stop(); } catch { /* already stopped */ } g.disconnect(); },
  };
}

export function strikeBell(ctx, dest, { f0 = 62, gain = 1 } = {}) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  for (const p of bellPartials(f0)) {
    for (const det of [-0.35, 0.35]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq + det;
      const g = ctx.createGain();
      const peak = (p.amp * 0.11) / 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.015);
      g.gain.exponentialRampToValueAtTime(peak * 0.001, t + p.decay);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + p.decay + 0.1);
    }
  }
  const dur = 0.08;
  const nb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
  const nsrc = ctx.createBufferSource(); nsrc.buffer = nb;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 1.2;
  const ng = ctx.createGain(); ng.gain.value = 0.25;
  nsrc.connect(bp); bp.connect(ng); ng.connect(out);
  nsrc.start(t);
}
```

`src/audio/engine.js`:
```js
import { makeWind, strikeBell } from './synths.js';

export function parseRecipe(str) {
  const [type, arg] = str.split(':');
  return { type, level: arg !== undefined ? parseFloat(arg) : 1 };
}

// Browser-only. `save` is a createSave() instance.
export function createAudio(save) {
  let ctx = null, master = null, music = null, musicGain = null;
  let wind = null;
  let soundOn = save.state().soundOn;

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = soundOn ? 0.8 : 0;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
  }

  return {
    get ctx() { return ctx; },
    get master() { return master; },
    unlock() { ensureCtx(); if (ctx.state !== 'running') ctx.resume(); },
    setSound(on) {
      soundOn = !!on;
      save.setSound(soundOn);
      if (master) master.gain.setTargetAtTime(soundOn ? 0.8 : 0, ctx.currentTime, 0.05);
    },
    isSoundOn() { return soundOn; },
    startAmbience(recipe = []) {
      ensureCtx();
      for (const item of recipe) {
        const { type, level } = parseRecipe(item);
        if (type === 'wind' && !wind) { wind = makeWind(ctx, master); wind.setLevel(level); }
      }
    },
    setWindLevel(v) { if (wind) wind.setLevel(v); },
    stopAmbience() { if (wind) { wind.stop(); wind = null; } },
    bell(opts = {}) { ensureCtx(); strikeBell(ctx, master, opts); },
    playMusic() { /* stub: ambient generated tracks are a future experiment */ },
    stopMusic() { if (music) { try { music.stop(); } catch {} music = null; } },
    musicVolume(v) { if (musicGain) musicGain.gain.value = v; },
  };
}
```

`src/audio/narration.js`:
```js
export function chunkSentences(text) {
  const m = String(text).replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g);
  return m ? m.map((s) => s.trim()).filter(Boolean) : [];
}

// Browser-only speechSynthesis wrapper. Sentence-chunked to dodge Chrome's
// long-utterance stall. Never a stopgap — this is the narration plan.
export function createNarration() {
  const synth = window.speechSynthesis;
  let queue = [];
  let speaking = false;

  function next(onEnd) {
    if (!queue.length) { speaking = false; onEnd && onEnd(); return; }
    const { text, rate } = queue.shift();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.onend = () => next(onEnd);
    u.onerror = () => next(onEnd);
    synth.speak(u);
  }

  return {
    speak(text, { rate = 0.85, onEnd } = {}) {
      synth.cancel();
      queue = chunkSentences(text).map((t) => ({ text: t, rate }));
      speaking = true;
      next(onEnd);
    },
    stop() { queue = []; speaking = false; synth.cancel(); },
    isSpeaking() { return speaking; },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/audio.test.js` → PASS (4).

- [ ] **Step 5: Commit**

```bash
git add src/audio/synths.js src/audio/engine.js src/audio/narration.js tests/audio.test.js
git commit -m "feat: procedural audio (wind + bell) and speechSynthesis narration" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: SceneManager + disposal

**Files:**
- Create: `src/scene/manager.js`
- Modify: `src/render/toon.js` (mark the shared ramp)
- Test: `tests/scene-manager.test.js`

**Interfaces:**
- Consumes: `makeDissolve()` (M0), Three.
- Produces:
  - In `toon.js`: `toonRamp()` sets `ramp.userData = { shared: true }`.
  - `disposeRoot(root, disposed = new Set())` → `{ geometries, materials, textures }` counts; disposes each mesh's geometry + material + material own-textures (`map`/`gradientMap`/`alphaMap`) EXCEPT any texture with `userData.shared`; guards double-dispose via the `disposed` Set (also usable to inspect membership).
  - `makeSceneManager(renderer, dissolve)` → `{ setActive(root), async swapTo(root, { disposePrev = true, dur = 0.8 }), active(), render(camera) }`. A `root` is `{ scene, update(dt, simTime), dispose(), fragment?() }`. `render(camera)` renders the active scene, then overlays the dissolve quad when `dissolve.t < 1`.

- [ ] **Step 1: Write the failing test**

`tests/scene-manager.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { disposeRoot } from '../src/scene/manager.js';
import { makeIsland } from '../src/kit/island.js';
import { makeBlobShadow } from '../src/render/blobshadow.js';
import { toonRamp } from '../src/render/toon.js';

test('shared ramp is flagged', () => {
  assert.equal(toonRamp().userData.shared, true);
});

test('disposeRoot frees geometry + own textures but not the shared ramp', () => {
  const scene = new THREE.Scene();
  scene.add(makeIsland({ radius: 4, seed: 1 }));      // toon material -> shared gradientMap
  scene.add(makeBlobShadow({ radiusX: 1, radiusZ: 1 })); // own DataTexture (map)
  const disposed = new Set();
  const counts = disposeRoot({ scene }, disposed);
  assert.ok(counts.geometries >= 2, `geometries ${counts.geometries}`);
  assert.ok(counts.textures >= 1, `expected the blob texture disposed, got ${counts.textures}`);
  assert.equal(disposed.has(toonRamp().id), false, 'shared ramp must not be disposed');
});

test('disposeRoot does not double-dispose shared geometry', () => {
  // two meshes sharing one geometry (like an outline shell)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const a = new THREE.Mesh(geo, mat), b = new THREE.Mesh(geo, mat);
  const scene = new THREE.Scene(); scene.add(a, b);
  const counts = disposeRoot({ scene });
  assert.equal(counts.geometries, 1, 'shared geometry disposed once');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/scene-manager.test.js`
Expected: FAIL — cannot find module `../src/scene/manager.js`.

- [ ] **Step 3: Mark the ramp, implement the manager**

In `src/render/toon.js`, inside `toonRamp()` after `ramp.needsUpdate = true;` add:
```js
    ramp.userData = { shared: true };
```

`src/scene/manager.js`:
```js
import * as THREE from '../../lib/three.module.js';

function disposeMaterial(mat, disposed, counts) {
  for (const key of ['map', 'gradientMap', 'alphaMap']) {
    const tex = mat[key];
    if (tex && !tex.userData?.shared && !disposed.has(tex.id)) {
      disposed.add(tex.id); tex.dispose(); counts.textures++;
    }
  }
  if (!disposed.has(mat.id)) { disposed.add(mat.id); mat.dispose(); counts.materials++; }
}

export function disposeRoot(root, disposed = new Set()) {
  const counts = { geometries: 0, materials: 0, textures: 0 };
  root.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry && !disposed.has(o.geometry.id)) {
      disposed.add(o.geometry.id); o.geometry.dispose(); counts.geometries++;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m) disposeMaterial(m, disposed, counts);
  });
  return counts;
}

export function makeSceneManager(renderer, dissolve) {
  const dissolveScene = new THREE.Scene();
  dissolveScene.add(dissolve.mesh);
  let current = null;

  function render(camera) {
    if (current) renderer.render(current.scene, camera);
    if (dissolve.t < 1) {
      renderer.autoClear = false;
      renderer.render(dissolveScene, camera);
      renderer.autoClear = true;
    }
  }

  return {
    setActive(root) { current = root; },
    active() { return current; },
    render,
    async swapTo(root, { disposePrev = true, dur = 0.8 } = {}) {
      await dissolve.dissolveOut(dur);       // cover with paper
      const prev = current;
      current = root;
      if (prev && disposePrev) { disposeRoot(prev); prev.dispose && prev.dispose(); }
      await dissolve.dissolveIn(dur);        // reveal the new root
    },
  };
}
```

- [ ] **Step 4: Run to verify pass, then full suite**

Run: `node --test tests/scene-manager.test.js` → PASS (3).
Run: `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/manager.js src/render/toon.js tests/scene-manager.test.js
git commit -m "feat: SceneManager with root disposal and shared-ramp exemption" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Input (tap + hover raycast helper)

**Files:**
- Create: `src/input.js`
- Test: `tests/input.test.js`

**Interfaces:**
- Consumes: Three (for `Raycaster`/`Vector2`), a DOM-ish `el` (tests pass a fake with `addEventListener`, `clientWidth`, `clientHeight`, `getBoundingClientRect`).
- Produces: `isTap(down, up, maxDrift = 6)` (pure) → boolean; `makeInput(el)` → `{ onTap(cb), onHover(cb), pointer(), raycastFirst(camera, objects) → hit|null, dispose() }`. `onTap` fires `cb(clientX, clientY)` on pointerdown→up with < 6 px drift. `onHover` fires `cb(clientX, clientY)` on pointermove. `pointer()` returns the last NDC `{ x, y }`.

- [ ] **Step 1: Write the failing test**

`tests/input.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTap, makeInput } from '../src/input.js';

test('isTap: small drift is a tap, large is not', () => {
  assert.equal(isTap({ x: 100, y: 100 }, { x: 103, y: 101 }), true);
  assert.equal(isTap({ x: 100, y: 100 }, { x: 140, y: 100 }), false);
});

function fakeEl() {
  const h = {};
  return {
    h,
    clientWidth: 800, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: (t, fn) => { h[t] = fn; },
    removeEventListener: (t) => { delete h[t]; },
  };
}

test('onTap fires only for low-drift press/release', () => {
  const el = fakeEl();
  const input = makeInput(el);
  let taps = 0;
  input.onTap(() => { taps++; });
  el.h.pointerdown({ clientX: 200, clientY: 200 });
  el.h.pointerup({ clientX: 202, clientY: 201 });
  assert.equal(taps, 1);
  el.h.pointerdown({ clientX: 200, clientY: 200 });
  el.h.pointerup({ clientX: 260, clientY: 200 });
  assert.equal(taps, 1, 'drag is not a tap');
});

test('onHover updates NDC pointer', () => {
  const el = fakeEl();
  const input = makeInput(el);
  let seen = 0;
  input.onHover(() => { seen++; });
  el.h.pointermove({ clientX: 400, clientY: 300 });
  assert.equal(seen, 1);
  const p = input.pointer();
  assert.ok(Math.abs(p.x) < 0.01 && Math.abs(p.y) < 0.01, `center NDC ~0,0 got ${p.x},${p.y}`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/input.test.js`
Expected: FAIL — cannot find module `../src/input.js`.

- [ ] **Step 3: Implement input**

`src/input.js`:
```js
import * as THREE from '../lib/three.module.js';

export function isTap(down, up, maxDrift = 6) {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxDrift;
}

export function makeInput(el) {
  const tapCbs = [];
  const hoverCbs = [];
  const ndc = new THREE.Vector2(0, 0);
  const ray = new THREE.Raycaster();
  let down = null;

  const toNdc = (cx, cy) => {
    const r = el.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
  };

  const onDown = (e) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e) => {
    if (down && isTap(down, { x: e.clientX, y: e.clientY })) {
      for (const cb of tapCbs) cb(e.clientX, e.clientY);
    }
    down = null;
  };
  const onMove = (e) => { toNdc(e.clientX, e.clientY); for (const cb of hoverCbs) cb(e.clientX, e.clientY); };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointermove', onMove);

  return {
    onTap(cb) { tapCbs.push(cb); },
    onHover(cb) { hoverCbs.push(cb); },
    pointer() { return { x: ndc.x, y: ndc.y }; },
    raycastFirst(camera, objects) {
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(objects, false);
      return hits.length ? hits[0] : null;
    },
    dispose() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointermove', onMove);
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/input.test.js` → PASS (3).

- [ ] **Step 5: Commit**

```bash
git add src/input.js tests/input.test.js
git commit -m "feat: input — tap detection + hover NDC + raycast helper" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Intro rails + hub scene

**Files:**
- Create: `src/intro_rails.js`, `src/intro.js`
- Test: `tests/intro-rails.test.js`

**Interfaces:**
- Consumes: kit facade, Three, palette.
- Produces:
  - `src/intro_rails.js` (pure): `catmullRom(p0,p1,p2,p3,t)` → `[x,y,z]`; `samplePath(points, u)` → `[x,y,z]` (u clamped [0,1], endpoints exact); `INTRO_POINTS`; `introPath(u)` → `{ pos:[x,y,z], look:[x,y,z] }`.
  - `src/intro.js`: `buildHub()` → root `{ scene, update(dt, simTime), dispose() }` (island + hero gate + fog + lights + outlines — a calm backdrop). `makeIntro(camera, { onDone })` → `{ update(dt), skip(), done }` — advances `u` 0→1 over ~7 s driving the camera along `introPath`; fades a DOM title; `skip()` jumps to done and calls `onDone`; natural completion also calls `onDone`. Sound prompt DOM is created here with `[Yes]`/`[Not now]` that call `onSound(true/false)` (passed in options).

- [ ] **Step 1: Write the failing rails test**

`tests/intro-rails.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { samplePath, introPath, INTRO_POINTS } from '../src/intro_rails.js';

test('endpoints are exact, path is continuous', () => {
  const a = samplePath(INTRO_POINTS, 0);
  const b = samplePath(INTRO_POINTS, 1);
  assert.deepEqual(a, INTRO_POINTS[0]);
  assert.deepEqual(b, INTRO_POINTS[INTRO_POINTS.length - 1]);
  let prev = samplePath(INTRO_POINTS, 0);
  for (let i = 1; i <= 100; i++) {
    const p = samplePath(INTRO_POINTS, i / 100);
    assert.ok(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) < 1.0, `jump at ${i}`);
    prev = p;
  }
});

test('u clamps outside [0,1]', () => {
  assert.deepEqual(samplePath(INTRO_POINTS, -5), INTRO_POINTS[0]);
  assert.deepEqual(samplePath(INTRO_POINTS, 9), INTRO_POINTS[INTRO_POINTS.length - 1]);
});

test('introPath look leads the position toward the gate', () => {
  const { pos, look } = introPath(0.2);
  assert.ok(look[2] < pos[2], 'look should be further along (smaller z) than pos');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/intro-rails.test.js`
Expected: FAIL — cannot find module `../src/intro_rails.js`.

- [ ] **Step 3: Implement rails and intro**

`src/intro_rails.js`:
```js
// Pure Catmull-Rom dolly path for the intro. No Three, no wall-clock.

export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return p1.map((_, k) =>
    0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
      + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
      + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
}

export function samplePath(points, u) {
  const n = points.length - 1;
  const uu = Math.max(0, Math.min(1, u)) * n;
  const i = Math.min(Math.floor(uu), n - 1);
  const t = uu - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n, i + 2)];
  return catmullRom(p0, p1, p2, p3, t);
}

export const INTRO_POINTS = [
  [0, 1.6, 14],
  [0, 1.5, 7],
  [0.3, 1.5, 1.5],
  [0.6, 1.4, -3],
];

export function introPath(u) {
  return { pos: samplePath(INTRO_POINTS, u), look: samplePath(INTRO_POINTS, Math.min(1, u + 0.06)) };
}
```

`src/intro.js`:
```js
import * as THREE from '../lib/three.module.js';
import { PAPER } from './palette.js';
import { makeIsland, makeGate, makeLights, addOutlines, makeBlobShadow } from './kit/index.js';
import { introPath } from './intro_rails.js';

// The book's cover backdrop: also the menu's idling scene.
export function buildHub() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.05);
  scene.add(makeLights());
  scene.add(makeIsland({ radius: 8, seed: 7 }));

  const gate = makeGate({ width: 3.0, height: 3.4 });
  gate.position.set(0, 0, -1);
  scene.add(gate);
  const sh = makeBlobShadow({ radiusX: 2.2, radiusZ: 0.9, opacity: 0.3 });
  sh.position.set(0, 0, -1);
  scene.add(sh);

  addOutlines(scene, { width: 0.035, wobble: 0.7 });
  return { scene, update() {}, dispose() {} };
}

const INTRO_SECONDS = 7;

// camera is a THREE.PerspectiveCamera. Options: onDone(), onSound(bool).
export function makeIntro(camera, { onDone, onSound } = {}) {
  let u = 0, done = false;

  const title = document.createElement('div');
  title.className = 'gg-title';
  title.textContent = 'The Gateless Gate';
  document.body.appendChild(title);

  const card = document.createElement('div');
  card.className = 'gg-sound-card';
  card.innerHTML = '<p>Sound on?</p><button data-yes>Yes</button><button data-no>Not now</button>';
  document.body.appendChild(card);
  card.querySelector('[data-yes]').onclick = () => { onSound && onSound(true); card.remove(); };
  card.querySelector('[data-no]').onclick = () => { onSound && onSound(false); card.remove(); };

  function apply() {
    const { pos, look } = introPath(u);
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
    title.style.opacity = String(Math.max(0, 1 - Math.abs(u - 0.4) * 2.2)); // peak near the gate
  }
  apply();

  function finish() {
    if (done) return;
    done = true;
    title.remove();
    card.remove();
    onDone && onDone();
  }

  return {
    get done() { return done; },
    update(dt) {
      if (done) return;
      u = Math.min(1, u + dt / INTRO_SECONDS);
      apply();
      if (u >= 1) finish();
    },
    skip() { finish(); },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/intro-rails.test.js` → PASS (3).
Run: `node --check src/intro.js` (browser module; syntax-check only) → no output = OK.

- [ ] **Step 5: Commit**

```bash
git add src/intro_rails.js src/intro.js tests/intro-rails.test.js
git commit -m "feat: intro dolly rails + hub backdrop scene" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Scroll UI (kakemono)

**Files:**
- Create: `src/ui/scroll_state.js`, `src/ui/scroll.js`, `src/ui/styles.css`
- Modify: `index.html` (link the stylesheet)
- Test: `tests/scroll-state.test.js`

**Interfaces:**
- Consumes: palette (via CSS), `src/audio/narration.js` conceptually (wired by the koan; scroll only emits events).
- Produces:
  - `src/ui/scroll_state.js` (pure): `SECTIONS = ['case','comment','verse']`; `narrationQueue(text)` → ordered non-empty section keys; `LABELS` map.
  - `src/ui/scroll.js`: `makeScroll({ id, title, text, accent, onSpeak, onSpeakAll })` → `{ el, tuck(), untuck(), isTucked(), highlight(section|null), dispose() }`. DOM kakemono; per-section speak buttons call `onSpeak(sectionKey)`; master play calls `onSpeakAll()`; tuck toggle collapses to a seal tab.
  - `src/ui/styles.css`: base book typography + the classes used by scroll/menu/intro/hud/onboarding/sit.

- [ ] **Step 1: Write the failing state test**

`tests/scroll-state.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SECTIONS, narrationQueue } from '../src/ui/scroll_state.js';

test('sections are case, comment, verse in order', () => {
  assert.deepEqual(SECTIONS, ['case', 'comment', 'verse']);
});

test('narrationQueue skips empty sections, keeps order', () => {
  assert.deepEqual(narrationQueue({ case: 'a', comment: 'b', verse: 'c' }), ['case', 'comment', 'verse']);
  assert.deepEqual(narrationQueue({ case: 'a', comment: '  ', verse: 'c' }), ['case', 'verse']);
  assert.deepEqual(narrationQueue({ case: '', comment: '', verse: '' }), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/scroll-state.test.js`
Expected: FAIL — cannot find module `../src/ui/scroll_state.js`.

- [ ] **Step 3: Implement state, DOM, and CSS**

`src/ui/scroll_state.js`:
```js
export const SECTIONS = ['case', 'comment', 'verse'];
export const LABELS = { case: 'The Case', comment: "Mumon's Comment", verse: 'The Verse' };

export function narrationQueue(text) {
  return SECTIONS.filter((s) => text[s] && text[s].trim().length > 0);
}
```

`src/ui/scroll.js`:
```js
import { SECTIONS, LABELS, narrationQueue } from './scroll_state.js';

// The hanging-scroll (kakemono) text panel. DOM only; narration is wired by the koan.
export function makeScroll({ id, title, text, accent = '#C73E3A', onSpeak, onSpeakAll } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-scroll';
  el.style.setProperty('--accent', accent);

  const tab = document.createElement('button');
  tab.className = 'gg-scroll-tab';
  tab.textContent = String(id);
  el.appendChild(tab);

  const body = document.createElement('div');
  body.className = 'gg-scroll-body';
  el.appendChild(body);

  const head = document.createElement('div');
  head.className = 'gg-scroll-head';
  head.innerHTML = `<span class="gg-seal">${id}</span><h2>${title}</h2>`;
  const playAll = document.createElement('button');
  playAll.className = 'gg-play-all';
  playAll.textContent = '▶ Read aloud';
  playAll.onclick = () => onSpeakAll && onSpeakAll();
  head.appendChild(playAll);
  body.appendChild(head);

  const sectionEls = {};
  for (const key of SECTIONS) {
    if (!text[key] || !text[key].trim()) continue;
    const sec = document.createElement('section');
    sec.className = 'gg-section';
    sec.dataset.section = key;
    const label = document.createElement('div');
    label.className = 'gg-section-label';
    label.textContent = LABELS[key];
    const speak = document.createElement('button');
    speak.className = 'gg-speak';
    speak.textContent = '♪';
    speak.title = 'Read this section';
    speak.onclick = () => onSpeak && onSpeak(key);
    label.appendChild(speak);
    const p = document.createElement('div');
    p.className = 'gg-section-text';
    p.textContent = text[key];
    sec.appendChild(label);
    sec.appendChild(p);
    body.appendChild(sec);
    sectionEls[key] = sec;
  }

  let tucked = false;
  const setTucked = (v) => { tucked = v; el.classList.toggle('tucked', tucked); };
  tab.onclick = () => setTucked(!tucked);

  return {
    el,
    queue: () => narrationQueue(text),
    tuck() { setTucked(true); },
    untuck() { setTucked(false); },
    isTucked() { return tucked; },
    highlight(section) {
      for (const key of Object.keys(sectionEls)) sectionEls[key].classList.toggle('speaking', key === section);
    },
    dispose() { el.remove(); },
  };
}
```

`src/ui/styles.css`:
```css
:root {
  --paper: #F3EDDF; --ink: #1E1E24; --gray: #55555E; --accent: #C73E3A;
}
.gg-title {
  position: fixed; top: 22%; left: 0; right: 0; text-align: center;
  font-family: Georgia, 'Times New Roman', serif; font-size: clamp(28px, 6vw, 64px);
  color: var(--ink); letter-spacing: 0.04em; pointer-events: none; z-index: 30;
  transition: opacity 0.4s;
}
.gg-sound-card, .gg-onboard {
  position: fixed; z-index: 40; background: var(--paper); color: var(--ink);
  border: 1px solid rgba(30,30,36,0.25); border-radius: 4px; padding: 16px 20px;
  font-family: Georgia, serif; box-shadow: 0 6px 24px rgba(30,30,36,0.15);
}
.gg-sound-card { bottom: 32px; left: 50%; transform: translateX(-50%); text-align: center; }
.gg-sound-card button, .gg-onboard button, .gg-hud button, .gg-menu button, .gg-sit button {
  font-family: Georgia, serif; background: none; border: 1px solid rgba(30,30,36,0.3);
  color: var(--ink); padding: 6px 14px; margin: 6px 4px 0; border-radius: 3px; cursor: pointer;
}
.gg-scroll {
  position: fixed; top: 0; right: 0; height: 100%; width: min(420px, 40vw);
  background: rgba(243,237,223,0.92); color: var(--ink); z-index: 20;
  font-family: Georgia, 'Times New Roman', serif; overflow-y: auto;
  transition: transform 0.5s ease; box-shadow: -4px 0 24px rgba(30,30,36,0.1);
}
.gg-scroll.tucked { transform: translateX(calc(100% - 40px)); }
.gg-scroll-tab {
  position: absolute; left: 0; top: 24px; width: 40px; height: 40px;
  background: var(--accent); color: var(--paper); border: none; cursor: pointer;
  font-family: Georgia, serif; border-radius: 3px 0 0 3px;
}
.gg-scroll-body { padding: 28px 32px 80px 52px; }
.gg-scroll-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.gg-scroll-head h2 { font-weight: normal; font-size: 26px; margin: 0; flex: 1; }
.gg-seal {
  display: inline-grid; place-items: center; width: 34px; height: 34px;
  background: var(--accent); color: var(--paper); border-radius: 3px; font-size: 18px;
}
.gg-play-all { margin-top: 8px; }
.gg-section { margin-top: 26px; }
.gg-section-label {
  font-variant: small-caps; letter-spacing: 0.08em; color: var(--gray);
  font-size: 14px; display: flex; align-items: center; gap: 8px;
}
.gg-speak { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 15px; }
.gg-section-text { margin-top: 8px; line-height: 1.7; white-space: pre-wrap; }
.gg-section.speaking .gg-section-text { background: rgba(199,62,58,0.08); }
@media (max-width: 900px) {
  .gg-scroll { top: auto; bottom: 0; right: 0; left: 0; width: 100%; height: 55%; }
  .gg-scroll.tucked { transform: translateY(calc(100% - 40px)); }
  .gg-scroll-tab { left: 24px; top: 0; border-radius: 0 0 3px 3px; }
}
.gg-hud { position: fixed; top: 16px; left: 16px; z-index: 25; display: flex; gap: 8px; }
.gg-enso {
  position: fixed; top: 16px; right: 16px; z-index: 25; width: 44px; height: 44px;
  border-radius: 50%; border: 2px solid var(--ink); background: rgba(243,237,223,0.6);
  cursor: pointer; color: var(--ink); font-size: 20px;
}
.gg-menu {
  position: fixed; inset: 0; z-index: 50; background: var(--paper); color: var(--ink);
  font-family: Georgia, serif; overflow-y: auto; padding: 6vh 8vw;
}
.gg-menu.hidden { display: none; }
.gg-menu h1 { font-weight: normal; letter-spacing: 0.04em; }
.gg-menu ol { list-style: none; padding: 0; margin: 24px 0; max-width: 640px; }
.gg-menu li { display: flex; align-items: baseline; gap: 14px; padding: 10px 0; border-bottom: 1px solid rgba(30,30,36,0.08); }
.gg-menu li .num { font-size: 14px; color: var(--gray); width: 28px; text-align: right; }
.gg-menu li .ttl { flex: 1; font-size: 19px; }
.gg-menu li.locked .ttl { color: rgba(30,30,36,0.35); }
.gg-menu li.registered .ttl { cursor: pointer; }
.gg-menu li .mark { width: 20px; text-align: center; }
.gg-menu li .dot::before { content: '·'; color: var(--gray); }
.gg-menu li .stamp { color: var(--accent); }
.gg-sit {
  position: fixed; inset: 0; z-index: 45; display: grid; place-items: center;
  background: rgba(243,237,223,0.55); color: var(--ink); font-family: Georgia, serif;
}
.gg-sit.hidden { display: none; }
.gg-enso-breath {
  width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--ink);
  animation: gg-breathe 6s ease-in-out infinite;
}
@keyframes gg-breathe { 0%,100% { transform: scale(0.7); opacity: 0.5; } 50% { transform: scale(1); opacity: 1; } }
```

In `index.html`, add inside `<head>` (after the existing `<style>` block or before `</head>`):
```html
<link rel="stylesheet" href="src/ui/styles.css">
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/scroll-state.test.js` → PASS (2).
Run: `node --check src/ui/scroll.js` → OK.

- [ ] **Step 5: Commit**

```bash
git add src/ui/scroll_state.js src/ui/scroll.js src/ui/styles.css index.html tests/scroll-state.test.js
git commit -m "feat: kakemono scroll UI + book stylesheet" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Menu + onboarding

**Files:**
- Create: `src/ui/menu_state.js`, `src/ui/menu.js`, `src/ui/onboarding.js`
- Test: `tests/menu-state.test.js`

**Interfaces:**
- Consumes: `CASES` (index), `isRegistered` (registry), save state.
- Produces:
  - `src/ui/menu_state.js` (pure): `buildRows(cases, progress, isRegistered)` → `[{ id, slug, title, extra, registered, read, sat }]`; `continueTarget(cases, progress, lastSlug)` → slug|null.
  - `src/ui/menu.js`: `makeMenu({ cases, progress, isRegistered, onSelect, onHelp })` → `{ el, open(), close(), isOpen(), refresh(progress), dispose() }`. Clicking a registered row calls `onSelect(slug)`.
  - `src/ui/onboarding.js`: `makeOnboarding({ onDismiss })` → `{ el, show(), hide() }`.

- [ ] **Step 1: Write the failing state test**

`tests/menu-state.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRows, continueTarget } from '../src/ui/menu_state.js';

const CASES = [
  { id: 1, slug: 'a', title: 'A', extra: false },
  { id: 29, slug: 'wind', title: 'Wind', extra: false },
  { id: 49, slug: 'amban', title: 'Amban', extra: true },
];
const reg = (slug) => slug === 'wind';

test('buildRows reflects registration and progress', () => {
  const rows = buildRows(CASES, { read: { wind: true }, sat: { wind: true } }, reg);
  const wind = rows.find((r) => r.slug === 'wind');
  assert.equal(wind.registered, true);
  assert.equal(wind.read, true);
  assert.equal(wind.sat, true);
  const a = rows.find((r) => r.slug === 'a');
  assert.equal(a.registered, false);
  assert.equal(a.read, false);
});

test('continueTarget prefers lastSlug, then first read, else null', () => {
  assert.equal(continueTarget(CASES, { read: {} }, 'wind'), 'wind');
  assert.equal(continueTarget(CASES, { read: { a: true } }, null), 'a');
  assert.equal(continueTarget(CASES, { read: {} }, null), null);
  assert.equal(continueTarget(CASES, { read: {} }, 'ghost'), null); // unknown slug ignored
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/menu-state.test.js`
Expected: FAIL — cannot find module `../src/ui/menu_state.js`.

- [ ] **Step 3: Implement state, menu DOM, onboarding**

`src/ui/menu_state.js`:
```js
export function buildRows(cases, progress, isRegistered) {
  const read = progress.read || {};
  const sat = progress.sat || {};
  return cases.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, extra: !!c.extra,
    registered: isRegistered(c.slug), read: !!read[c.slug], sat: !!sat[c.slug],
  }));
}

export function continueTarget(cases, progress, lastSlug) {
  const read = progress.read || {};
  if (lastSlug && cases.some((c) => c.slug === lastSlug)) return lastSlug;
  const first = cases.find((c) => read[c.slug]);
  return first ? first.slug : null;
}
```

`src/ui/menu.js`:
```js
import { buildRows, continueTarget } from './menu_state.js';

// The table of contents. Reads as a book's contents, not a level select.
export function makeMenu({ cases, progress, isRegistered, onSelect, onHelp } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-menu hidden';

  const h1 = document.createElement('h1');
  h1.textContent = 'The Gateless Gate';
  el.appendChild(h1);

  const help = document.createElement('button');
  help.textContent = '?';
  help.className = 'gg-help';
  help.onclick = () => onHelp && onHelp();
  el.appendChild(help);

  const cont = document.createElement('div');
  cont.className = 'gg-continue';
  el.appendChild(cont);

  const list = document.createElement('ol');
  el.appendChild(list);

  function render(prog) {
    list.innerHTML = '';
    const rows = buildRows(cases, prog, isRegistered);
    for (const r of rows) {
      const li = document.createElement('li');
      li.className = r.registered ? 'registered' : 'locked';
      const mark = r.sat ? '<span class="mark stamp">◉</span>'
        : r.read ? '<span class="mark dot"></span>' : '<span class="mark"></span>';
      li.innerHTML = `<span class="num">${r.id}</span><span class="ttl">${r.title}</span>${mark}`;
      if (r.registered) li.querySelector('.ttl').onclick = () => onSelect && onSelect(r.slug);
      list.appendChild(li);
    }
    const tgt = continueTarget(cases, prog, prog.lastSlug);
    cont.innerHTML = '';
    if (tgt && isRegistered(tgt)) {
      const b = document.createElement('button');
      b.textContent = 'Continue';
      b.onclick = () => onSelect && onSelect(tgt);
      cont.appendChild(b);
    }
  }
  render(progress);

  let open = false;
  return {
    el,
    open() { open = true; el.classList.remove('hidden'); },
    close() { open = false; el.classList.add('hidden'); },
    isOpen() { return open; },
    refresh(prog) { render(prog); },
    dispose() { el.remove(); },
  };
}
```

`src/ui/onboarding.js`:
```js
export function makeOnboarding({ onDismiss } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-onboard hidden';
  el.style.cssText += ';top:50%;left:50%;transform:translate(-50%,-50%);max-width:340px;text-align:center;';
  el.innerHTML = `<p style="line-height:1.6">A quiet reading of the Mumonkan.<br>Read · listen · touch things · sit.</p>`;
  const b = document.createElement('button');
  b.textContent = 'Begin';
  b.onclick = () => { el.classList.add('hidden'); onDismiss && onDismiss(); };
  el.appendChild(b);
  return {
    el,
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
  };
}
```

Add to `src/ui/styles.css`:
```css
.gg-onboard.hidden { display: none; }
.gg-help { position: fixed; top: 6vh; right: 8vw; width: 34px; height: 34px; border-radius: 50%; }
.gg-continue { margin: 8px 0 4px; }
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/menu-state.test.js` → PASS (2).
Run: `node --check src/ui/menu.js src/ui/onboarding.js` → OK.

- [ ] **Step 5: Commit**

```bash
git add src/ui/menu_state.js src/ui/menu.js src/ui/onboarding.js src/ui/styles.css tests/menu-state.test.js
git commit -m "feat: table-of-contents menu + onboarding card" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Sit timer

**Files:**
- Create: `src/sit.js`
- Test: `tests/sit.test.js`

**Interfaces:**
- Consumes: `audio.bell()`, palette/CSS.
- Produces:
  - `sitOutcome(elapsed, duration)` (pure) → `'complete' | 'early'` (complete iff `elapsed >= duration`).
  - `makeSit({ audio, onComplete, onExit })` → `{ el, start(minutes), update(dt), end(), active() }`. `start` rings the bell, shows the ensō breather; `update` accumulates sim time; on reaching duration it rings the bell, calls `onComplete()` and hides; `end()` is early exit — bell, `onExit()`, no complete. Presets are chosen by the caller (HUD) passing minutes.

- [ ] **Step 1: Write the failing test**

`tests/sit.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sitOutcome } from '../src/sit.js';

test('sitOutcome: complete only when elapsed reaches duration', () => {
  assert.equal(sitOutcome(120, 120), 'complete');
  assert.equal(sitOutcome(121, 120), 'complete');
  assert.equal(sitOutcome(119.9, 120), 'early');
  assert.equal(sitOutcome(0, 120), 'early');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/sit.test.js`
Expected: FAIL — cannot find module `../src/sit.js`.

- [ ] **Step 3: Implement sit**

`src/sit.js`:
```js
export function sitOutcome(elapsed, duration) {
  return elapsed >= duration ? 'complete' : 'early';
}

// Browser sit mode. `audio` is createAudio(); onComplete()/onExit() are callbacks.
export function makeSit({ audio, onComplete, onExit } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-sit hidden';
  const breath = document.createElement('div');
  breath.className = 'gg-enso-breath';
  el.appendChild(breath);
  const hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;bottom:8vh;color:var(--gray);font-size:14px;';
  hint.textContent = 'tap to end';
  el.appendChild(hint);

  let running = false, elapsed = 0, duration = 0, wake = null;

  el.addEventListener('pointerdown', () => { if (running) finish('early'); });

  async function acquireWake() {
    try { wake = await navigator.wakeLock.request('screen'); } catch { wake = null; }
  }
  function releaseWake() { try { wake && wake.release(); } catch {} wake = null; }

  function finish(kind) {
    if (!running) return;
    running = false;
    audio && audio.bell({ f0: 70 });
    el.classList.add('hidden');
    releaseWake();
    if (kind === 'complete') onComplete && onComplete();
    else onExit && onExit();
  }

  return {
    el,
    active() { return running; },
    start(minutes) {
      duration = minutes * 60;
      elapsed = 0;
      running = true;
      el.classList.remove('hidden');
      audio && audio.bell({ f0: 70 });
      acquireWake();
    },
    update(dt) {
      if (!running) return;
      elapsed += dt;
      if (sitOutcome(elapsed, duration) === 'complete') finish('complete');
    },
    end() { finish('early'); },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/sit.test.js` → PASS (1).
Run: `node --check src/sit.js` → OK.

- [ ] **Step 5: Commit**

```bash
git add src/sit.js tests/sit.test.js
git commit -m "feat: sit timer with bell start/end and ensō breather" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Case 29 koan module

**Files:**
- Create: `src/koans/k29.js`
- Test: `tests/k29.test.js`
- Modify: `tests/koan-index.test.js` (restore the full load assertion)

**Interfaces:**
- Consumes: kit facade, `TEXT` artifact, `input` (from `ctx`), `audio` (from `ctx`), Three.
- Produces: `src/koans/k29.js` default export `{ id:29, slug:'not-the-wind-not-the-flag', title, accent:'#C73E3A', tier:2, text, ambience:['wind:0.25'], build(ctx) }`. `build(ctx)` returns `{ scene, update(dt, simTime), onEnter(), onExit(), dispose(), fragment() }` (the koan IS a SceneManager root plus lifecycle). `fragment()` → `{ windOn, windLevel, clothEnergy }`. Wires: two monks (one `pose:'point'`) facing each other by the flag; hover over the cloth → `flag.hoverAt`; tap the cloth → `flag.toggleWind()` + drives `audio.setWindLevel`.

- [ ] **Step 1: Write the failing contract test**

`tests/k29.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import k29 from '../src/koans/k29.js';
import { clothEnergy } from '../src/sim/verlet.js';

function fakeCtx() {
  const taps = [], hovers = [];
  return {
    accent: k29.accent,
    quality: 'high',
    audio: { setWindLevel() {}, startAmbience() {}, stopAmbience() {}, bell() {} },
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null, // no hit by default
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
  };
}

test('module shape matches the koan contract', () => {
  assert.equal(k29.id, 29);
  assert.equal(k29.slug, 'not-the-wind-not-the-flag');
  assert.equal(k29.tier, 2);
  for (const f of ['case', 'comment', 'verse']) {
    assert.ok(k29.text[f] && k29.text[f].trim().length > 0, `text.${f} empty`);
  }
  assert.equal(typeof k29.build, 'function');
});

test('build returns a root with a two-monk diorama and lifecycle', () => {
  const root = k29.build(fakeCtx());
  assert.ok(root.scene instanceof THREE.Scene);
  for (const fn of ['update', 'onEnter', 'onExit', 'dispose', 'fragment']) {
    assert.equal(typeof root[fn], 'function', `root.${fn} missing`);
  }
  const monks = [];
  root.scene.traverse((o) => { if (o.name === 'monk') monks.push(o); });
  assert.equal(monks.length, 2, 'two monks argue about the flag');
  assert.ok(root.scene.getObjectByName('flag'), 'flag present');
  const frag = root.fragment();
  assert.equal(typeof frag.windLevel, 'number');
  assert.equal(frag.windOn, true);
});

test('update advances the cloth; tap toggles the wind off', () => {
  const ctx = fakeCtx();
  const root = k29.build(ctx);
  const flagGroup = root.scene.getObjectByName('flag');
  const cloth = root.scene.getObjectByName('cloth');
  for (let i = 1; i <= 30; i++) root.update(1 / 60, i / 60);
  assert.ok(root.fragment().clothEnergy >= 0);
  // simulate a tap on the cloth by making raycastFirst return a hit
  ctx.input.raycastFirst = () => ({ object: cloth, point: new THREE.Vector3(0, 3, 0) });
  ctx._taps.forEach((cb) => cb(400, 300));
  assert.equal(root.fragment().windOn, false, 'tapping the flag toggles the wind off');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/k29.test.js`
Expected: FAIL — cannot find module `../src/koans/k29.js`.

- [ ] **Step 3: Implement the koan**

`src/koans/k29.js`:
```js
import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER } from '../palette.js';
import {
  makeIsland, makeMonk, makeGate, makeFlag, makeLights, makeBlobShadow, addOutlines,
} from '../kit/index.js';
import { clothEnergy } from '../sim/verlet.js';

const ID = 29;
const ACCENT = '#C73E3A';

export default {
  id: ID,
  slug: 'not-the-wind-not-the-flag',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  ambience: ['wind:0.25'],

  build(ctx) {
    const { audio, input } = ctx;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    scene.fog = new THREE.FogExp2(PAPER, 0.058);
    scene.add(makeLights());
    scene.add(makeIsland({ radius: 6, seed: 3 }));

    const gate = makeGate({});
    gate.position.set(2.6, 0, -2.2);
    gate.rotation.y = 0.35;
    scene.add(gate);

    const flag = makeFlag({ seed: 11 });
    flag.group.position.set(3.6, 0, -1.4);
    scene.add(flag.group);

    // two monks facing each other, arguing about the flag; one points up at it
    const monkA = makeMonk({ pose: 'point' });
    monkA.position.set(1.1, 0, 0.6);
    monkA.rotation.y = 0.5;                 // faces +x toward the flag / monkB
    const monkB = makeMonk({});
    monkB.position.set(-0.5, 0, 1.2);
    monkB.rotation.y = 2.3;                 // faces back toward monkA
    scene.add(monkA, monkB);

    for (const [p, rx, rz, op] of [
      [monkA.position, 0.7, 0.55, 0.42],
      [monkB.position, 0.7, 0.55, 0.42],
      [gate.position, 1.8, 0.75, 0.32],
      [flag.group.position, 0.55, 0.45, 0.36],
    ]) {
      const s = makeBlobShadow({ radiusX: rx, radiusZ: rz, opacity: op });
      s.position.x = p.x; s.position.z = p.z;
      scene.add(s);
    }

    addOutlines(scene, { width: 0.035, wobble: 0.7 });

    const baseWind = 0.25;
    let camera = null;

    // hover the cloth -> local puff; tap the cloth -> toggle the wind
    input.onHover(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const local = flag.mesh.worldToLocal(hit.point.clone());
        flag.hoverAt(local.x, local.y);
      }
    });
    input.onTap(() => {
      if (!camera) return;
      const hit = input.raycastFirst(camera, [flag.mesh]);
      if (hit) {
        const on = flag.toggleWind();
        audio && audio.setWindLevel(on ? baseWind : 0);
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      onEnter() { audio && audio.startAmbience(['wind:' + baseWind]); },
      onExit() { audio && audio.stopAmbience(); },
      update(dt, simTime) {
        flag.update(dt, simTime);
        audio && audio.setWindLevel(flag.windLevel() * baseWind);
      },
      fragment() {
        return {
          windOn: flag.isWindOn(),
          windLevel: +flag.windLevel().toFixed(4),
          clothEnergy: +clothEnergy(flag.cloth).toFixed(6),
        };
      },
      dispose() {},
    };
  },
};
```

Note the koan root exposes an extra `setCamera(c)` so the app can hand it the live camera for raycasts (the fake ctx test never sets it, so hover/tap early-return until a real camera arrives — the test drives tap after setting `raycastFirst`, and `camera` stays null; adjust: the test must set camera). Update the third k29 test to call `root.setCamera(new THREE.PerspectiveCamera())` before dispatching the tap:
```js
  root.setCamera(new THREE.PerspectiveCamera());
  ctx.input.raycastFirst = () => ({ object: cloth, point: new THREE.Vector3(0, 3, 0) });
  ctx._taps.forEach((cb) => cb(400, 300));
```

- [ ] **Step 4: Restore the registry load test**

In `tests/koan-index.test.js`, replace the `registration table (...)` test with the full-load version:
```js
test('case 29 loads via the registry', async () => {
  assert.equal(isRegistered('not-the-wind-not-the-flag'), true);
  assert.equal(isRegistered('joshu-s-dog'), false);
  const mod = await loadKoan('not-the-wind-not-the-flag');
  assert.equal(mod.id, 29);
  assert.equal(await loadKoan('joshu-s-dog'), null);
});
```

- [ ] **Step 5: Run to verify pass, then full suite**

Run: `node --test tests/k29.test.js tests/koan-index.test.js` → PASS.
Run: `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/koans/k29.js tests/k29.test.js tests/koan-index.test.js
git commit -m "feat: case 29 koan — two-monk diorama, flag hover/toggle, state fragment" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: App orchestrator (mode machine + window.gate v2 + HUD)

**Files:**
- Rewrite: `src/main.js`
- Create: `src/ui/hud.js`
- Delete: `src/scene_m0.js`, `tests/scene.test.js`
- Test: none new (browser-verified in Task 15); the rewrite must keep `npm test` green after the deletions.

**Interfaces:**
- Consumes: everything from Tasks 2–13.
- Produces:
  - `src/ui/hud.js`: `makeHud({ onSound, onSit, onMenu, soundOn })` → `{ el, ensoEl, setSound(on), setVisible(bool), dispose() }`. Corner controls: sound toggle + Sit (with a small preset popover 2/5/10/20) + an ensō button that returns to the menu.
  - `src/main.js`: the mode machine (`intro`/`menu`/`koan`/`sit`), fixed-step loop, `window.gate` v2, wiring save/audio/scene-manager/input/menu/scroll/sit/intro/onboarding/hud.

- [ ] **Step 1: Delete M0 leftovers**

```bash
git rm src/scene_m0.js tests/scene.test.js
```

- [ ] **Step 2: Create the HUD**

`src/ui/hud.js`:
```js
export function makeHud({ onSound, onSit, onMenu, soundOn = true } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-hud';

  const sound = document.createElement('button');
  const setSoundLabel = (on) => { sound.textContent = on ? '♪ on' : '♪ off'; };
  setSoundLabel(soundOn);
  sound.onclick = () => onSound && onSound();
  el.appendChild(sound);

  const sit = document.createElement('button');
  sit.textContent = 'Sit';
  const pop = document.createElement('span');
  pop.className = 'gg-sit-pop hidden';
  for (const m of [2, 5, 10, 20]) {
    const b = document.createElement('button');
    b.textContent = m + 'm';
    b.onclick = () => { pop.classList.add('hidden'); onSit && onSit(m); };
    pop.appendChild(b);
  }
  sit.onclick = () => pop.classList.toggle('hidden');
  const sitWrap = document.createElement('span');
  sitWrap.style.position = 'relative';
  sitWrap.appendChild(sit); sitWrap.appendChild(pop);
  el.appendChild(sitWrap);

  const enso = document.createElement('button');
  enso.className = 'gg-enso';
  enso.textContent = '○';
  enso.onclick = () => onMenu && onMenu();

  return {
    el, ensoEl: enso,
    setSound(on) { setSoundLabel(on); },
    setVisible(v) { el.style.display = v ? 'flex' : 'none'; enso.style.display = v ? 'block' : 'none'; },
    dispose() { el.remove(); enso.remove(); },
  };
}
```

Add to `src/ui/styles.css`:
```css
.gg-sit-pop { position: absolute; top: 110%; left: 0; display: flex; gap: 4px; background: var(--paper); padding: 4px; border: 1px solid rgba(30,30,36,0.2); border-radius: 3px; }
.gg-sit-pop.hidden { display: none; }
```

- [ ] **Step 3: Rewrite main.js**

`src/main.js`:
```js
import * as THREE from '../lib/three.module.js';
import { makeCameraRig } from './camera.js';
import { makeDissolve } from './render/dissolve.js';
import { installGrain } from './render/grain.js';
import { makeSceneManager } from './scene/manager.js';
import { makeInput } from './input.js';
import { createSave } from './save.js';
import { createAudio } from './audio/engine.js';
import { createNarration } from './audio/narration.js';
import { CASES, bySlug } from './koans/index.js';
import { isRegistered, loadKoan } from './koans/registry.js';
import { buildHub, makeIntro } from './intro.js';
import { makeMenu } from './ui/menu.js';
import { makeOnboarding } from './ui/onboarding.js';
import { makeScroll } from './ui/scroll.js';
import { makeHud } from './ui/hud.js';
import { makeSit } from './sit.js';

const STEP = 1 / 60;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
installGrain(document);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 100);
const dissolve = makeDissolve();
dissolve.setAspect(innerWidth / innerHeight);
const scenes = makeSceneManager(renderer, dissolve);
const input = makeInput(renderer.domElement);
const save = createSave(window.localStorage);
const audio = createAudio(save);
const narration = createNarration();

const hub = buildHub();
scenes.setActive(hub);

let mode = 'intro';
let simTime = 0;
let rig = null;           // camera rig for menu/koan
let koan = null;         // current koan root
let scroll = null;       // current scroll UI
let intro = null;

// ---- UI singletons ----
const menu = makeMenu({
  cases: CASES, progress: save.state(), isRegistered,
  onSelect: (slug) => enter(slug),
  onHelp: () => onboarding.show(),
});
document.body.appendChild(menu.el);

const onboarding = makeOnboarding({ onDismiss: () => {} });
document.body.appendChild(onboarding.el);

const sit = makeSit({
  audio,
  onComplete: () => { if (koanSlug) { save.markSat(koanSlug); menu.refresh(save.state()); } setMode('koan'); },
  onExit: () => setMode('koan'),
});
document.body.appendChild(sit.el);

const hud = makeHud({
  soundOn: save.state().soundOn,
  onSound: () => { audio.setSound(!audio.isSoundOn()); hud.setSound(audio.isSoundOn()); },
  onSit: (m) => startSit(m),
  onMenu: () => exit(),
});
document.body.appendChild(hud.el);
document.body.appendChild(hud.ensoEl);
hud.setVisible(false);

let koanSlug = null;

// ---- mode transitions ----
function setMode(m) { mode = m; }

function makeRig(opts) {
  return makeCameraRig(camera, renderer.domElement, opts);
}

function startIntro() {
  setMode('intro');
  hud.setVisible(false);
  menu.close();
  intro = makeIntro(camera, {
    onSound: (on) => { audio.unlock(); audio.setSound(on); hud.setSound(on); },
    onDone: () => openMenu(),
  });
}

function openMenu() {
  setMode('menu');
  intro = null;
  hud.setVisible(false);
  rig = makeRig({ distance: 12, target: [0, 1.2, -1], polar: 1.15 });
  menu.refresh(save.state());
  menu.open();
  if (!save.state().onboarded) { onboarding.show(); save.setOnboarded(); }
}

async function enter(slug) {
  if (!isRegistered(slug)) return;
  const mod = await loadKoan(slug);
  if (!mod) return;
  menu.close();
  audio.unlock();
  koanSlug = slug;
  const built = mod.build({ scene: null, kit: null, audio, input, accent: mod.accent, quality: 'high' });
  built.setCamera && built.setCamera(camera);
  await scenes.swapTo(built, { disposePrev: hub !== scenes.active() });
  // keep hub cached: only dispose a previous koan, never the hub
  koan = built;
  built.onEnter && built.onEnter();
  save.markRead(slug);
  rig = makeRig({ distance: 10.8, target: [0.2, 0.9, 0], polar: 1.18 });
  // scroll UI
  scroll = makeScroll({
    id: mod.id, title: mod.title, text: mod.text, accent: mod.accent,
    onSpeak: (key) => narration.speak(mod.text[key], { onEnd: () => scroll.highlight(null) }),
    onSpeakAll: () => speakAll(mod.text),
  });
  document.body.appendChild(scroll.el);
  hud.setVisible(true);
  setMode('koan');
}

function speakAll(text) {
  const order = scroll.queue();
  let i = 0;
  const step = () => {
    if (i >= order.length) { scroll.highlight(null); return; }
    const key = order[i++];
    scroll.highlight(key);
    narration.speak(text[key], { onEnd: step });
  };
  step();
}

async function exit() {
  if (mode === 'koan' || mode === 'sit') {
    narration.stop();
    if (scroll) { scroll.dispose(); scroll = null; }
    hud.setVisible(false);
    koan && koan.onExit && koan.onExit();
    await scenes.swapTo(hub, { disposePrev: true });
    koan = null;
    koanSlug = null;
    openMenu();
  } else {
    menu.open();
  }
}

function startSit(minutes) {
  setMode('sit');
  if (scroll) scroll.tuck();
  hud.setVisible(false);
  sit.start(minutes);
}

// ---- skip intro on any input ----
function skipIntro() { if (mode === 'intro' && intro) intro.skip(); }
addEventListener('keydown', (e) => {
  if (mode === 'intro') { skipIntro(); return; }
  if (e.key === 'Escape') exit();
});
renderer.domElement.addEventListener('pointerdown', () => { if (mode === 'intro') skipIntro(); });

// ---- loop ----
function tick() {
  simTime += STEP;
  if (mode === 'intro' && intro) intro.update(STEP);
  else if (rig) rig.update(STEP);
  const active = scenes.active();
  if (active && active.update) active.update(STEP, simTime);
  if (mode === 'sit') sit.update(STEP);
  dissolve.update(STEP);
}

let acc = 0, last = performance.now(), fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (dt > 0) fps = fps * 0.95 + (1 / dt) * 0.05;
  acc += dt;
  while (acc >= STEP) { acc -= STEP; tick(); }
  scenes.render(camera);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  dissolve.setAspect(camera.aspect);
});

// ---- headless hooks ----
window.gate = {
  step(n = 1) { for (let i = 0; i < n; i++) tick(); scenes.render(camera); return window.gate.state(); },
  state() {
    const s = {
      mode, simTime: +simTime.toFixed(4),
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      fps: Math.round(fps), dissolveT: +dissolve.t.toFixed(4),
      camera: rig ? rig.state() : null,
      progress: { read: { ...save.state().read }, sat: { ...save.state().sat } },
    };
    if (koan && koan.fragment) s.koan = koan.fragment();
    return s;
  },
  enter(slug) { return enter(slug); },
  exit() { return exit(); },
  menu(open) { if (open === false) menu.close(); else menu.open(); },
  skipIntro,
  dissolve(dir = 'in', dur) { return dir === 'in' ? dissolve.dissolveIn(dur) : dissolve.dissolveOut(dur); },
  sit(minutes) { startSit(minutes); },
  endSit() { sit.end(); },
  markRead(slug) { save.markRead(slug); menu.refresh(save.state()); },
  markSat(slug) { save.markSat(slug); menu.refresh(save.state()); },
  setSound(on) { audio.setSound(on); hud.setSound(audio.isSoundOn()); },
};

dissolve.set(1);      // start revealed; intro dolly runs over the hub
startIntro();
requestAnimationFrame(frame);
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. The `tests/scene.test.js` deletion removes the old `buildScene` coverage; nothing else imports `scene_m0.js` (verify with `grep`). If any test still imports it, that's a bug to fix now.

Run: `grep -rn "scene_m0" src tests` → expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: app orchestrator — mode machine, window.gate v2, HUD; drop scene_m0" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Browser verification & tuning

This task is interactive (preview panel) — run it in the main session, not a subagent.

**Files:**
- Modify: `README.md` (document the v2 hooks and the flow); possibly small tuning in `src/koans/k29.js`, `src/intro.js`, `src/ui/styles.css`.

**Interfaces:**
- Consumes: the running app at `http://localhost:8105` (launch config `gate`) + the shot server (`gate-shots`, port 8106).

- [ ] **Step 1: Launch and smoke-check**

Start the `gate` and `gate-shots` preview servers. Reload `http://localhost:8105`. Check the console for errors — expect zero. If blank, check console for a shader/module error first.

- [ ] **Step 2: Verify hooks and the mode machine**

In the page context, evaluate in sequence and confirm each:
```js
window.gate.state().mode            // 'intro'
window.gate.skipIntro();            // -> menu
window.gate.state().mode            // 'menu'
window.gate.enter('not-the-wind-not-the-flag')  // promise
// after it resolves:
window.gate.state().mode            // 'koan'
window.gate.state().koan            // { windOn:true, windLevel:~1, clothEnergy:>0 }
window.gate.state().drawCalls       // < 150
window.gate.state().progress.read   // { 'not-the-wind-not-the-flag': true }
```

- [ ] **Step 3: Screenshot the koan; check the staging**

POST a canvas capture to the shot server (`fetch('http://localhost:8106/m1_case29', { method:'POST', body: canvas.toDataURL('image/jpeg',0.9) })`) after `window.gate.step(240)`. Read `shots/m1_case29.jpeg`. Confirm: two monks reading as facing each other (one pointing up at the flag), flag waving, gate, torn-paper island, scroll panel on the right with the case text and vermillion seal. Tune monk placement/rotation and camera framing in `k29.js` if the two figures don't read as "in conversation."

- [ ] **Step 4: Exercise interactions and progress**

- Flag toggle: `window.gate.state().koan.windOn` → true. Simulate a tap on the cloth (synthetic pointerdown+up on the canvas at the flag's screen position, < 6px drift) → `windOn` false; step 180 → `windLevel` < 0.1 and the flag hangs. Tap again → recovers.
- Sit stamp: `window.gate.sit(2)` → mode 'sit'; drive `window.gate.step` for > 2 min of sim (`step(7200)`) → sit completes, mode back to 'koan', and `window.gate.state().progress.sat['not-the-wind-not-the-flag']` === true. Reload the page, open the menu, confirm the vermillion stamp persists on case 29.
- Early exit: `window.gate.sit(5)` then `window.gate.endSit()` → mode 'koan', `sat` NOT set for a fresh case.
- Narration: click a section's ♪ (or call the scroll's onSpeak path) — confirm speech starts and the section highlights (by ear + `.speaking` class present).

- [ ] **Step 5: Menu tone pass**

Open the menu (`window.gate.exit()` from a koan, or `window.gate.menu(true)`). Screenshot. Confirm it reads as a table of contents: serif, ink on paper, 49 rows, case 29 live (others greyed), read-dot and sat-stamp visible, "Continue" present. Tune spacing/typography in `styles.css` if it reads as a level select.

- [ ] **Step 6: Update the README**

Replace the `## Develop` hooks bullet in `README.md` with the v2 contract:
```markdown
- `window.gate` — headless hooks: `step(n)`, `state()` (`{ mode, simTime, drawCalls, triangles,
  fps, dissolveT, camera, progress:{read,sat}, koan? }`), `enter(slug)`, `exit()`, `menu(open?)`,
  `skipIntro()`, `dissolve('in'|'out', s?)`, `sit(min)`, `endSit()`, `markRead(slug)`,
  `markSat(slug)`, `setSound(on)`
- Regenerate koan text after editing `local/gateless-gate.txt`: `node scripts/build-text.js`
```

- [ ] **Step 7: Final verification and commit**

Run: `npm test` → all green.
```bash
git add -A
git commit -m "feat: M1 verified and tuned" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Frank's gate**

Present screenshots (case 29 with the scroll, the menu) and the numbers (draw calls, test count, fps). M1's exit criterion is Frank reading case 29 like a book page and it feeling right.

---

## Self-Review Notes

- **Spec coverage:** intro dolly + skip ✓ (T9,14), sound prompt ✓ (T9,14), menu with read-dot/sat-stamp/continue/greyed ✓ (T11,14), text pipeline 49 entries ✓ (T1), koan contract + registry ✓ (T2,13), SceneManager disposal + shared ramp + one outline material note ✓ (T7), input tap/hover/raycast ✓ (T8), case 29 two monks + hover ruffle + click wind-toggle + state fragment ✓ (T5,13), audio wind + temple bell (no bowl/crickets) ✓ (T6), narration speechSynthesis sentence-chunked + highlight ✓ (T6,10,14), scroll kakemono three sections + master play + tuck ✓ (T10), sit timer bell start/end + ensō + wake-lock + complete→stamp/early→none ✓ (T12,14), save read/sat/sound/onboarded ✓ (T3), onboarding once ✓ (T11,14), music stub ✓ (T6), window.gate v2 ✓ (T14), delete scene_m0/scene.test ✓ (T14), tests + browser verification ✓ (throughout, T15).
- **Deviations recorded:** `SceneManager.swapTo` keeps the hub cached (disposePrev decided by the app) rather than always disposing — required so returning to the menu is instant; the "one shared outline material per root" optimization from the spec is DEFERRED (M0's per-mesh outline materials are kept; disposal handles them correctly; note for M2 if draw-call/material counts grow). Slugs are derived (case 29 = `not-the-wind-not-the-flag`), so the koan module's `slug` matches the index, not the illustrative `wind-flag` in the spec's contract snippet.
- **Known risks carried to T15:** monk `pose:'point'` arm must read at ink-silhouette scale (fallback: lean postures); parser "last paragraph = verse" across all 49 (T1 build validates + prints the table; empty fields fail the build loudly).
