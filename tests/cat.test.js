import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeCat } from '../src/kit/cat.js';
import { triangles, sectionY, sectionZ, inside } from './helpers/quadruped-probe.js';

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
  // Paw against paw, AT THE GROUND. A leg's whole box includes the shoulder on
  // top of it, and how far that stands forward is the plan's business: bounded
  // against the box, this passed or failed with the plan's leg tops while the
  // paws themselves had not moved.
  const toes = (list) => {
    let lo = Infinity, hi = -Infinity;
    const v = new THREE.Vector3();
    for (const o of list) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (v.y < 0.12) { lo = Math.min(lo, v.z); hi = Math.max(hi, v.z); }
      }
    }
    return { lo, hi };
  };
  const hindToe = toes(hind).hi, frontPaw = toes(front);
  assert.ok(hindToe > frontPaw.lo, `the hind paws reach the front ones: ${hindToe.toFixed(3)} vs ${frontPaw.lo.toFixed(3)}`);
  // and stop at the back of them: a hind paw laid alongside the whole of the
  // front one hides it from the side, and the cat sits on one pair of feet
  const mid = (frontPaw.lo + frontPaw.hi) / 2;
  assert.ok(hindToe < mid, `without coming alongside them: ${hindToe.toFixed(3)} vs the front paw's middle at ${mid.toFixed(3)}`);

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

test('the seated back is one curve bowed out, round at the rump — not a tent', () => {
  const g = sit().group;
  const trunk = triangles(g, (o) => o.name === 'body');
  // the outline behind the cat, read level by level
  const back = [];
  for (let y = 0.045; y < 0.9; y += 0.015) back.push([y, sectionZ(trunk, y).min]);
  const rear = back.reduce((a, b) => (b[1] < a[1] ? b : a));
  const nape = back[back.length - 1];
  assert.ok(rear[0] < 0.3, `widest low, at the rump: the rearmost point stands ${rear[0].toFixed(3)} up`);

  // Against the straight line from the rump to the nape, the back stands out
  // behind it. A pitched standing trunk is that straight line, near enough.
  let bow = 0;
  for (const [y, z] of back) {
    if (y <= rear[0]) continue;
    bow = Math.max(bow, rear[1] + (nape[1] - rear[1]) * (y - rear[0]) / (nape[0] - rear[0]) - z);
  }
  assert.ok(bow > 0.075, `the back bows out ${bow.toFixed(3)} behind the line from rump to nape`);

  // and the rump comes round to the ground instead of being undercut to a
  // corner hanging behind the seat
  const seat = back[0][1];
  assert.ok(seat - rear[1] < 0.09, `the rump turns under by ${(seat - rear[1]).toFixed(3)}`);

  // the outline never jogs: from the rump up, every level stands ahead of
  // the one below it
  for (let i = 1; i < back.length; i++) {
    if (back[i][0] <= rear[0]) continue;
    assert.ok(back[i][1] > back[i - 1][1] - 1e-6, `the back steps out again at ${back[i][0].toFixed(3)}`);
  }
});

test('a seated front leg is a straight column on a block of a paw', () => {
  const g = sit().group;
  const legs = named(g, 'leg').filter((l) => box(l).min.z > -0.2);
  assert.equal(legs.length, 2);
  for (const leg of legs) {
    const tris = triangles(g, (o) => o === leg);
    const depth = (y) => sectionZ(tris, y).depth;
    const shin = depth(0.2);
    // Nothing swells above the wrist. A standing leg cut down to fit carries
    // its shoulder mass with it, and that shows on the breast as a plate.
    for (let y = 0.15; y < box(leg).max.y - 0.03; y += 0.05) {
      assert.ok(depth(y) < 1.3 * shin, `the leg swells to ${depth(y).toFixed(3)} at ${y.toFixed(2)} over a shin of ${shin.toFixed(3)}`);
    }
    // plumb: the column does not lean or bend between the wrist and the chest
    const lean = Math.abs(sectionZ(tris, 0.45).min - sectionZ(tris, 0.15).min);
    assert.ok(lean < 0.02, `the column leans ${lean.toFixed(3)}`);
    // and it stands on a paw that is longer than the leg is thick, forward
    assert.ok(depth(0.03) > 1.12 * shin, `a paw ${depth(0.03).toFixed(3)} long under a shin of ${shin.toFixed(3)}`);
    assert.ok(sectionZ(tris, 0.03).max > sectionZ(tris, 0.2).max + 0.02, 'reaching forward of it');
  }
  // close together under the breast: the gap between them is narrower than a leg
  const [a, b] = legs.map(box).sort((p, q) => p.min.x - q.min.x);
  const wide = a.max.x - a.min.x;
  assert.ok(b.min.x - a.max.x < wide, `the pair stand ${(b.min.x - a.max.x).toFixed(3)} apart, each ${wide.toFixed(3)} wide`);
});

// The tail's girth where a plane square to it through `m` cuts its skin: how
// far the furthest crossing stands from the centre line there. `reach` keeps
// a curled tail's other passes through the same plane out of the answer.
const girthAt = (tris, m, dir, reach) => {
  let r = 0;
  const side = (x, y, z) => (x - m.x) * dir.x + (y - m.y) * dir.y + (z - m.z) * dir.z;
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      const da = side(t[a], t[a + 1], t[a + 2]), db = side(t[b], t[b + 1], t[b + 2]);
      if (da * db > 0 || da === db) continue;
      const k = da / (da - db);
      const d = Math.hypot(t[a] + (t[b] - t[a]) * k - m.x, t[a + 1] + (t[b + 1] - t[a + 1]) * k - m.y, t[a + 2] + (t[b + 2] - t[a + 2]) * k - m.z);
      if (d < reach) r = Math.max(r, d);
    }
  }
  return r;
};
// the girth at every joint, root first
const tailGirths = (cat) => {
  cat.group.updateMatrixWorld(true);
  const tris = triangles(cat.group, (o) => o.name === 'tailseg');
  const at = cat.joints.map((j) => j.getWorldPosition(new THREE.Vector3()));
  return at.map((p, k) => girthAt(tris, p,
    at[Math.min(k + 1, at.length - 1)].clone().sub(at[Math.max(k - 1, 0)]).normalize(), 0.12));
};
const stirred = (cat, frames) => {
  cat.stir();
  for (let i = 0; i < frames; i++) cat.update(1 / 60, i / 60);
  return cat;
};

test('the tail is one skin from root to a closed end: no joint shows on it, at rest or curled', () => {
  // A piece per joint leaves each piece's sawn end standing out of the next
  // wherever the tail bends: a collar at every joint. One skin cannot.
  for (const [cat, slack] of [[sit(), 1], [stand(), 1], [stirred(sit(), 138), 1.15]]) {
    const skins = named(cat.group, 'tailseg');
    assert.equal(skins.length, 1, 'the tail is drawn as one mesh');

    // closed everywhere: every edge is shared by exactly two faces
    const idx = skins[0].geometry.index;
    const edges = new Map();
    for (let i = 0; i < idx.count; i += 3) {
      for (let e = 0; e < 3; e++) {
        const p = idx.getX(i + e), q = idx.getX(i + (e + 1) % 3);
        const key = p < q ? p + ':' + q : q + ':' + p;
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok([...edges.values()].every((n) => n === 2), 'no open end and no loose face');

    // one taper: the girth only ever falls from joint to joint, and never by a
    // step. Curled hard, a cut square to the joints is no longer square to the
    // skin and reads a little full, which is what `slack` allows for.
    const r = tailGirths(cat);
    for (let k = 0; k + 1 < r.length; k++) {
      assert.ok(r[k + 1] < slack * r[k] + 0.003, `a bead at joint ${k + 1}: ${r[k + 1].toFixed(4)} after ${r[k].toFixed(4)}`);
      assert.ok(r[k] - r[k + 1] < 0.02, `a step at joint ${k + 1}: ${r[k].toFixed(4)} down to ${r[k + 1].toFixed(4)}`);
    }
    assert.ok(r[0] > 1.2 * r[2], `fullest where it leaves the rump: ${r[0].toFixed(4)} against ${r[2].toFixed(4)} two joints out`);
    assert.ok(r[r.length - 1] < 0.8 * r[1], `and it tapers on the way to the end: ${r[r.length - 1].toFixed(4)} of ${r[1].toFixed(4)}`);
    assert.ok(r[r.length - 1] > 0.5 * r[1], `without dwindling to a wire: ${r[r.length - 1].toFixed(4)} of ${r[1].toFixed(4)}`);
  }
});

test('the tail leaves the body at full girth from inside it, at rest and through a stir', () => {
  // The skin does not start at the rump's surface. It starts on a ring ahead
  // of the root, and that ring has to be the tail's full girth and wholly
  // under the body's surface whatever the tail is doing — a root that is a
  // point, or a ring the surface cuts, shows its end the moment the tail turns.
  for (const cat of [sit(), stand()]) {
    const g = cat.group;
    const body = triangles(g, (o) => o.name === 'body');
    const skin = g.getObjectByName('tailseg');
    const p = skin.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    cat.stir();
    for (let f = 0; f <= 280; f += 20) {
      for (let i = 0; i < 20; i++) cat.update(1 / 60, (f + i) / 60);
      g.updateMatrixWorld(true);
      const rootGirth = tailGirths(cat)[0];
      let sunk = 0, spread = 0;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        // the skin is laid out in the tail root's own frame, +y along the
        // tail: anything well behind zero is ahead of the root, in the cat
        if (v.y > -0.05) continue;
        spread = Math.max(spread, Math.hypot(v.x, v.z));
        sunk++;
        assert.ok(inside(body, v.applyMatrix4(skin.matrixWorld)), `frame ${f}: the buried end of the tail shows outside the body`);
      }
      assert.ok(sunk >= 6, `frame ${f}: a whole ring is buried ahead of the root: ${sunk} points`);
      assert.ok(spread > 0.95 * rootGirth, `frame ${f}: buried at full girth: ${spread.toFixed(4)} against ${rootGirth.toFixed(4)} at the root`);
    }
  }
});

test('the tail is a long line with a hook in it', () => {
  const cat = sit();
  cat.group.updateMatrixWorld(true);

  // the hook: the far half of the tail has turned well off the cat's own axis
  const at = (j) => j.getWorldPosition(new THREE.Vector3());
  const j = cat.joints;
  const mid = at(j[3]), end = at(j[j.length - 1]);
  const turn = Math.abs(Math.atan2(end.x - mid.x, -(end.z - mid.z)));
  assert.ok(turn > 0.5, `the far half turns ${turn.toFixed(2)} rad off straight back`);
  assert.ok(turn < 1.5, `but it stays a line behind the cat, not a wrap around it: ${turn.toFixed(2)}`);
  const tail = box(cat.tail);
  assert.ok(tail.max.z - tail.min.z > 0.6, `still long behind the rump: ${(tail.max.z - tail.min.z).toFixed(3)}`);

  // along the ground and then up: the near half lies low, the far end curls
  // well clear of it
  const root = at(cat.tail).y;
  assert.ok(Math.abs(mid.y - root) < 0.08, `the near half lies along the ground: ${(mid.y - root).toFixed(3)}`);
  assert.ok(tail.max.y > root + 0.2, `the tip curls up off it: ${(tail.max.y - root).toFixed(3)}`);

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
