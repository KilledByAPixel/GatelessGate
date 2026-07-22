import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFurin, RING_THRESHOLD } from '../src/kit/furin.js';
import { gustPhase } from '../src/audio/synths.js';

// drive a furin across `secs` of sim time at 60fps, collecting ring gains
function run(f, secs, step = 1 / 60) {
  const gains = [];
  const at = [];
  const orig = f.rings();
  for (let i = 0; i * step < secs; i++) {
    const t = i * step;
    const before = f.rings();
    f.update(step, t);
    if (f.rings() > before) { gains.push(f.lastGain()); at.push(t); }
  }
  assert.ok(f.rings() >= orig);
  return { gains, at };
}

test('the furin rings on the gusts, not on a timer', () => {
  const rung = [];
  const f = makeFurin({ seed: 1, phase: 0, onRing: (g) => rung.push(g) });
  const { at } = run(f, 600);
  assert.ok(at.length > 15, `too quiet: ${at.length} rings in 10 minutes`);
  assert.equal(rung.length, at.length, 'onRing fired for every ring');

  // every ring lands on a real crest of the shared gust envelope
  for (const t of at) assert.ok(gustPhase(t) > RING_THRESHOLD, `rang off-crest at ${t}`);

  // and never twice on the same crest
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.ok(Math.min(...gaps) > 10, `double-rang: ${Math.min(...gaps)}s apart`);
});

test('a stilled wind is a silent chime', () => {
  const f = makeFurin({ seed: 1, phase: 0 });
  f.setWindLevel(0);
  assert.equal(run(f, 600).at.length, 0, 'rang with no wind');
  // and it comes back when the wind does
  f.setWindLevel(1);
  assert.ok(run(f, 600).at.length > 15);
});

test('ring gain follows the wind level', () => {
  const loud = makeFurin({ seed: 1, phase: 0 });
  const soft = makeFurin({ seed: 1, phase: 0 });
  soft.setWindLevel(0.3);
  const a = run(loud, 300).gains;
  const b = run(soft, 300).gains;
  assert.ok(a.length > 0 && a.length === b.length);
  for (let i = 0; i < a.length; i++) assert.ok(b[i] < a[i]);
});

test('two furin in one scene do not ring in unison', () => {
  const a = makeFurin({ seed: 1 });
  const b = makeFurin({ seed: 2 });
  const ta = run(a, 600).at;
  const tb = run(b, 600).at;
  assert.ok(ta.length > 0 && tb.length > 0);
  assert.notDeepEqual(ta, tb);
});

test('the furin is deterministic and sways with the gust', () => {
  const a = makeFurin({ seed: 3 });
  const b = makeFurin({ seed: 3 });
  run(a, 120); run(b, 120);
  assert.equal(a.rings(), b.rings());
  assert.ok(Math.abs(a.group.children[0].rotation.z - b.group.children[0].rotation.z) < 1e-12);

  // it hangs BELOW its origin, so a case places it by where it hangs from
  const box = { min: Infinity, max: -Infinity };
  a.group.traverse((o) => {
    if (!o.geometry) return;
    o.geometry.computeBoundingBox();
    box.min = Math.min(box.min, o.geometry.boundingBox.min.y + o.position.y);
    box.max = Math.max(box.max, o.geometry.boundingBox.max.y + o.position.y);
  });
  assert.ok(box.max <= 0.01, `geometry pokes above the hang point: ${box.max}`);
});

test('a tap rings it regardless of the wind', () => {
  const rung = [];
  const f = makeFurin({ seed: 1, onRing: (g) => rung.push(g) });
  f.setWindLevel(0);
  f.ring();
  assert.equal(f.rings(), 1);
  assert.equal(rung.length, 1);
  assert.ok(rung[0] > 0);
  assert.ok(f.pickTargets().length > 0);
});
