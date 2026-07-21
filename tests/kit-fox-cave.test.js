import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeFox } from '../src/kit/fox.js';
import { makeCave } from '../src/kit/cave.js';
import k2 from '../src/koans/k2.js';

const box = (o) => { o.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(o); };
const part = (root, name) => { const o = root.getObjectByName(name); assert.ok(o, `has a ${name}`); return o; };
const all = (root, name) => {
  const out = [];
  root.traverse((o) => { if (o.name === name && !o.userData.isOutline) out.push(o); });
  return out;
};

// The same capsule reconstruction kit-fauna.test.js runs on the dog and the
// buffalo: a leg at hip offset x meets the barrel HIGHER than the barrel's
// lowest point, so a leg sized to the belly hangs in the air.
function assertLegsConnect(root, label) {
  const bb = box(part(root, 'body'));
  const R = (bb.max.y - bb.min.y) / 2;
  const cy = (bb.max.y + bb.min.y) / 2;
  const halfL = Math.max(0, (bb.max.z - bb.min.z) / 2 - R);
  const legs = all(root, 'leg');
  assert.equal(legs.length, 4, `${label} has four legs`);
  for (const leg of legs) {
    const lb = box(leg);
    const top = new THREE.Vector3((lb.min.x + lb.max.x) / 2, lb.max.y, (lb.min.z + lb.max.z) / 2);
    const az = Math.max(-halfL, Math.min(halfL, top.z));
    const d = Math.hypot(top.x, top.y - cy, top.z - az);
    assert.ok(d < R, `${label} leg top is inside the barrel: ${d.toFixed(3)} vs ${R.toFixed(3)}`);
    assert.ok(lb.min.y < 0.02, `${label} leg reaches the ground: ${lb.min.y.toFixed(3)}`);
  }
}

test('makeFox is a grounded quadruped with a muzzle and big ears', () => {
  const f = makeFox({ height: 0.45 });
  assert.equal(f.group.name, 'fox');
  for (const n of ['body', 'head', 'snout', 'tail', 'neck']) part(f.group, n);
  assert.equal(all(f.group, 'ear').length, 2, 'two ears');
  assertLegsConnect(f.group, 'fox');

  const b = box(f.group);
  assert.ok(b.min.y > -0.02, `on the ground: ${b.min.y}`);
  assert.ok(b.max.y > 0.4 && b.max.y < 0.75, `fox-sized: ${b.max.y}`);

  // the ears carry the head's outline — they must clear the skull, not sit in it
  const head = box(part(f.group, 'head'));
  const earTop = Math.max(...all(f.group, 'ear').map((e) => box(e).max.y));
  assert.ok(earTop > head.max.y + 0.05, `ears stand above the skull: ${earTop} vs ${head.max.y}`);

  // and the muzzle is the thing sticking out in front, not the skull
  assert.ok(box(part(f.group, 'snout')).max.z > head.max.z + 0.02, 'the muzzle leads');
});

test('the fox is longer and lower than the dog it is built from', () => {
  const f = makeFox({ height: 0.5 });
  const b = box(f.group);
  const body = box(part(f.group, 'body'));
  assert.ok((b.max.z - b.min.z) > 2.0 * b.max.y, `a fox is a line: ${(b.max.z - b.min.z).toFixed(2)} long, ${b.max.y.toFixed(2)} tall`);
  assert.ok(body.min.y < 0.5 * 0.46, `the belly is carried low: ${body.min.y.toFixed(3)}`);
});

test('the brush is thick, carried low, and trails well behind the rump', () => {
  // The tail is most of what makes a fox a fox. The dog's is cocked UP and thin;
  // if this one ever ends up looking like that the animal stops reading.
  const f = makeFox({ height: 0.5 });
  const tail = box(part(f.group, 'tail'));
  const body = box(part(f.group, 'body'));
  assert.ok(tail.max.y < body.max.y, `carried below the back line: ${tail.max.y.toFixed(3)} vs ${body.max.y.toFixed(3)}`);
  assert.ok(tail.min.y > 0.02, `and off the ground: ${tail.min.y.toFixed(3)}`);
  assert.ok(tail.min.z < body.min.z - 0.5 * 0.5, `trails behind the rump: ${tail.min.z.toFixed(3)} vs ${body.min.z.toFixed(3)}`);
  const thickness = tail.max.x - tail.min.x;
  const barrel = body.max.x - body.min.x;
  assert.ok(thickness > 0.5 * barrel, `bushy, not whippy: ${thickness.toFixed(3)} vs a ${barrel.toFixed(3)} barrel`);
});

test('a tapped fox flicks an ear, turns its head and sweeps the brush', () => {
  const f = makeFox({ height: 0.5, seed: 2 });
  const drive = (from, steps) => {
    let peakHead = 0, peakTail = 0, peakEar = 0;
    for (let i = 0; i < steps; i++) {
      f.update(1 / 60, from + i / 60);
      peakHead = Math.max(peakHead, Math.abs(f.head.rotation.y));
      peakTail = Math.max(peakTail, Math.abs(f.tail.rotation.y));
      peakEar = Math.max(peakEar, ...f.ears.map((e) => Math.abs(e.rotation.x)));
    }
    return { peakHead, peakTail, peakEar };
  };

  const idle = drive(0, 120);
  assert.ok(idle.peakHead < 0.12, `at rest the head only drifts: ${idle.peakHead.toFixed(3)}`);
  assert.ok(idle.peakTail < 0.12, `and the brush only drifts: ${idle.peakTail.toFixed(3)}`);

  assert.equal(f.noticed(), 0);
  f.notice();
  const stirred = drive(2, 90);
  assert.equal(f.noticed(), 1);
  assert.ok(stirred.peakHead > 0.30, `the head comes round: ${stirred.peakHead.toFixed(3)}`);
  assert.ok(stirred.peakTail > 0.25, `the brush sweeps: ${stirred.peakTail.toFixed(3)}`);
  assert.ok(stirred.peakEar > idle.peakEar + 0.15, `an ear flicks: ${stirred.peakEar.toFixed(3)} vs ${idle.peakEar.toFixed(3)}`);

  // and it settles back to nothing rather than holding the pose
  drive(4, 240);
  assert.equal(f.stir(), 0, 'the response spends itself');
  assert.ok(Math.abs(f.headYaw()) < 0.12, `back to a fox sitting still: ${f.headYaw().toFixed(3)}`);
});

test('the fox is deterministic and rests where it is told to look', () => {
  const a = makeFox({ height: 0.5, seed: 7 });
  const b = makeFox({ height: 0.5, seed: 7 });
  a.notice(); b.notice();
  for (let i = 0; i < 200; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  assert.equal(a.headYaw(), b.headYaw(), 'same seed, same pose');
  assert.equal(a.tailYaw(), b.tailYaw());

  const c = makeFox({ height: 0.5, seed: 7 });
  c.setLook(-0.42);
  assert.ok(Math.abs(c.head.rotation.y + 0.42) < 0.1, `the resting look applies at once: ${c.head.rotation.y}`);
});

test('makeCave is a grounded rock face with a dark opening', () => {
  const c = makeCave({ width: 2.4, height: 2.4, depth: 1.9 });
  assert.equal(c.name, 'cave');
  const throat = part(c, 'throat');
  part(c, 'apron');
  part(c, 'brow');
  assert.equal(all(c, 'jamb').length, 2, 'a jamb either side of the mouth');
  assert.ok(all(c, 'shoulder').length + all(c, 'bank').length >= 2, 'a hillside behind it');

  const b = box(c);
  assert.ok(b.min.y < 0.01, 'it stands from the ground, not above it');
  assert.ok(b.min.y > -2.4 * 0.4, `and is not sunk out of sight: ${b.min.y.toFixed(2)}`);
  assert.ok(b.max.y > 2.4 * 0.9 && b.max.y < 2.4 * 1.5, `roughly the height asked for: ${b.max.y.toFixed(2)}`);
  assert.ok((b.max.x - b.min.x) > 2.4 * 1.5, 'a rock face, wider than its mouth');

  // the opening has to read as depth, which means it sits near INK while the
  // rock stays up on the wash ramp
  const lum = (m) => 0.299 * m.material.color.r + 0.587 * m.material.color.g + 0.114 * m.material.color.b;
  const rock = Math.min(...all(c, 'jamb').map(lum), lum(part(c, 'brow')));
  assert.ok(lum(throat) < rock * 0.4, `the mouth is dark: ${lum(throat).toFixed(3)} vs rock ${rock.toFixed(3)}`);
  assert.ok(lum(part(c, 'apron')) > lum(throat), 'the threshold catches more light than the throat');

  // and the dark is set back behind the rock that frames it
  assert.ok(box(throat).max.z < Math.max(...all(c, 'jamb').map((j) => box(j).max.z)),
    'the opening is recessed, not pasted on the front');
});

test('the cave keepout follows the cave, and the grass mask is only its floor', () => {
  const c = makeCave({ width: 2.4, height: 2.4, depth: 1.9 });
  c.position.set(-2, 0, -4);
  c.rotation.y = Math.PI / 2;                       // mouth swung to face +x
  const foot = c.footprint(0.5);
  assert.ok(foot.length >= 6, 'the whole mass is masked');
  for (const k of foot) {
    assert.ok(Number.isFinite(k.x) && Number.isFinite(k.z) && k.r > 0);
    assert.ok(Math.hypot(k.x + 2, k.z + 4) < 12, 'circles stay with the cave');
  }
  // rotated a quarter turn, the depth of the mass now runs along -x
  const deepest = foot.reduce((a, k) => (k.x < a.x ? k : a));
  assert.ok(deepest.x < -3.5, `the mass reads deep along +x's normal: ${deepest.x.toFixed(2)}`);

  const floor = c.floor(0.1);
  assert.ok(floor.length > 0 && floor.length < foot.length, 'grass is masked only where stone covers ground');
});

// The module contract, driven the way tests/chapter.test.js drives the staged
// chapter. Case 2 is not in LOADERS yet, so this stands in until it is wired.
function stubCtx() {
  const taps = [];
  return {
    audio: null,
    input: { onTap: (fn) => taps.push(fn), onHover: () => {}, raycastFirst: () => null, clear: () => {} },
    taps,
  };
}

test('case 2 builds, runs, and reports a finite fragment', () => {
  assert.equal(k2.id, 2);
  assert.equal(k2.slug, 'hyakujo-s-fox');
  assert.ok(k2.title && k2.accent);
  for (const key of ['case', 'comment', 'verse']) {
    assert.ok(typeof k2.text[key] === 'string' && k2.text[key].length > 0, `text.${key}`);
  }

  const ctx = stubCtx();
  const built = k2.build(ctx);
  assert.ok(built.scene && built.scene.isScene);
  assert.ok(ctx.taps.length > 0, 'the fox is there to be found');

  built.setCamera(null);
  built.onEnter();
  ctx.taps[0]();                                   // a tap with no camera must be harmless
  for (let i = 0; i < 120; i++) built.update(1 / 60, i / 60);
  const frag = built.fragment();
  assert.ok(Object.keys(frag).length > 0);
  for (const v of Object.values(frag)) {
    assert.ok(Number.isFinite(v) || typeof v === 'boolean', `fragment stays finite: ${JSON.stringify(frag)}`);
  }
  built.onExit();
  built.dispose();
});

test('the fox stands clear of the cave it came out of', () => {
  // The brush trails a long way behind a fox, and the cave's threshold stone is
  // right there — they must not intersect, at any azimuth.
  const built = k2.build(stubCtx());
  const fox = built.scene.getObjectByName('fox');
  const cave = built.scene.getObjectByName('cave');
  assert.ok(fox && cave);
  const apron = box(cave.getObjectByName('apron'));
  const fb = box(fox);
  assert.ok(!apron.intersectsBox(fb), 'the fox is not standing inside the threshold stone');
  // but it is still AT the mouth, not out in the meadow
  assert.ok(fox.position.distanceTo(cave.position) < 3.0, 'the fox is at the cave, not away from it');
});
