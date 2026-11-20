import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCat } from '../src/kit/cat.js';
import { triangles, sectionY, inside } from './helpers/quadruped-probe.js';

// The cat's own silhouette, read off the meshes at height 1 so every number
// below is a proportion. The body plan it rides is pinned in
// tests/quadruped.test.js and its behaviour in tests/k14-cat.test.js; this
// file holds what makes the shape a CAT, and a sitting one.

const box = (o) => {
  o.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(o, true);
};
const named = (root, name) => {
  const out = [];
  root.traverse((o) => { if (o.name === name) out.push(o); });
  return out;
};
// Half the animal's width where the plane z = const cuts a set of triangles:
// the top-view counterpart of sectionY, exact for the same reason.
const halfWidthAt = (tris, z) => {
  let w = 0;
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      const za = t[a + 2], zb = t[b + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      w = Math.max(w, Math.abs(t[a] + (t[b] - t[a]) * ((z - za) / (zb - za))));
    }
  }
  return w;
};
const sit = () => makeCat({ height: 1, pose: 'sit' });
const stand = () => makeCat({ height: 1, pose: 'stand' });

test('the head is one small wedge, not a ball with a muzzle on it', () => {
  for (const cat of [sit(), stand()]) {
    const g = cat.group;
    assert.equal(named(g, 'head').length, 1);
    assert.equal(named(g, 'snout').length, 0, 'the muzzle is the front of the skull, not a second part');

    const head = box(g.getObjectByName('head'));
    const size = head.getSize(new THREE.Vector3());
    // wider than it is deep, and barely longer than it is wide
    assert.ok(size.y < 0.8 * size.x, `a skull flatter than a ball: ${size.y.toFixed(3)} deep, ${size.x.toFixed(3)} wide`);
    assert.ok(size.z < 1.1 * size.x, `and short: ${size.z.toFixed(3)} long`);

    // the wedge: across the muzzle it is well under the width at the cheek
    const tris = triangles(g, (o) => o.name === 'head');
    const at = (f) => halfWidthAt(tris, head.min.z + f * size.z);
    const cheek = Math.max(at(0.3), at(0.4), at(0.5));
    assert.ok(at(0.85) < 0.6 * cheek, `it narrows to the nose: ${at(0.85).toFixed(3)} of ${cheek.toFixed(3)}`);

  }
  // small against the body it sits on, in the pose the book stages
  const g = sit().group;
  const head = box(g.getObjectByName('head')).getSize(new THREE.Vector3());
  const body = box(g.getObjectByName('body')).getSize(new THREE.Vector3());
  assert.ok(head.x < 0.7 * body.x, `head ${head.x.toFixed(3)} wide on a body ${body.x.toFixed(3)} wide`);
});

test('the ears root on the skull, stand clear of it, and leave a crown between them', () => {
  const cat = stand();
  const g = cat.group;
  const skull = triangles(g, (o) => o.name === 'head');
  const head = box(g.getObjectByName('head'));
  const ears = named(g, 'ear');
  assert.equal(ears.length, 2);
  for (const ear of ears) {
    const at = ear.getWorldPosition(new THREE.Vector3());
    assert.ok(inside(skull, at), `an ear's root is buried in the skull: (${at.x.toFixed(3)}, ${at.y.toFixed(3)}, ${at.z.toFixed(3)})`);
    assert.ok(box(ear).max.y > head.max.y + 0.08, 'and its tip stands well above the crown');
  }
  // the two tips: the highest vertex of each ear
  const tips = ears.map((ear) => {
    const p = ear.geometry.getAttribute('position');
    const v = new THREE.Vector3(), best = new THREE.Vector3(0, -Infinity, 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(ear.matrixWorld);
      if (v.y > best.y) best.copy(v);
    }
    return best;
  });
  const apart = Math.abs(tips[0].x - tips[1].x);
  const wide = head.max.x - head.min.x;
  assert.ok(apart > 0.85 * wide, `the tips stand as far apart as the head is wide: ${apart.toFixed(3)} of ${wide.toFixed(3)}`);
  // and the ears are small triangles, not horns: no taller than half the skull's width
  const tall = box(ears[0]).max.y - head.max.y;
  assert.ok(tall < 0.5 * wide, `ears ${tall.toFixed(3)} over a skull ${wide.toFixed(3)} wide`);
});

test('the neck arrives in the skull: one line from the ears to the rump', () => {
  for (const [label, cat] of [['sit', sit()], ['stand', stand()]]) {
    const g = cat.group;
    const body = triangles(g, (o) => o.name === 'body');
    const centre = cat.skull.getWorldPosition(new THREE.Vector3());
    assert.ok(inside(body, centre), `${label}: the trunk's own loft ends inside the head`);

    // No notch behind the head. Walking the side profile forward from the hip
    // to the crown, the top of the outline never drops back by more than a
    // facet — a skull perched on a chest leaves a nick at the nape.
    const all = triangles(g, (o) => o.name === 'body' || o.name === 'head');
    const head = box(g.getObjectByName('head'));
    const z0 = box(g.getObjectByName('body')).min.z + 0.25, z1 = (head.min.z + head.max.z) / 2;
    let high = -Infinity, nick = 0;
    for (let i = 0; i <= 120; i++) {
      const top = sectionY(all, z0 + (z1 - z0) * (i / 120)).max;
      nick = Math.max(nick, high - top);
      high = Math.max(high, top);
    }
    if (label === 'sit') assert.ok(nick < 0.012, `${label}: the nape dips ${nick.toFixed(3)} behind the head`);

    // and it stays inside through the whole of a stir, turned and cocked over
    cat.stir();
    const tris = () => triangles(g, (o) => o.name === 'head');
    for (let i = 0; i < 280; i++) {
      cat.update(1 / 60, i / 60);
      if (i % 20 !== 0) continue;
      const end = cat.skull.getWorldPosition(new THREE.Vector3());
      assert.ok(inside(tris(), end), `${label}: the neck's end is still inside the skull at frame ${i}`);
    }
  }
});

test('the seated cat is a pear on its haunches, not a standing animal folded in half', () => {
  const cat = sit();
  const g = cat.group;
  const legs = named(g, 'leg');
  const hind = legs.filter((l) => box(l).min.z < -0.2);
  const front = legs.filter((l) => !hind.includes(l));
  assert.equal(hind.length, 2);
  assert.equal(front.length, 2);

  const span = (list) => {
    const b = new THREE.Box3();
    for (const o of list) b.union(box(o));
    return b;
  };
  const haunch = span(hind), paws = span(front);
  const body = box(g.getObjectByName('body'));
  const head = box(g.getObjectByName('head'));
  const width = (b) => b.max.x - b.min.x;

  // from the front: widest at the base, narrowing to a head half that width
  assert.ok(width(haunch) > 1.12 * width(body), `the haunches stand wider than the trunk: ${width(haunch).toFixed(3)} vs ${width(body).toFixed(3)}`);
  assert.ok(width(head) < 0.62 * width(haunch), `and the head is narrow over them: ${width(head).toFixed(3)} vs ${width(haunch).toFixed(3)}`);

  // each haunch is a mass lying along the ground: longer than it is tall, and
  // it reaches from behind the hip to beside the front feet
  for (const l of hind) {
    const b = box(l).getSize(new THREE.Vector3());
    assert.ok(b.z > 1.15 * b.y, `a haunch lies along the ground: ${b.z.toFixed(3)} long, ${b.y.toFixed(3)} tall`);
  }
  assert.ok(haunch.max.z > paws.min.z, 'the hind paws reach the front legs');
  assert.ok(haunch.max.z < paws.max.z + 0.02, 'without overtaking them');

  // from the side: nothing but the cat between the rump and the front paws.
  // A rescaled standing hind leg leaves the rump hanging in the air behind it.
  const solid = triangles(g, (o) => o.name === 'body' || o.name === 'leg');
  for (let i = 0; i <= 40; i++) {
    const z = body.min.z + 0.1 + (paws.min.z - body.min.z - 0.1) * (i / 40);
    const low = sectionY(solid, z).min;
    assert.ok(low < 0.06, `daylight under the cat at z = ${z.toFixed(3)}: ${low.toFixed(3)}`);
  }

  // and the haunch never crests the back: the slope from nape to rump is the
  // trunk's own line
  const trunk = triangles(g, (o) => o.name === 'body');
  const thighs = triangles(g, (o) => hind.includes(o));
  for (let i = 1; i < 20; i++) {
    const z = haunch.min.z + (Math.min(haunch.max.z, body.max.z) - haunch.min.z) * (i / 20);
    const back = sectionY(trunk, z).max, thigh = sectionY(thighs, z).max;
    if (!Number.isFinite(back)) continue;
    assert.ok(thigh < back, `the haunch stands above the back at z = ${z.toFixed(3)}`);
  }

  // settled: taller than it is long on the ground, tail aside
  const base = Math.max(paws.max.z, haunch.max.z) - body.min.z;
  const tall = box(g.getObjectByName('head')).max.y;
  assert.ok(tall > 1.2 * base, `a compact sit: ${tall.toFixed(3)} tall on a base of ${base.toFixed(3)}`);
});

test('the tail is a long tapering line with a hook in it', () => {
  const cat = sit();
  cat.group.updateMatrixWorld(true);
  const segs = named(cat.group, 'tailseg');
  const thick = (m) => {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    return b.max.x - b.min.x;                         // across the segment, in its own frame
  };
  const rootT = thick(segs[0]);
  // the far end of the last segment alone: the tail closes rather than stopping sawn off
  const last = segs[segs.length - 1].geometry.getAttribute('position');
  let endR = 0, top = -Infinity;
  for (let i = 0; i < last.count; i++) top = Math.max(top, last.getY(i));
  for (let i = 0; i < last.count; i++) {
    if (last.getY(i) > top - 1e-6) endR = Math.max(endR, Math.hypot(last.getX(i), last.getZ(i)));
  }
  assert.ok(2 * endR < 0.25 * rootT, `the tip closes toward a point: ${(2 * endR).toFixed(4)} against a root of ${rootT.toFixed(4)}`);
  assert.ok(thick(segs[segs.length - 2]) < 0.8 * rootT, 'and it tapers on the way there');

  // the hook: the far half of the tail has turned well off the cat's own axis
  const at = (j) => j.getWorldPosition(new THREE.Vector3());
  const j = cat.joints;
  const mid = at(j[3]), end = at(j[j.length - 1]);
  const turn = Math.abs(Math.atan2(end.x - mid.x, -(end.z - mid.z)));
  assert.ok(turn > 0.5, `the far half turns ${turn.toFixed(2)} rad off straight back`);
  assert.ok(turn < 1.5, `but it stays a line behind the cat, not a wrap around it: ${turn.toFixed(2)}`);
  const tail = box(cat.tail);
  assert.ok(tail.max.z - tail.min.z > 0.6, `still long behind the rump: ${(tail.max.z - tail.min.z).toFixed(3)}`);

  // either side, by seed — a book of cats does not all hook the same way
  const sides = new Set();
  for (let seed = 1; seed <= 24; seed++) {
    const c = makeCat({ height: 1, seed });
    c.group.updateMatrixWorld(true);
    sides.add(Math.sign(c.joints[c.joints.length - 1].getWorldPosition(new THREE.Vector3()).x));
  }
  assert.deepEqual([...sides].sort(), [-1, 1]);

  // a standing cat carries it straight and high instead
  const up = stand();
  up.group.updateMatrixWorld(true);
  const tip = up.joints[up.joints.length - 1].getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(tip.x) < 0.1, `no hook standing: ${tip.x.toFixed(3)}`);
  assert.ok(tip.y > box(up.group.getObjectByName('body')).max.y, 'and the tip rides above the back');
});

test('the cat keeps its footprint: about as tall seated as it was, and the sitting animal is the taller one', () => {
  const s = box(sit().group), u = box(stand().group);
  assert.ok(s.max.y > 1.15 && s.max.y < 1.3, `seated ear tips at ${s.max.y.toFixed(3)} heights`);
  assert.ok(s.max.y > u.max.y + 0.04, `seated ${s.max.y.toFixed(3)} over standing ${u.max.y.toFixed(3)}`);
  assert.ok(Math.abs(s.min.y) < 1e-3 && Math.abs(u.min.y) < 1e-3, 'both on the ground');
});

test('the seated pose reads its joins off the posed trunk at any size', () => {
  // The joins are measured from the mesh, so nothing about them may depend on
  // the size the cases happen to use.
  for (const height of [0.32, 0.44, 0.5, 1.7]) {
    const cat = makeCat({ height, pose: 'sit' });
    const g = cat.group;
    const body = triangles(g, (o) => o.name === 'body');
    for (const leg of named(g, 'leg')) {
      const at = leg.getWorldPosition(new THREE.Vector3());
      assert.ok(inside(body, at), `height ${height}: a leg's origin is inside the trunk`);
      assert.ok(Math.abs(box(leg).min.y) < 0.004 * height, `height ${height}: and its paw is on the ground: ${box(leg).min.y}`);
    }
    const all = box(g);
    assert.ok(Math.abs(all.max.y / height - box(sit().group).max.y) < 1e-3, `height ${height}: the same cat, scaled`);
    const root = cat.tail.getWorldPosition(new THREE.Vector3());
    assert.ok(inside(body, root), `height ${height}: the tail's root is buried in the rump`);
  }
});
