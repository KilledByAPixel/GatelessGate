import test from 'node:test';
import assert from 'node:assert';
import * as THREE from '../lib/three.module.js';
import { makeQuadruped } from '../src/kit/quadruped.js';
import { makeDog } from '../src/kit/dog.js';
import { makeFox } from '../src/kit/fox.js';
import { makeBuffalo } from '../src/kit/buffalo.js';
import { makeHorse } from '../src/kit/horse.js';
import { makeCat } from '../src/kit/cat.js';
import { triangles, sectionY, legClouds, trunk, legsJoinBody, inside } from './helpers/quadruped-probe.js';

const names = (g) => g.children.map((c) => c.name).sort();

test('child names survive (species re-parent by name)', () => {
  const { group } = makeQuadruped({
    neck: { r: 0.07 },
    ears: { r: 0.09, h: 0.2, x: 0.07, y: 0.1, z: 0.02 },
    tail: { kind: 'stiff', r0: 0.05, r1: 0.07, length: 0.5, up: 0.1, back: 0.35 },
  });
  for (const n of ['body', 'head', 'tail'])
    assert.ok(names(group).includes(n), `missing child '${n}'`);
  assert.strictEqual(group.children.filter((c) => c.name === 'leg').length, 4);
  assert.strictEqual(group.children.filter((c) => c.name === 'ear').length, 2);
  // the neck is the body's own profile carried on, and a hock is a bend in
  // the leg's own loft: neither is a part any more
  assert.ok(!names(group).includes('neck'), 'no separate neck mesh');
  assert.strictEqual(group.getObjectByName('shin'), undefined, 'no separate shin mesh');
});

test('THE LEG RULE: every leg joins inside the body and reaches the ground, folded or not', () => {
  for (const knee of [0, 0.35, -0.4]) {
    const { group } = makeQuadruped({ legs: { knee } });
    legsJoinBody(group, `knee ${knee}`, assert.ok);
    const box = new THREE.Box3();
    for (const leg of group.children.filter((c) => c.name === 'leg')) {
      box.setFromObject(leg, true);
      assert.ok(Math.abs(box.min.y) < 1e-6, `the foot stands ON the ground: ${box.min.y}`);
    }
  }
});

// The masses the capsule plan bolted onto its barrel are retired, and a stale
// call site must fail LOUDLY: silently ignoring `hump` would build a plain
// animal where a species asked for a heavy one.
test('the retired body masses and neck keys are a hard error', () => {
  for (const key of ['hump', 'haunch', 'shoulder', 'chest']) {
    assert.throws(() => makeQuadruped({ [key]: { r: 0.15, up: 0.1, fwd: 0.1, drop: 0.1 } }),
      /is retired/, key);
  }
  assert.throws(() => makeQuadruped({ neck: { r: 0.07, len: 0.3 } }), /neck takes/);
});

// THE HOCK. The hind leg folds — stifle forward, hock back — and the front
// leg does not; that asymmetry is what tells a viewer which end drives, even
// in silhouette at fog distance. Read off the leg's own outline: where its
// centre line stands, fore and aft of the join it hangs from, at the height
// of the stifle and at the height of the hock.
test('legs.knee folds the hind legs at the hock, and only the hind legs', () => {
  const fold = (group) => {
    group.updateMatrixWorld(true);
    return group.children.filter((c) => c.name === 'leg').map((leg) => {
      const p = leg.geometry.getAttribute('position');
      const run = leg.position.y;
      const centre = (f0, f1) => {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < p.count; i++) {
          const f = -p.getY(i) / run;
          if (f < f0 || f > f1) continue;
          lo = Math.min(lo, p.getZ(i)); hi = Math.max(hi, p.getZ(i));
        }
        return (lo + hi) / 2;
      };
      return { hind: leg.position.z < 0, stifle: centre(0.25, 0.35), hock: centre(0.6, 0.72), run };
    });
  };
  const folded = fold(makeQuadruped({ legs: { knee: 0.35 } }).group);
  assert.strictEqual(folded.length, 4);
  for (const l of folded) {
    if (l.hind) {
      assert.ok(l.stifle - l.hock > 0.12 * l.run,
        `the hock stands behind the stifle: ${(l.stifle - l.hock).toFixed(3)}`);
      assert.ok(l.hock < 0 && l.stifle > 0, 'stifle ahead of the hip, hock behind it');
    } else {
      assert.ok(Math.abs(l.hock) < 0.04 * l.run, `a front leg stands under its shoulder: ${l.hock.toFixed(3)}`);
    }
  }
  // and the fold is the option's doing: knee 0 stands the hind leg plumb below its thigh
  for (const l of fold(makeQuadruped({ legs: { knee: 0 } }).group)) {
    assert.ok(Math.abs(l.hock) < 0.04 * l.run, `knee 0 is a plumb leg: ${l.hock.toFixed(3)}`);
  }
  // a hock sits LOW: at mid-height the thigh's own mass swallows the bend
  const { group } = makeQuadruped({ legs: { knee: 0.35 } });
  const hind = group.children.find((c) => c.name === 'leg' && c.position.z < 0);
  const p = hind.geometry.getAttribute('position');
  let lo = 0, rear = 0, hockY = 0;
  for (let i = 0; i < p.count; i++) {
    lo = Math.min(lo, p.getY(i));
    if (p.getZ(i) < rear) { rear = p.getZ(i); hockY = p.getY(i); }
  }
  assert.ok(hockY < 0.55 * lo, `the rearmost point of the leg is low on it: ${(hockY / lo).toFixed(2)} of the way down`);
});

// EARS ARE PLACED DIRECTLY — { x, y, z } are the base's offsets from the head's
// centre, so how close an ear sits to the skull is a dial the species (and
// anyone working live in the model viewer) turns by hand. The invariant worth
// pinning is the JOIN: each shipped ear's base must sit INSIDE its skull —
// buried, never gapped — and still near the surface, not sunk to the core.
// Checked on the real species builds, not a synthetic option set, because the
// dog attaches ears straight to the group while the fox re-parents them onto a
// headPivot — the invariant must survive both.
test('ear bases are buried inside the skull — no gap — for dog and fox', () => {
  const builds = [
    ['dog', makeDog({ height: 0.5 }).group],
    ['fox', makeFox({ height: 0.45 }).group],
  ];
  for (const [label, root] of builds) {
    root.updateMatrixWorld(true);
    // Asked of the skull's own mesh: a species may loft its head, and a loft
    // has no radius to measure a base against.
    const skull = triangles(root, (o) => o.name === 'head');
    const box = new THREE.Box3().setFromObject(root.getObjectByName('head'));
    const ears = [];
    root.traverse((o) => { if (o.name === 'ear') ears.push(o); });
    assert.strictEqual(ears.length, 2, `${label} has two ears`);
    for (const ear of ears) {
      // the geometry is base-hinged (root ring at the origin), so the mesh
      // origin IS the base
      const at = ear.getWorldPosition(new THREE.Vector3());
      assert.ok(inside(skull, at),
        `${label} ear base is inside the skull, not gapped: (${at.x.toFixed(3)}, ${at.y.toFixed(3)}, ${at.z.toFixed(3)})`);
      assert.ok(at.y > (box.min.y + box.max.y) / 2 && Math.abs(at.x) > 0.2 * (box.max.x - box.min.x) / 2,
        `${label} ear base stays up in a corner of the skull, not sunk to the core: (${at.x.toFixed(3)}, ${at.y.toFixed(3)})`);
    }
  }
});

// The old aim-ray keys must fail LOUDLY: under the direct scheme the same
// key 'x' means an offset, not a direction, so a stale { up, fwd } call
// site would silently misplace the ears instead of erroring.
test('the retired aim-ray ear keys (up/fwd) are a hard error', () => {
  assert.throws(
    () => makeQuadruped({ ears: { r: 0.09, h: 0.2, x: 0.07, up: 0.3, fwd: 0.5 } }),
    /direct head-relative offsets/);
});

// THE EAR GROWS OUT OF THE SKULL: the base ring flares wider than the ear's
// stated radius, then waists back in above it — a bare cone resting its rim
// on the surface was the "glued on" read.
test('the ear base flares wider than the ear itself', () => {
  const r = 0.09, hh = 0.2;
  const { group } = makeQuadruped({ ears: { r, h: hh, x: 0.07, y: 0.1, z: 0.02 } });
  const ear = group.children.find((c) => c.name === 'ear');
  const p = ear.geometry.getAttribute('position');
  // ring radii measured from the geometry itself: verts are ordered
  // base-ring first (y = 0), so bucket by height fraction
  let baseR = 0, waistR = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), rr = Math.hypot(p.getX(i), p.getZ(i));
    if (y < hh * 0.05) baseR = Math.max(baseR, rr);
    else if (y < hh * 0.6) waistR = Math.max(waistR, rr);
  }
  assert.ok(baseR > r * 1.1, `base flares past r: ${baseR.toFixed(3)} vs ${r}`);
  assert.ok(waistR < baseR * 0.85, `waist pulls back in: ${waistR.toFixed(3)} vs base ${baseR.toFixed(3)}`);
});


// THE SKULL SQUISH: head.scaleX/scaleY/scaleZ (default 1) reshape the head per
// axis — "not just a sphere... an x y z scale, defaulting to one, to tweak the
// kind of shape of the head".
test('head scaleX/scaleY/scaleZ squish the skull, and default to exactly 1', () => {
  const r = 0.2;
  const head = (opts) => {
    const { group } = makeQuadruped({ head: { shape: 'sphere', r, fwd: 0.5, up: 0.2, ...opts } });
    return group.children.find((c) => c.name === 'head');
  };
  const plain = head({});
  assert.deepEqual([plain.scale.x, plain.scale.y, plain.scale.z], [1, 1, 1]);

  const squished = head({ scaleX: 0.7, scaleY: 1.3, scaleZ: 1.6 });
  const bb = new THREE.Box3().setFromObject(squished);
  assert.ok(Math.abs((bb.max.x - bb.min.x) - 2 * r * 0.7) < 0.01, 'narrower across');
  assert.ok(Math.abs((bb.max.y - bb.min.y) - 2 * r * 1.3) < 0.01, 'taller');
  assert.ok(Math.abs((bb.max.z - bb.min.z) - 2 * r * 1.6) < 0.01, 'longer fore-aft');
});

// legBury is the dial that closes a leg/body gap: the belly formula is exact
// only at the barrel's cylindrical mid-span, so a species whose hips ride
// near the capsule's end caps needs to sink its leg tops deeper by hand.
test('legBury sinks the leg tops deeper while the feet stay on the ground', () => {
  const tops = (legBury) => {
    const { group } = makeQuadruped({ legBury });
    const legs = group.children.filter((c) => c.name === 'leg');
    const box = new THREE.Box3();
    for (const l of legs) box.union(new THREE.Box3().setFromObject(l));
    return { top: legs[0].position.y, minY: box.min.y };
  };
  const a = tops(0.06), b = tops(0.18);
  assert.ok(Math.abs((b.top - a.top) - 0.12) < 1e-9,
    `the dial moves the join: ${a.top} -> ${b.top}`);
  assert.ok(Math.abs(a.minY) < 1e-6 && Math.abs(b.minY) < 1e-6,
    `feet still land on y = 0: ${a.minY}, ${b.minY}`);
});

// A LIMB, NOT A DOWEL: a leg spends its width unevenly — a mass where it
// leaves the body, a slim cannon low down, and a small flare back out at the
// foot. Measured fore-and-aft off the geometry, ring by ring, so a regression
// to a straight post (identical ring radii) trips it.
test('legs carry the limb profile: mass > cannon < foot', () => {
  const legR = 0.06;
  const { group } = makeQuadruped({ legR, legTaper: 1.0 });
  for (const leg of group.children.filter((c) => c.name === 'leg')) {
    const p = leg.geometry.getAttribute('position');
    let lo = 0; for (let i = 0; i < p.count; i++) lo = Math.min(lo, p.getY(i));
    // half the fore-aft extent of the vertices within a thin band at a height
    const halfZ = (frac) => {
      let a = Infinity, b = -Infinity;
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(p.getY(i) - lo * frac) > -lo * 0.035) continue;
        a = Math.min(a, p.getZ(i)); b = Math.max(b, p.getZ(i));
      }
      return (b - a) / 2;
    };
    // the mass is the fullest ring in the upper third, wherever in it the
    // plan has had to seat it to keep it inside the body
    let mass = 0;
    for (let f = 0; f < 0.34; f += 0.02) mass = Math.max(mass, halfZ(f));
    const foot = halfZ(1);
    let cannon = Infinity;
    for (let f = 0.7; f < 0.92; f += 0.02) { const r = halfZ(f); if (r > 0) cannon = Math.min(cannon, r); }
    assert.ok(mass > legR * 1.15, `a mass where the leg leaves the body: ${mass.toFixed(3)}`);
    assert.ok(cannon < legR * 0.75, `the cannon slims: ${cannon.toFixed(3)}`);
    assert.ok(foot > cannon * 1.15, `the foot flares back out: ${foot.toFixed(3)} vs ${cannon.toFixed(3)}`);
  }
});

test('snout and horns are retired and say so rather than building nothing', () => {
  assert.throws(() => makeQuadruped({ snout: { r0: 0.03, r1: 0.07, len: 0.2, fwd: 0.7, up: 0.2 } }), /snout/);
  assert.throws(() => makeQuadruped({ horns: { r: 0.05, len: 0.3, x: 0.1, up: 0.3, fwd: 0.4, sweep: 0.8 } }), /horns/);
});

test('the ear hinge channel (rotation.x) is left free for the species to animate', () => {
  // The base orientation must live entirely in rotation.z: the fox's flick
  // and the cat's swivel OVERWRITE rotation.x every frame, so any placement
  // stored there would be silently destroyed on the first update.
  const { group } = makeQuadruped({
    ears: { r: 0.09, h: 0.2, x: 0.07, y: 0.1, z: 0.02, tilt: 0.3 },
  });
  for (const ear of group.children.filter((c) => c.name === 'ear')) {
    assert.strictEqual(ear.rotation.x, 0, 'no placement in the hinge channel');
    assert.ok(Math.abs(ear.rotation.z) > 0.01, 'the cant lives in z');
  }
});

test('the dog is body, legs, skull and tail: nothing bolted on', () => {
  // A brisket ball and a haunch dome were each tried on the dog and each read
  // as a growth. Its chest and haunch are the trunk's own profile and the
  // thigh's own top, so there is no mesh in it that is not one of these.
  const known = new Set(['body', 'leg', 'head', 'ear', 'tail']);
  makeDog({}).group.traverse((o) => {
    if (o.isMesh) assert.ok(known.has(o.name), `unexpected mesh '${o.name}'`);
  });
});

// NOTE — this is the brief's determinism test with ONE change, and the change is
// in the harness, not in what it asserts. Pairing a's parts to b's by
// `getObjectByName` cannot work here: several children legitimately SHARE a name
// ('leg' x4, 'seg' x6 in a strand tail, 'ear'/'horn' x2), and getObjectByName
// returns the FIRST match, so it compares hind-left's matrix against front-left's
// and fails on a perfectly deterministic build. Verified against the untouched
// file before any kit edit. Pairing by traversal position instead tests the same
// property — same options in, same transforms out — and is strictly stronger,
// since it also pins the child ORDER and the total part count.
test('deterministic: same options, identical transforms', () => {
  const a = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  const b = makeQuadruped({ seed: 7, tail: { kind: 'strand', length: 0.5, thickness: 0.05, up: 0.1, back: 0.3 } });
  a.group.updateMatrixWorld(true); b.group.updateMatrixWorld(true);
  const flatten = (g) => { const out = []; g.traverse((o) => out.push(o)); return out; };
  const A = flatten(a.group), B = flatten(b.group);
  assert.strictEqual(A.length, B.length);
  for (let i = 0; i < A.length; i++) {
    assert.strictEqual(A[i].name, B[i].name);
    assert.deepStrictEqual(A[i].matrix.toArray(), B[i].matrix.toArray());
  }
});

// ---- the body plan: anatomy in the outline ---------------------------------
// Every animal used to be a capsule barrel on four near-identical posts. These
// five read the SILHOUETTE off the shipped species rather than off the plan's
// options, so they hold whatever construction produces it.
//
// Two probes. `sectionY` is exact: the y-extent of a set of meshes where the
// plane z = const cuts them, taken from the triangle edges that cross it — a
// side-profile column with no sampling density to tune. `legClouds` hands back
// each leg's vertices, split by side so a species that merges a pair into one
// mesh still yields four.
const STANDING = [
  ['buffalo', () => makeBuffalo({}).group],
  ['horse', () => makeHorse({}).group],
  ['dog', () => makeDog({}).group],
  ['fox', () => makeFox({}).group],
  ['cat', () => makeCat({ pose: 'stand' }).group],
];

// mean depth and lowest point of the body across one third of the trunk
function third(body, z0, z1) {
  let depth = 0, low = Infinity;
  const N = 9;
  for (let i = 0; i < N; i++) {
    const s = sectionY(body, z0 + (z1 - z0) * ((i + 0.5) / N));
    depth += s.depth / N;
    low = Math.min(low, s.min);
  }
  return { depth, low };
}

function thirds(root) {
  const body = triangles(root, (o) => o.name === 'body');
  const { zHind, zFront, span } = trunk(root);
  return {
    rear: third(body, zHind, zHind + span / 3),
    front: third(body, zFront - span / 3, zFront),
  };
}

test('the chest is deeper than the loin', () => {
  for (const [label, build] of STANDING) {
    const { rear, front } = thirds(build());
    assert.ok(front.depth > rear.depth * 1.12,
      `${label}: chest ${front.depth.toFixed(3)} vs loin ${rear.depth.toFixed(3)}`);
  }
});

test('the belly line rises toward the hind legs', () => {
  for (const [label, build] of STANDING) {
    const { rear, front } = thirds(build());
    const rise = (rear.low - front.low) / front.depth;
    assert.ok(rise > 0.1,
      `${label}: the underline climbs ${(rise * 100).toFixed(1)}% of the chest's depth`);
  }
});

test('a leg is thicker at the top than at the foot', () => {
  // radius as the area-equivalent of the band's footprint, so a limb that is
  // broad fore-and-aft but thin across is credited for what it actually spends
  const radius = (pts) => {
    const ext = (k) => (Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]))) / 2;
    return Math.sqrt(ext('x') * ext('z'));
  };
  for (const [label, build] of STANDING) {
    const legs = legClouds(build());
    assert.strictEqual(legs.length, 4, `${label} has four legs`);
    for (const pts of legs) {
      const hi = Math.max(...pts.map((p) => p.y)), lo = Math.min(...pts.map((p) => p.y));
      // the upper third: deep enough to reach past the cap a leg closes with
      // inside the body and take in the mass itself
      const top = radius(pts.filter((p) => p.y > hi - 0.35 * (hi - lo)));
      const foot = radius(pts.filter((p) => p.y < lo + 0.1 * (hi - lo)));
      assert.ok(top > foot * 1.8,
        `${label}: leg top ${top.toFixed(3)} vs foot ${foot.toFixed(3)}`);
    }
  }
});

test('the neck leaves the shoulders, not the front of a barrel', () => {
  // A neck stuck on the front of a barrel shows as a STEP in the side profile:
  // the chest's own rounding closes to a point, and the outline then jumps to
  // wherever the neck happens to be. Walk the upper and lower outline of body +
  // neck from the shoulder to the head in fine columns; a grown neck has a
  // steep throat but never a discontinuity, so the bound is a slope no real
  // outline reaches rather than a tuned height.
  const STEEPEST = 8;                                 // rise over run
  for (const [label, build] of STANDING) {
    if (label === 'cat') continue;                    // carries its skull on the chest: no neck to judge
    const root = build();
    const tris = triangles(root, (o) => o.name === 'body' || o.name === 'neck');
    const { zFront } = trunk(root);
    const headZ = root.getObjectByName('head').getWorldPosition(new THREE.Vector3()).z;
    const N = 400, dz = (headZ - zFront) / N;
    assert.ok(dz > 0, `${label}: the head is carried ahead of the shoulder`);
    let prev = null;
    for (let i = 0; i < N - 2; i++) {
      const s = sectionY(tris, zFront + (i + 0.5) * dz);
      assert.ok(Number.isFinite(s.depth) && s.depth > 0,
        `${label}: nothing joins the body to the head at column ${i}`);
      if (prev) {
        for (const k of ['min', 'max']) {
          assert.ok(Math.abs(s[k] - prev[k]) <= STEEPEST * dz,
            `${label}: the ${k === 'min' ? 'underline' : 'topline'} steps `
            + `${Math.abs(s[k] - prev[k]).toFixed(4)} in one column of ${dz.toFixed(4)} (column ${i})`);
        }
      }
      prev = s;
    }
  }
});

test('no mass stands proud of the back line', () => {
  // Two halves. Nothing but the body itself may form the back between hip and
  // shoulder — a dome riding on the barrel is a second animal. And the body's
  // own back may sway, but only broadly: the taut line over it never stands
  // more than a small fraction of the body's depth clear of the surface.
  const notBack = new Set(['body', 'neck', 'head', 'ear', 'horn', 'tail', 'seg', 'tailseg']);
  for (const [label, build] of STANDING) {
    const root = build();
    const body = triangles(root, (o) => o.name === 'body');
    const rest = triangles(root, (o) => !notBack.has(o.name));
    const { zHind, zFront, span } = trunk(root);
    const N = 40, top = [];
    let depth = 0;
    for (let i = 0; i <= N; i++) {
      const z = zHind + span * (i / N);
      const b = sectionY(body, z), r = sectionY(rest, z);
      depth = Math.max(depth, b.depth);
      assert.ok(!(r.max > b.max + 0.02 * b.depth),
        `${label}: something stands ${(r.max - b.max).toFixed(3)} proud of the back at z = ${z.toFixed(2)}`);
      top.push([z, b.max]);
    }
    // upper hull by brute force: the highest chord over each sample
    let gap = 0;
    for (let i = 1; i < N; i++) {
      for (let a = 0; a < i; a++) for (let c = i + 1; c <= N; c++) {
        const t = (top[i][0] - top[a][0]) / (top[c][0] - top[a][0]);
        gap = Math.max(gap, top[a][1] + (top[c][1] - top[a][1]) * t - top[i][1]);
      }
    }
    assert.ok(gap < 0.08 * depth,
      `${label}: the back line dips ${(gap / depth * 100).toFixed(1)}% of the body's depth under its own chord`);
  }
});

// A LEG LEAVES THE TRUNK AS A SLOPE, NEVER A SHELF. The mass on top of a leg
// is a ring, and a ring standing out of the chest shows its upper side as a
// small level ledge: a box corner on the shoulder in three-quarter view, an
// epaulette either side of the chest from the front. So no part of a leg's
// upper half that faces the sky may lie outside the body. Sampled toward each
// corner of every such facet, because a ledge is the rim of a ring and the
// middle of the facet is the part that is safely buried.
test('a leg leaves the trunk as a slope, never a shelf', () => {
  const SKYWARD = 0.6;                                // normal.y past which a facet is a shelf, not a slope
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const n = new THREE.Vector3(), q = new THREE.Vector3();
  for (const [label, build] of STANDING) {
    const root = build();
    const body = triangles(root, (o) => o.name === 'body');
    for (const leg of root.children.filter((o) => o.name === 'leg')) {
      const box = new THREE.Box3().setFromObject(leg, true);
      const mid = (box.min.y + box.max.y) / 2;
      for (const t of triangles(root, (o) => o === leg)) {
        a.set(t[0], t[1], t[2]); b.set(t[3], t[4], t[5]); c.set(t[6], t[7], t[8]);
        if ((a.y + b.y + c.y) / 3 < mid) continue;
        n.subVectors(b, a).cross(q.subVectors(c, a)).normalize();
        if (n.y < SKYWARD) continue;
        for (const w of [[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]]) {
          q.set(0, 0, 0).addScaledVector(a, w[0]).addScaledVector(b, w[1]).addScaledVector(c, w[2]);
          assert.ok(inside(body, q),
            `${label}: a ${leg.position.z > 0 ? 'front' : 'hind'} leg shows a shelf at `
            + `(${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)})`);
        }
      }
    }
  }
});

// WEIGHT ON THE HIND LEG. A leg that rakes back from hip to hock and then
// drops is an animal camped out: stiff, and standing behind itself. Standing,
// the stifle is carried forward under the flank, the hock back, and the foot
// comes down under the hip.
test('a standing hind leg carries its foot under the hip, stifle ahead of hock', () => {
  const v = new THREE.Vector3();
  for (const [label, build] of STANDING) {
    const root = build();
    root.updateMatrixWorld(true);
    for (const leg of root.children.filter((o) => o.name === 'leg' && o.position.z < 0)) {
      const p = leg.geometry.getAttribute('position');
      const pts = [];
      for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld).clone());
      const run = leg.position.y;                     // the join's height: the leg's own run to the ground
      const meanZ = (lo, hi) => {
        const band = pts.filter((q) => q.y >= lo * run && q.y <= hi * run);
        return band.reduce((sum, q) => sum + q.z, 0) / band.length;
      };
      const foot = meanZ(-1, 0.02), hock = meanZ(0.28, 0.4), stifle = meanZ(0.62, 0.78);
      assert.ok(Math.abs(foot - leg.position.z) < 0.08 * run,
        `${label}: the hind foot stands ${((leg.position.z - foot) / run * 100).toFixed(1)}% of the leg's run behind the hip`);
      assert.ok(stifle > hock + 0.04 * run,
        `${label}: the stifle is carried ${((stifle - hock) / run * 100).toFixed(1)}% ahead of the hock`);
    }
  }
});
