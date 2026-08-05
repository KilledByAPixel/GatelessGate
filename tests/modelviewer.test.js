// The model-viewer roster (src/modelviewer/roster.js) is the ONE registry of
// viewable kit models, shared by dev/model-viewer.html and dev/model-shot.html —
// shot.js --model resolves its keys, and checklist notes are stored under
// them. These pins hold the contract that makes that sharing safe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, instantiate } from '../src/modelviewer/roster.js';

test('roster entries are well-formed and keys are unique', () => {
  assert.ok(ROSTER.length >= 40, `roster looks truncated: ${ROSTER.length} entries`);
  const seen = new Set();
  for (const e of ROSTER) {
    assert.equal(typeof e.key, 'string');
    assert.ok(e.key.length, 'empty key');
    assert.ok(!seen.has(e.key), `duplicate key ${e.key}`);
    seen.add(e.key);
    assert.equal(typeof e.section, 'string', `${e.key}: no section`);
    assert.equal(typeof e.build, 'function', `${e.key}: no build()`);
  }
});

test('sections are contiguous — the sidebar and gallery group by run, not by sort', () => {
  const runs = [];
  for (const e of ROSTER) {
    if (runs[runs.length - 1] !== e.section) runs.push(e.section);
  }
  assert.equal(new Set(runs).size, runs.length,
    `a section appears in two runs: ${runs.join(' > ')}`);
});

test('the polish-workflow keys the memory bank speaks are present', () => {
  const keys = new Set(ROSTER.map((e) => e.key));
  for (const k of ['dog', 'fox', 'cat', 'horse', 'buffalo', 'koi',
    'monk', 'monk-sit', 'monk-point', 'buddha', 'gate', 'lantern', 'fan']) {
    assert.ok(keys.has(k), `missing key ${k}`);
  }
});

test('instantiate normalizes bare objects and handle-style builders', () => {
  const bare = { isObject3D: true };
  assert.equal(instantiate({ key: 'x', build: () => bare }, {}).obj, bare);

  let settled = null;
  const handle = { group: { isObject3D: true }, update: (dt, t) => { settled = [dt, t]; } };
  const out = instantiate({ key: 'y', build: () => handle }, {});
  assert.equal(out.obj, handle.group);
  assert.deepEqual(settled, [0, 0], 'handle models must be settled into rest pose');

  assert.throws(() => instantiate({ key: 'bad', build: () => ({}) }, {}), /bad: builder returned no Object3D/);
});

test('builders read the kit through their argument, never a static import', async () => {
  // the hot-reload contract: swap the namespace passed in and every builder
  // must follow it. Prove no entry reaches around its `kit` parameter by
  // feeding a tracing proxy and requiring at least one property access.
  const src = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/modelviewer/roster.js', import.meta.url), 'utf8'));
  const imports = src.match(/^import .*$/gm) || [];
  assert.deepEqual(imports, [], `roster.js must stay dependency-free, found: ${imports.join(', ')}`);

  for (const e of ROSTER) {
    let touched = 0;
    const kit = new Proxy({}, {
      get: (_, prop) => { touched++; return () => { throw new Error('stop'); }; },
    });
    try { e.build(kit); } catch { /* the stub throws by design */ }
    assert.ok(touched > 0, `${e.key}: build() never read its kit argument`);
  }
});
