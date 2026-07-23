import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeOdoshi } from '../src/kit/odoshi.js';
import { bambooPartials, ODOSHI } from '../src/audio/synths.js';

// drive across sim time, recording events with their times
function run(o, secs, t0 = 0, step = 1 / 60) {
  for (let i = 0; i * step < secs; i++) o.update(step, t0 + i * step);
  return t0 + secs;
}

test('bambooPartials is a knock, not a bell: few, loose, fast-dying', () => {
  const p = bambooPartials(220, 0.35);
  assert.equal(p.length, 4);
  const ratios = p.map((x) => x.freq / 220);
  assert.ok(ratios.some((r) => Math.abs(r - Math.round(r)) > 0.05), 'loose series');
  assert.ok(Math.abs(p[0].decay - 0.35) < 1e-9, 'fundamental keeps the passed decay');
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].decay < p[i - 1].decay);
    assert.ok(p[i].amp < p[i - 1].amp);
  }
  assert.ok(p[0].decay < 1, 'a knock is over quickly');
});

test('the cycle knocks on a jittered clock, deterministically', () => {
  const a = [], b = [];
  const mk = (log) => makeOdoshi({
    seed: 7, phase: 0,
    onPour: () => log.push(['pour', +cur.toFixed(3)]),
    onKnock: (f) => log.push(['knock', +cur.toFixed(3), f]),
  });
  let cur = 0;
  const oa = mk(a);
  for (let i = 0; i * (1 / 60) < 200; i++) { cur = i / 60; oa.update(1 / 60, cur); }
  cur = 0;
  const ob = mk(b);
  for (let i = 0; i * (1 / 60) < 200; i++) { cur = i / 60; ob.update(1 / 60, cur); }

  assert.deepEqual(a, b, 'same seed, same call sequence, same music');
  const mains = a.filter((e) => e[0] === 'knock' && e[2] === 1).map((e) => e[1]);
  assert.ok(mains.length >= 4, `too few knocks in 200s: ${mains.length}`);
  // intervals stay inside the jitter band around the default period
  const gaps = mains.slice(1).map((t, i) => t - mains[i]);
  for (const g of gaps) {
    assert.ok(g > ODOSHI.period * 0.8 && g < ODOSHI.period * 1.2, `interval out of band: ${g}`);
  }
  // every main knock is preceded by a pour about POUR_S earlier, and followed
  // by its softer bounce
  for (const t of mains) {
    assert.ok(a.some((e) => e[0] === 'pour' && t - e[1] > 1.0 && t - e[1] < 1.8), `no pour before knock at ${t}`);
    assert.ok(a.some((e) => e[0] === 'knock' && e[2] < 1 && e[1] > t && e[1] < t + 0.3), `no bounce after knock at ${t}`);
  }
  assert.equal(oa.knocks(), a.filter((e) => e[0] === 'knock').length);
});

test('two in one garden never knock together', () => {
  const times = (seed) => {
    const log = [];
    let cur = 0;
    const o = makeOdoshi({ seed, onKnock: (f) => { if (f === 1) log.push(cur); } });
    for (let i = 0; i * (1 / 60) < 200; i++) { cur = i / 60; o.update(1 / 60, cur); }
    return log;
  };
  const ta = times(1), tb = times(2);
  assert.ok(ta.length > 0 && tb.length > 0);
  assert.notDeepEqual(ta, tb);
});

test('a tap tips it without waiting out the fill', () => {
  let knocked = -1, cur = 0;
  const o = makeOdoshi({ seed: 7, phase: 0, onKnock: (f) => { if (f === 1 && knocked < 0) knocked = cur; } });
  for (let i = 0; i * (1 / 60) < 3; i++) { cur = i / 60; o.update(1 / 60, cur); }   // still filling
  assert.equal(knocked, -1, 'knocked during the first fill');
  o.tip();
  for (let i = 0; i * (1 / 60) < 4; i++) { cur = 3 + i / 60; o.update(1 / 60, cur); }
  assert.ok(knocked > 3 && knocked < 6, `the tap did not tip it: ${knocked}`);
  assert.ok(o.pickTargets().length > 0);
});

test('grounded, named, and the arm actually moves through a cycle', () => {
  const o = makeOdoshi({ seed: 3, phase: 0 });
  for (const name of ['post', 'axle', 'arm', 'tube', 'node', 'stone', 'flume', 'odoshi-hit']) {
    assert.ok(o.group.getObjectByName(name), `${name} missing`);
  }
  o.update(1 / 60, 0);                      // settle the arm into its rest pose
  o.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o.group);
  assert.ok(box.min.y > -0.02, `digs into the ground: ${box.min.y}`);
  assert.ok(box.max.y > 0.4, 'stands at garden height');

  // the fill is deliberately motionless (stillness makes the tip an event),
  // so sample across a WHOLE cycle to see the pour and the bounce
  const arm = o.group.getObjectByName('arm');
  const angles = new Set();
  for (let i = 0; i * (1 / 60) < 45; i++) { o.update(1 / 60, i / 60); angles.add(+arm.rotation.z.toFixed(3)); }
  assert.ok(angles.size > 10, `the arm never moves: ${angles.size} distinct poses`);
});

test('the butt rests ON the stone and the bounce never swings through it', () => {
  const o = makeOdoshi({ seed: 3, phase: 0 });
  const arm = o.group.getObjectByName('arm');
  const stone = o.group.getObjectByName('stone');

  // mid-fill: the arm is at contact
  o.update(1 / 60, 1);
  const restAngle = arm.rotation.z;
  o.group.updateMatrixWorld(true);
  const buttEnd = arm.localToWorld(new THREE.Vector3(0.12 - 1.15 / 2, 0, 0));
  const stoneBox = new THREE.Box3().setFromObject(stone);
  assert.ok(Math.abs((buttEnd.y - 0.075) - stoneBox.max.y) < 0.02,
    `the butt floats or sinks: underside ${(buttEnd.y - 0.075).toFixed(3)} vs stone top ${stoneBox.max.y.toFixed(3)}`);

  // across a full cycle the arm never rotates past contact — the stone is a
  // wall, not a suggestion (the first cut swung through it on every bounce)
  let maxA = -Infinity;
  for (let i = 0; i * (1 / 60) < 45; i++) {
    o.update(1 / 60, 1 + i / 60);
    maxA = Math.max(maxA, arm.rotation.z);
  }
  assert.ok(o.knocks() >= 2, 'the cycle never completed');
  assert.ok(maxA <= restAngle + 1e-9, `swings past contact: ${maxA} vs ${restAngle}`);
});
