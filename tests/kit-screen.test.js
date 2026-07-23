import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeScreen } from '../src/kit/screen.js';
import { makeVeranda } from '../src/kit/veranda.js';
import TEXT from '../src/koans/text/mumonkan.js';
import k26 from '../src/koans/k26.js';

const H = 2.4, W = 3.0, N = 12;
const screen = (opts = {}) => makeScreen({ width: W, height: H, slats: N, seed: 26, ...opts });

// the material only — the rail and the invisible tap pane do not move, so they
// would mask the thing under test (where the bottom edge of the screen is)
const slatBox = (s) => {
  const box = new THREE.Box3();
  for (const rod of s.slats) box.expandByObject(rod);
  return box;
};

test('makeScreen hangs a run of slats from a top rail, filling the drop', () => {
  const s = screen();
  assert.equal(s.group.name, 'screen');
  assert.ok(s.group.children.some((c) => c.name === 'rail'), 'a roller at the top');
  assert.equal(s.slats.length, N);
  assert.equal(s.slats[N - 1].name, 'hem', 'the bottom bar reads as an edge');
  assert.equal(s.cords.length, 2, 'a pull cord on each side');

  const box = new THREE.Box3().setFromObject(s.group);
  assert.ok(box.min.y > -0.02, `stands on the sill: ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - H) < 0.02, `the rail tops out at the drop: ${box.max.y}`);
  assert.ok(box.max.x < W * 0.6 && box.min.x > -W * 0.6, 'stays inside its bay');
});

test('setRoll(0) covers the opening, setRoll(1) leaves it open', () => {
  const s = screen();

  s.setRoll(0);
  assert.ok(s.coverHeight() > H * 0.9, `covered when down: ${s.coverHeight()}`);
  const down = slatBox(s);
  assert.ok(down.min.y < 0.05, `material reaches the sill: ${down.min.y}`);
  assert.ok(down.max.y > H * 0.85, 'and runs the whole drop');

  s.setRoll(1);
  assert.ok(s.coverHeight() < H * 0.02, `nothing left across the bay: ${s.coverHeight()}`);
  const up = slatBox(s);
  assert.ok(up.min.y > H * 0.8, `the whole screen is gathered at the rail: ${up.min.y}`);

  // and the bundle is a bundle: it thickens instead of vanishing
  const thickness = up.max.z - up.min.z;
  assert.ok(thickness > (down.max.z - down.min.z) + 0.1, `rolled into a cylinder: ${thickness}`);
});

test('the covered height shrinks from the bottom up as the screen rises', () => {
  const s = screen();
  let cover = Infinity;
  let bottom = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    s.setRoll(t);
    const c = s.coverHeight();
    const b = slatBox(s).min.y;
    assert.ok(c < cover, `cover shrinks at t=${t}: ${c} vs ${cover}`);
    assert.ok(b > bottom, `the bottom edge rises at t=${t}: ${b} vs ${bottom}`);
    assert.ok(Number.isFinite(c) && Number.isFinite(b));
    cover = c;
    bottom = b;
  }
});

test('update eases the roll toward its target instead of snapping', () => {
  const s = screen();
  assert.equal(s.rolled(), 0);
  assert.equal(s.isUp(), false);

  assert.equal(s.toggle(), true, 'a pull asks it up');
  assert.ok(s.isUp());
  assert.equal(s.rolled(), 0, 'but asking does not move it');

  s.update(1 / 60, 0);
  const first = s.rolled();
  assert.ok(first > 0 && first < 0.2, `one frame moves it a little: ${first}`);

  let prev = first;
  for (let i = 1; i < 60; i++) {
    s.update(1 / 60, i / 60);
    assert.ok(s.rolled() >= prev, 'and never runs backwards');
    prev = s.rolled();
  }
  assert.ok(prev > 0.6 && prev <= 1, `a second of pulling gets most of the way: ${prev}`);
  assert.ok(!s.settled(), 'still on its way after a second');

  for (let i = 60; i < 400; i++) s.update(1 / 60, i / 60);
  assert.equal(s.rolled(), 1);
  assert.ok(s.settled());
  assert.ok(s.coverHeight() < 1e-6);

  s.toggle();
  assert.equal(s.isUp(), false);
  s.update(1 / 60, 7);
  assert.ok(s.rolled() < 1 && s.rolled() > 0.8, 'it comes down the same way it went up');
  for (let i = 0; i < 400; i++) s.update(1 / 60, 7 + i / 60);
  assert.equal(s.rolled(), 0);
  assert.ok(s.coverHeight() > H * 0.9, 'and covers the bay again');
});

test('the screen is deterministic and renderer-free', () => {
  const a = screen();
  const b = screen();
  a.roll(); b.roll();
  for (let i = 0; i < 90; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.ok(a.rolled() > 0 && a.rolled() < 1);
  for (let i = 0; i < a.slats.length; i++) {
    assert.ok(a.slats[i].position.distanceTo(b.slats[i].position) < 1e-12, `slat ${i} matches`);
    assert.ok(Number.isFinite(a.slats[i].position.y), 'no NaN anywhere in the run');
  }
});

test('makeVeranda is an open bay on a raised floor', () => {
  const v = makeVeranda({ width: 4.8, depth: 4.4, height: 3.3, deck: 0.34 });
  assert.equal(v.name, 'veranda');
  assert.equal(v.children.filter((c) => c.name === 'post').length, 2, 'two posts, no walls');
  assert.ok(v.children.some((c) => c.name === 'beam'));
  assert.ok(v.children.some((c) => c.name === 'eave'));
  const floor = v.children.find((c) => c.name === 'floor');
  assert.ok(floor, 'a floor to sit on');

  const box = new THREE.Box3().setFromObject(v);
  assert.ok(box.min.y > -0.02, 'on the ground');
  assert.ok(box.max.y > 3.3, 'the eave clears the beam');
  assert.ok(box.min.z < 0.01 && box.max.z > 4.0, 'the floor runs back from the post line');

  // the grass mask has to actually cover the boards
  const marks = v.footprint();
  assert.ok(marks.length >= 16);
  for (const [x, z] of [[0, 2.2], [-2.2, 0.3], [2.2, 4.1]]) {
    assert.ok(marks.some((m) => Math.hypot(x - m.x, z - m.z) < m.r), `covers (${x}, ${z})`);
  }
});

// ---- the case itself ------------------------------------------------------

function stubCtx({ hit = false } = {}) {
  const taps = [];
  return {
    audio: null,
    input: {
      onTap: (fn) => taps.push(fn),
      onHover: () => {},
      raycastFirst: () => (hit ? { point: new THREE.Vector3() } : null),
      clear: () => { taps.length = 0; },
    },
    taps,
  };
}

test('case 26 builds, runs, and leaves the screen down until it is pulled', () => {
  assert.equal(k26.id, 26);
  assert.equal(k26.slug, 'two-monks-roll-up-the-screen');
  assert.equal(k26.text.case, TEXT[26].case, 'prose comes from the book, not the case file');

  const ctx = stubCtx();
  const built = k26.build(ctx);
  assert.ok(built.scene && built.scene.isScene);
  assert.ok(ctx.taps.length > 0, 'there is something to find');

  built.setCamera(null);
  built.onEnter && built.onEnter();
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  for (const v of Object.values(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment stays finite: ${JSON.stringify(frag)}`);
  }
  assert.equal(frag.up, false);
  assert.equal(frag.pulls, 0);
  assert.ok(frag.cover > 2.0, 'the bay is still shut');
  built.onExit && built.onExit();
  built.dispose();
});

test('tapping the screen rolls it up and opens the bay', () => {
  const ctx = stubCtx({ hit: true });
  const built = k26.build(ctx);
  built.setCamera({});                 // any camera will do; the raycast is stubbed
  ctx.taps[0]();
  for (let i = 0; i < 300; i++) built.update(1 / 60, i / 60);

  let frag = built.fragment();
  assert.equal(frag.up, true);
  assert.equal(frag.pulls, 1);
  assert.ok(frag.cover < 0.01, `nothing left across the opening: ${frag.cover}`);
  assert.equal(frag.roll, 1);

  ctx.taps[0]();                       // and down again
  for (let i = 0; i < 300; i++) built.update(1 / 60, 5 + i / 60);
  frag = built.fragment();
  assert.equal(frag.up, false);
  assert.equal(frag.pulls, 2);
  assert.ok(frag.cover > 2.0, 'the screen comes back down');
});
