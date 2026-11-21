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
// How far out a line across the animal through (y, z) leaves a set of
// triangles: the side view's counterpart of the two sections.
const reachAt = (tris, y, z) => {
  let out = -Infinity;
  for (const t of tris) {
    const d = (t[5] - t[8]) * (t[1] - t[7]) + (t[7] - t[4]) * (t[2] - t[8]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((t[5] - t[8]) * (y - t[7]) + (t[7] - t[4]) * (z - t[8])) / d;
    const w = ((t[8] - t[2]) * (y - t[7]) + (t[1] - t[7]) * (z - t[8])) / d;
    if (u < 0 || w < 0 || u + w > 1) continue;
    out = Math.max(out, Math.abs(u * t[0] + w * t[3] + (1 - u - w) * t[6]));
  }
  return out;
};
// A level cut: the extent across and fore-and-aft of a set of triangles where
// the plane y = const cuts them.
const levelCut = (tris, y) => {
  const c = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      const ya = t[a + 1], yb = t[b + 1];
      if ((ya - y) * (yb - y) > 0 || ya === yb) continue;
      const k = (y - ya) / (yb - ya);
      const x = t[a] + (t[b] - t[a]) * k, z = t[a + 2] + (t[b + 2] - t[a + 2]) * k;
      c.minX = Math.min(c.minX, x); c.maxX = Math.max(c.maxX, x);
      c.minZ = Math.min(c.minZ, z); c.maxZ = Math.max(c.maxZ, z);
    }
  }
  return c;
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
  assert.ok(head.x < 0.75 * body.x, `head ${head.x.toFixed(3)} wide on a body ${body.x.toFixed(3)} wide`);
  // and from in front the haunches, not the head, are the widest thing
  let base = 0;
  for (const leg of named(g, 'leg')) base = Math.max(base, box(leg).max.x);
  assert.ok(head.x < 0.65 * 2 * base, `head ${head.x.toFixed(3)} wide over haunches ${(2 * base).toFixed(3)} wide`);
  // but not a pin on a thick neck either: wider than the neck under it
  const trunk = triangles(g, (o) => o.name === 'body');
  const neck = levelCut(trunk, box(g.getObjectByName('head')).min.y - 0.02);
  assert.ok(head.x > 1.15 * (neck.maxX - neck.minX), `head ${head.x.toFixed(3)} wide on a neck ${(neck.maxX - neck.minX).toFixed(3)} wide`);
});

test('an ear rises out of the skull through its surface, and carries the side of the head up', () => {
  for (const [label, cat] of [['sit', sit()], ['stand', stand()]]) {
    const g = cat.group;
    const skull = triangles(g, (o) => o.name === 'head');
    const head = box(g.getObjectByName('head'));
    const half = (head.max.x - head.min.x) / 2;
    for (const ear of named(g, 'ear')) {
      // Everything but the tip is buried. An ear with any of its base outside
      // the skull shows from somewhere as a flap hanging beside the head.
      const p = ear.geometry.getAttribute('position');
      const verts = [];
      for (let i = 0; i < p.count; i++) verts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(ear.matrixWorld));
      const tip = verts.reduce((a, b) => (b.y > a.y ? b : a));
      const base = verts.filter((v) => v !== tip);
      assert.ok(base.length >= 3, `${label}: a base to bury`);
      for (const v of base) {
        assert.ok(inside(skull, v), `${label}: a point of an ear's base is outside the skull: (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`);
      }
      // The outer edge comes up out of the widest part of the head: neither
      // stepped in from the cheek nor standing outside it.
      const reach = Math.max(...verts.map((v) => Math.abs(v.x)));
      assert.ok(reach > 0.93 * half && reach <= half, `${label}: the ear reaches ${reach.toFixed(3)} on a head ${half.toFixed(3)} to the side`);
      assert.ok(Math.abs(tip.x) > 0.8 * half && Math.abs(tip.x) < half, `${label}: and its tip stands over the cheek, ${Math.abs(tip.x).toFixed(3)} out`);
      // Broad: at the height of the crown it is still most of half a head wide,
      // and it has a back to it — a blade seen from the side is a spike.
      const tris = triangles(g, (o) => o === ear);
      const cut = levelCut(tris, head.max.y);
      assert.ok(cut.maxX - cut.minX > 0.5 * half, `${label}: ${(cut.maxX - cut.minX).toFixed(3)} wide at the crown`);
      const low = levelCut(tris, head.max.y - 0.03);
      assert.ok(low.maxZ - low.minZ > 0.3 * half, `${label}: ${(low.maxZ - low.minZ).toFixed(3)} deep, fore and aft`);
    }
  }
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

  // each haunch is a round with a short paw out from under it: a little
  // longer than it is tall, and no more — a mass laid along the ground to the
  // front feet is one long foot
  for (const l of hind) {
    const b = box(l).getSize(new THREE.Vector3());
    assert.ok(b.z > b.y, `a haunch and its paw are longer than tall: ${b.z.toFixed(3)} long, ${b.y.toFixed(3)} tall`);
    assert.ok(b.z < 1.2 * b.y, `but it is a round, not a slab along the ground: ${b.z.toFixed(3)} long, ${b.y.toFixed(3)} tall`);
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
  // The hind paws stop behind the front ones: laid alongside, a hind paw
  // hides the front one from the side and the cat sits on one pair of feet.
  assert.ok(hindToe < frontPaw.lo, `the hind paws stop behind the front ones: ${hindToe.toFixed(3)} vs ${frontPaw.lo.toFixed(3)}`);
  // and close behind: less than a paw's length of ground shows between them
  const pawLen = frontPaw.hi - frontPaw.lo;
  assert.ok(frontPaw.lo - hindToe < 0.5 * pawLen, `and close behind them: ${(frontPaw.lo - hindToe).toFixed(3)} short, a paw ${pawLen.toFixed(3)} long`);

  // from the side: nothing but the cat between the rump and the hind toes.
  // A rescaled standing hind leg leaves the rump hanging in the air behind it.
  const solid = triangles(g, (o) => o.name === 'body' || o.name === 'leg');
  for (let i = 0; i <= 40; i++) {
    const z = body.min.z + 0.1 + (hindToe - 0.01 - body.min.z - 0.1) * (i / 40);
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

  // The one turn in it is over the shoulder blades: there the line runs
  // forward fast, and above it the nape stands much nearer plumb. One slope
  // kept from the rump to the ears is the tent again, higher up.
  const run = (y0, y1) => (sectionZ(trunk, y1).min - sectionZ(trunk, y0).min) / (y1 - y0);
  const shoulders = run(0.7, 0.78), napeLean = run(0.85, 1.0);
  assert.ok(shoulders > 2 * napeLean, `the back turns over the shoulders: ${shoulders.toFixed(2)} forward per height there, ${napeLean.toFixed(2)} up the nape`);
  assert.ok(napeLean < 0.7, `and the nape stands up: it leans ${napeLean.toFixed(2)}`);

  // and the nape runs up BEHIND the skull, so the skull's back is inside the
  // neck rather than a knob standing out of it
  const head = g.getObjectByName('head');
  const hp = head.geometry.getAttribute('position');
  const v = new THREE.Vector3(), occiput = new THREE.Vector3(0, 0, Infinity);
  for (let i = 0; i < hp.count; i++) {
    v.fromBufferAttribute(hp, i).applyMatrix4(head.matrixWorld);
    if (v.z < occiput.z) occiput.copy(v);
  }
  assert.ok(inside(trunk, occiput), `the back of the skull stands out of the nape at z = ${occiput.z.toFixed(3)}`);
});

test('the breast is fullest below the throat, and the front legs come down out of its line', () => {
  const g = sit().group;
  const trunk = triangles(g, (o) => o.name === 'body');
  const front = (y) => sectionZ(trunk, y).max;
  const throat = front(0.86);
  let full = -Infinity, at = 0;
  for (let y = 0.3; y < 0.86; y += 0.02) if (front(y) > full) { full = front(y); at = y; }
  assert.ok(full > throat + 0.02, `the breast stands ${(full - throat).toFixed(3)} ahead of the throat`);
  assert.ok(at > 0.55 && at < 0.75, `and is fullest at ${at.toFixed(2)}`);
  // below that it falls back, and the legs' front line is never ahead of it
  const legs = triangles(g, (o) => o.name === 'leg');
  for (let y = 0.1; y < 0.7; y += 0.05) {
    assert.ok(sectionZ(legs, y).max < full, `a leg stands ahead of the breast at ${y.toFixed(2)}`);
  }
});

test('a seated front leg is a slim column below the elbow and a shoulder on the chest above it', () => {
  const g = sit().group;
  const body = triangles(g, (o) => o.name === 'body');
  const legs = named(g, 'leg').filter((l) => box(l).min.z > -0.2);
  assert.equal(legs.length, 2);
  for (const leg of legs) {
    const tris = triangles(g, (o) => o === leg);
    const cut = (y) => sectionZ(tris, y);
    const shin = cut(0.2).depth;

    // below the elbow: a column, plumb, that does not swell
    for (let y = 0.12; y <= 0.3; y += 0.03) {
      assert.ok(cut(y).depth < 1.15 * shin, `the forearm swells to ${cut(y).depth.toFixed(3)} at ${y.toFixed(2)} over a shin of ${shin.toFixed(3)}`);
    }
    const lean = Math.abs(cut(0.3).max - cut(0.12).max);
    assert.ok(lean < 0.02, `the column leans ${lean.toFixed(3)}`);
    // on a paw that is longer than the leg is thick, forward
    assert.ok(cut(0.03).depth > 1.12 * shin, `a paw ${cut(0.03).depth.toFixed(3)} long under a shin of ${shin.toFixed(3)}`);
    assert.ok(cut(0.03).max > cut(0.2).max + 0.02, 'reaching forward of it');

    // Above the elbow it WIDENS, steadily, and all of it backward: the back
    // line runs up and back across the ribs while the front line only ever
    // leans in. A column carried on up into the chest is a stick pushed into
    // it; a swelling on the front of one is a plate on the breast.
    let last = cut(0.35).depth;
    for (let y = 0.4; y <= 0.6; y += 0.05) {
      assert.ok(cut(y).depth > last, `the upper arm stops widening at ${y.toFixed(2)}: ${cut(y).depth.toFixed(3)} after ${last.toFixed(3)}`);
      assert.ok(cut(y).max < cut(0.3).max + 0.005, `its front line steps forward at ${y.toFixed(2)}`);
      last = cut(y).depth;
    }
    assert.ok(cut(0.6).depth > 1.6 * shin, `a shoulder ${cut(0.6).depth.toFixed(3)} across over a shin of ${shin.toFixed(3)}`);
    assert.ok(cut(0.6).min < cut(0.3).min - 0.08, `reaching back over the ribs: ${(cut(0.3).min - cut(0.6).min).toFixed(3)}`);

    // It lies ON the chest. Everything above the elbow is within a thin skin
    // of the trunk's surface — carried that little way toward the middle of
    // the animal, every vertex is inside the body — and the top of it is
    // under the surface outright, so the shoulder has no top edge to show.
    leg.updateWorldMatrix(true, false);
    const p = leg.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    const side = Math.sign(leg.getWorldPosition(new THREE.Vector3()).x);
    let on = 0, under = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
      if (v.y < 0.5) continue;
      if (v.y > 0.7) {
        under++;
        assert.ok(inside(body, v), `the top of the shoulder stands out of the trunk at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`);
      }
      on++;
      v.x -= side * 0.025;
      assert.ok(inside(body, v), `the shoulder stands off the chest at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`);
    }
    assert.ok(on >= 16 && under >= 8, `there is a shoulder to judge: ${on} points on the chest, ${under} at its top`);
    // and it does show: over the upper arm the limb's surface stands a
    // little outside the trunk's — a low relief, not a plate and not nothing
    for (const [y, z] of [[0.5, 0.07], [0.54, 0.03]]) {
      const proud = reachAt(tris, y, z) - reachAt(body, y, z);
      assert.ok(proud > 0.004 && proud < 0.03, `the shoulder stands ${proud.toFixed(4)} off the flank at (${y}, ${z})`);
    }
  }
  // close together under the breast: at the ground, the gap between the paws
  // is narrower than a paw
  const paw = (leg) => {
    const p = leg.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
      if (v.y < 0.12) { lo = Math.min(lo, v.x); hi = Math.max(hi, v.x); }
    }
    return { lo, hi };
  };
  const [a, b] = legs.map(paw).sort((p, q) => p.lo - q.lo);
  assert.ok(b.lo - a.hi < a.hi - a.lo, `the paws stand ${(b.lo - a.hi).toFixed(3)} apart, each ${(a.hi - a.lo).toFixed(3)} wide`);
});

test('a haunch is a round on the flank, its facets running out from the middle', () => {
  const g = sit().group;
  const hind = named(g, 'leg').filter((l) => box(l).min.z < -0.2);
  for (const leg of hind) {
    const tris = triangles(g, (o) => o === leg);
    const b = box(leg);
    // the crown, and where it stands along the haunch
    let top = -Infinity, at = 0;
    for (let i = 1; i < 60; i++) {
      const z = b.min.z + (b.max.z - b.min.z) * (i / 60);
      const y = sectionY(tris, z).max;
      if (y > top) { top = y; at = z; }
    }
    // no level run across the top: a little way either side it has already
    // fallen
    for (const d of [-0.1, 0.1]) {
      const y = sectionY(tris, at + d).max;
      assert.ok(y < top - 0.02, `the haunch runs level from its crown: ${y.toFixed(3)} beside ${top.toFixed(3)}`);
    }

    // Its outer face is a dome with a pole at the middle, and the facets are
    // gores round that pole. Rings stood across the haunch draw level creases
    // from end to end of it instead, and a round with level creases across
    // it reads as a box with a lid.
    const side = Math.sign(leg.getWorldPosition(new THREE.Vector3()).x);
    const p = leg.geometry.getAttribute('position');
    const at3 = (i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
    let pole = 0;
    for (let i = 1; i < p.count; i++) if (side * at3(i).x > side * at3(pole).x) pole = i;
    const far = at3(pole);
    assert.ok(Math.abs(far.y - top / 2) < 0.08 && Math.abs(far.z - at) < 0.08,
      `the dome's pole is at its middle: (${far.y.toFixed(3)}, ${far.z.toFixed(3)}) for a crown ${top.toFixed(3)} high at ${at.toFixed(3)}`);
    const idx = leg.geometry.index;
    const round = new Set();
    for (let i = 0; i < idx.count; i += 3) {
      const tri = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
      if (tri.includes(pole)) for (const k of tri) if (k !== pole) round.add(k);
    }
    const spokes = [...round].map((k) => at3(k).sub(far));
    assert.ok(spokes.length >= 8, `${spokes.length} facets meet at the pole`);
    // all the way round it, and about as far in every direction
    const angles = spokes.map((v) => Math.atan2(v.y, v.z)).sort((x, y) => x - y);
    let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
    assert.ok(gap < 1.0, `the gores leave ${gap.toFixed(2)} rad of the round uncovered`);
    const reach = spokes.map((v) => Math.hypot(v.y, v.z));
    assert.ok(Math.max(...reach) < 1.6 * Math.min(...reach), `the gores reach ${Math.min(...reach).toFixed(3)} to ${Math.max(...reach).toFixed(3)}`);
    // and they stop well short of the outline, where the face turns over: a
    // first ring out at the rim is a drum, flat across and sheer at the edge
    assert.ok(Math.max(...reach) < 0.35 * top, `the dome's first ring stands ${Math.max(...reach).toFixed(3)} out on a haunch ${top.toFixed(3)} tall`);
  }
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

test('from in front the seated cat stands on four paws in a row, the front pair together', () => {
  const g = sit().group;
  g.updateMatrixWorld(true);
  const legs = named(g, 'leg');
  const at = (leg) => leg.getWorldPosition(new THREE.Vector3());
  const front = legs.filter((l) => at(l).z > 0 && at(l).x > 0);
  const hind = legs.filter((l) => at(l).z < 0 && at(l).x > 0);
  assert.equal(front.length, 1);
  assert.equal(hind.length, 1);
  const fore = triangles(g, (o) => o === front[0]);
  const paw = levelCut(fore, 0.03);
  // nearly touching its fellow across the centreline, and not through it
  assert.ok(paw.minX > 0 && paw.minX < 0.025, `a front paw stands ${paw.minX.toFixed(3)} off the centreline`);
  // the forearm leans in to get there: the leg is further out at the elbow
  const elbow = levelCut(fore, 0.32);
  const mid = (c) => (c.minX + c.maxX) / 2;
  assert.ok(mid(elbow) > mid(paw) + 0.01, `elbow ${mid(elbow).toFixed(3)} out, paw ${mid(paw).toFixed(3)}`);
  // and the hind paw shows beside it, clear of it, inside the haunch's width
  const haunch = triangles(g, (o) => o === hind[0]);
  const low = levelCut(haunch.filter((t) => Math.max(t[2], t[5], t[8]) > -0.03), 0.03);
  assert.ok(low.minX > paw.maxX - 0.005, `the hind paw starts ${low.minX.toFixed(3)} out, the front paw ends ${paw.maxX.toFixed(3)}`);
  assert.ok(low.minX < paw.maxX + 0.03, 'and stands right beside it');
});
