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

test('a tap sets the pointer even with no pointermove first (touch devices)', () => {
  const el = fakeEl();
  const input = makeInput(el);
  // a touch tap arrives as down/up with no move; the raycast pointer must follow
  // it, not stay at the centre where it was initialised
  assert.deepEqual(input.pointer(), { x: 0, y: 0 });
  el.h.pointerdown({ clientX: 600, clientY: 150 });
  const afterDown = input.pointer();
  assert.ok(Math.abs(afterDown.x - 0.5) < 1e-9, `ndc x from the tap, got ${afterDown.x}`);
  assert.ok(Math.abs(afterDown.y - 0.5) < 1e-9, `ndc y from the tap, got ${afterDown.y}`);
  el.h.pointerup({ clientX: 600, clientY: 150 });
  assert.deepEqual(input.pointer(), afterDown, 'release keeps the pointer where it was tapped');
});

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

// ---- a tap the reader never made -------------------------------------------
// Each of these fired one, and case 27 is where it showed: a tap anywhere on
// that page shrinks the whole diorama, so the reader arrived to find the scene
// already gone. On the other cases a phantom tap usually hits nothing, which is
// why this went unnoticed rather than unhit.

test('a press abandoned off the canvas does not arm the next release', () => {
  const el = fakeEl();
  const input = makeInput(el);
  let taps = 0;
  input.onTap(() => { taps++; });
  el.h.pointerdown({ clientX: 400, clientY: 300, pointerId: 1 });
  el.h.pointerleave({});                    // walked off and released elsewhere
  // ...and much later, a release over the canvas with no press of its own —
  // pressing a control that sits over the stage and letting go on the picture
  el.h.pointerup({ clientX: 402, clientY: 301, pointerId: 1 });
  assert.equal(taps, 0, 'a release with no live press is not a tap');
});

test('a press does not survive a page turn', () => {
  const el = fakeEl();
  const input = makeInput(el);
  el.h.pointerdown({ clientX: 100, clientY: 100, pointerId: 1 });
  let taps = 0;
  input.clear();                            // the page turns (main.js clearInput)
  input.onTap(() => { taps++; });           // the incoming case registers
  el.h.pointerup({ clientX: 100, clientY: 100, pointerId: 1 });
  assert.equal(taps, 0, 'the incoming page did not get the outgoing page’s press');
});

test('one pointer does not complete another pointer’s press', () => {
  const el = fakeEl();
  const input = makeInput(el);
  let taps = 0;
  input.onTap(() => { taps++; });
  el.h.pointerdown({ clientX: 500, clientY: 200, pointerId: 7 });
  el.h.pointerup({ clientX: 503, clientY: 201, pointerId: 9 });
  assert.equal(taps, 0, 'a second finger’s release is not the first finger’s tap');
  el.h.pointerup({ clientX: 503, clientY: 201, pointerId: 7 });
  assert.equal(taps, 1, 'and the real one still lands');
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
