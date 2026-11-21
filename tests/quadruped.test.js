import test from 'node:test';
import assert from 'node:assert';
import * as THREE from '../lib/three.module.js';
import { makeQuadruped } from '../src/kit/quadruped.js';
import { makeDog } from '../src/kit/dog.js';
import { makeFox } from '../src/kit/fox.js';
import { makeBuffalo } from '../src/kit/buffalo.js';
import { makeHorse } from '../src/kit/horse.js';
import { makeCat } from '../src/kit/cat.js';
import { triangles, sectionY, sectionZ, legClouds, trunk, legsJoinBody, inside, foreleg, undersideTurn, keelSection } from './helpers/quadruped-probe.js';

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
    // down the middle: a haunch over the hind legs is the thigh, not the loin
    const s = keelSection(body, z0 + (z1 - z0) * ((i + 0.5) / N));
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
      // inside the body and take in the mass itself. The foot is a block in
      // its own right, so the margin is over a real paw and not a pinched tip.
      const top = radius(pts.filter((p) => p.y > hi - 0.35 * (hi - lo)));
      const foot = radius(pts.filter((p) => p.y < lo + 0.1 * (hi - lo)));
      assert.ok(top > foot * 1.25,
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
      // the hock is wherever the leg's rear point is, below its middle: a
      // species may stand it higher (`legs.hock`)
      const low = pts.filter((q) => q.y < 0.55 * run);
      const hockY = low.reduce((a, q) => (q.z < a.z ? q : a)).y / run;
      const foot = meanZ(-1, 0.02), hock = meanZ(hockY - 0.06, hockY + 0.06), stifle = meanZ(0.62, 0.78);
      assert.ok(Math.abs(foot - leg.position.z) < 0.08 * run,
        `${label}: the hind foot stands ${((leg.position.z - foot) / run * 100).toFixed(1)}% of the leg's run behind the hip`);
      assert.ok(stifle > hock + 0.04 * run,
        `${label}: the stifle is carried ${((stifle - hock) / run * 100).toFixed(1)}% ahead of the hock`);
    }
  }
});

// THE HOCK STANDS WHERE THE SPECIES SAYS, OVER A CANNON IT CHOOSES THE LEAN OF.
// Stated at their defaults `hock` and `rake` change nothing; a lower `hock`
// stands the joint higher on the leg, and a low `rake` stands the cannon
// plumb under it instead of leaning it forward to the hip.
test('legs.hock and legs.rake: the hock higher, the cannon plumb', () => {
  const hindOf = (legs) => {
    const q = makeQuadruped({ height: 1, legs });
    const leg = q.group.children.filter((c) => c.name === 'leg' && c.position.z < 0 && c.position.x > 0)[0];
    const tris = triangles(q.group, (o) => o === leg);
    let hock = { z: Infinity, y: 0 };
    for (const t of tris) for (let k = 0; k < 9; k += 3) if (t[k + 1] < 0.55 * leg.position.y && t[k + 2] < hock.z) hock = { z: t[k + 2], y: t[k + 1] };
    return { leg, tris, hock, foot: sectionZ(tris, 0.03 * leg.position.y).min };
  };
  const same = hindOf({}), stated = hindOf({ hock: 0.66, rake: 0.2 });
  assert.deepStrictEqual(Array.from(stated.leg.geometry.getAttribute('position').array),
    Array.from(same.leg.geometry.getAttribute('position').array), 'stated at their defaults they change nothing');
  const high = hindOf({ hock: 0.56 });
  assert.ok(high.hock.y > same.hock.y + 0.05 * same.leg.position.y,
    `the hock stands at ${high.hock.y.toFixed(3)} against ${same.hock.y.toFixed(3)}`);
  const plumb = hindOf({ rake: 0.03, knee: 0.4 }), leaned = hindOf({ knee: 0.4 });
  const lean = (h) => (h.foot - h.hock.z) / h.leg.position.y;
  assert.ok(lean(leaned) > 0.05 && lean(plumb) < 0.5 * lean(leaned),
    `the heel stands ${lean(plumb).toFixed(3)} ahead of the hock, against ${lean(leaned).toFixed(3)} leaned`);
});

// THE HOCK IS NOT AT THE GROUND. Left at the plan's share, a horse's, a dog's
// and a bison's hock all stood about a fifth of the animal's height up, a low
// fold with the cannon short under it; each stands it higher, the fox about
// where it was. Fractions of the whole height, ears included.
const HOCK = { dog: [0.23, 0.28], fox: [0.2, 0.25], horse: [0.235, 0.29], buffalo: [0.235, 0.3] };
test('dog, fox, horse and buffalo: the hock stands where each carries it', () => {
  for (const [label, build] of STANDING.filter(([l]) => HOCK[l])) {
    const root = build();
    root.updateMatrixWorld(true);
    const H = new THREE.Box3().setFromObject(root).max.y;
    const leg = root.children.filter((c) => c.name === 'leg' && c.position.z < 0 && c.position.x > 0)[0];
    let hock = { z: Infinity, y: 0 };
    for (const t of triangles(root, (o) => o === leg)) for (let k = 0; k < 9; k += 3) if (t[k + 1] < 0.55 * leg.position.y && t[k + 2] < hock.z) hock = { z: t[k + 2], y: t[k + 1] };
    const [lo, hi] = HOCK[label];
    assert.ok(hock.y / H > lo && hock.y / H < hi, `${label}: the hock stands ${(hock.y / H).toFixed(3)} of the height up`);
  }
});

// ---- the limbs and the rump: mass where an animal carries it ----------------
// The slimmest level cut through the lower part of a leg is its cannon.
function cannonOf(tris, lo, hi) {
  let best = null;
  for (let f = 0.1; f <= 0.32; f += 0.01) {
    const s = sectionZ(tris, lo + f * (hi - lo));
    if (Number.isFinite(s.depth) && (!best || s.depth < best.depth)) best = s;
  }
  return best;
}

// A FOOT IS A BLOCK, AND IT REACHES FORWARD. A leg that only flares where it
// meets the ground stands on a point: the flare is gone a finger's height up.
// A paw or a hoof keeps its length for a height of its own, and spends that
// length ahead of the cannon rather than evenly about it.
test('a leg stands on a block of a foot that reaches forward of its cannon', () => {
  for (const [label, build] of STANDING) {
    const root = build();
    for (const leg of root.children.filter((o) => o.name === 'leg')) {
      const tris = triangles(root, (o) => o === leg);
      const box = new THREE.Box3().setFromObject(leg, true);
      const cannon = cannonOf(tris, box.min.y, box.max.y);
      const sole = sectionZ(tris, box.min.y + 0.02 * cannon.depth);
      const instep = sectionZ(tris, box.min.y + 0.3 * cannon.depth);
      assert.ok(instep.depth > 1.2 * cannon.depth,
        `${label}: the foot holds its length above the ground: ${instep.depth.toFixed(3)} vs cannon ${cannon.depth.toFixed(3)}`);
      assert.ok(sole.max - cannon.max > 2 * Math.max(0, cannon.min - sole.min) + 0.1 * cannon.depth,
        `${label}: the toe reaches ${(sole.max - cannon.max).toFixed(3)} ahead of the cannon, the heel ${(cannon.min - sole.min).toFixed(3)} behind`);
    }
  }
});

// THE THIGH FILLS THE REAR OF THE ANIMAL. A hind leg hung from the middle of
// the trunk leaves the rump overhanging it as a stub, and the animal reads as
// a tube on posts. Just under the trunk the thigh is a broad wedge whose rear
// edge is the rump's own end carried on down. Asked of the four animals that
// stand in the book; the cat's standing pose is not staged anywhere.
test('the thigh is a broad wedge that reaches back to the end of the rump', () => {
  for (const [label, build] of STANDING) {
    if (label === 'cat') continue;
    const root = build();
    const body = triangles(root, (o) => o.name === 'body');
    const rumpEnd = new THREE.Box3().setFromObject(root.getObjectByName('body'), true).min.z;
    for (const leg of root.children.filter((o) => o.name === 'leg' && o.position.z < 0)) {
      const tris = triangles(root, (o) => o === leg);
      const run = leg.position.y;
      // just under the trunk's belly line, where the limb has left it — or
      // where the trunk's own haunch is carrying it (`torso.haunch`), so the
      // haunch is counted with the leg
      const under = keelSection(body, leg.position.z).min;
      const zMid = (trunk(root).zHind + trunk(root).zFront) / 2;
      const haunch = body.filter((t) => t[2] < zMid && t[5] < zMid && t[8] < zMid);
      const thigh = sectionZ([...tris, ...haunch], under - 0.03 * run);
      assert.ok(thigh.depth > 0.27 * run,
        `${label}: the thigh is ${(thigh.depth / run * 100).toFixed(1)}% of the leg's run fore and aft`);
      assert.ok(thigh.min - rumpEnd < 0.07 * run,
        `${label}: the rump overhangs the thigh by ${((thigh.min - rumpEnd) / run * 100).toFixed(1)}% of the leg's run`);
    }
  }
});

// A RUMP IS ROUND, NOT A POINT. Tapered away behind the hips the trunk ends in
// a stub; an animal's croup carries most of its depth nearly to the tail and
// then turns down into the buttock.
test('the rump keeps its depth to the buttock', () => {
  for (const [label, build] of STANDING) {
    const root = build();
    const body = triangles(root, (o) => o.name === 'body');
    const rumpEnd = new THREE.Box3().setFromObject(root.getObjectByName('body'), true).min.z;
    const { zHind } = trunk(root);
    const hip = sectionY(body, zHind).depth;
    const buttock = sectionY(body, rumpEnd + 0.25 * (zHind - rumpEnd)).depth;
    assert.ok(buttock > 0.6 * hip,
      `${label}: the rump is ${(buttock / hip * 100).toFixed(0)}% of the hip's depth a quarter of the way in from its end`);
  }
});

// A ROUND RUMP IS AN ARC, AND IT ENDS LOW. `torso.round` is not the blunt cap
// softened: drawing a blunt rump's top down uncovers the thigh buried in it.
// The round one keeps its underside, drops its hindmost point below the axis
// to the buttock and spends the whole turn on the topline. Read off the trunk
// as how far down the topline has come, from the croup's height (0) to the
// hindmost point's (1), at stations along the overhang.
test('torso.round turns the croup over in an arc to a low buttock, and the thigh stays buried', () => {
  const rumpOf = (root) => {
    const mesh = root.getObjectByName('body');
    const body = triangles(root, (o) => o === mesh);
    const p = mesh.geometry.getAttribute('position');
    let end = 0;
    for (let i = 1; i < p.count; i++) if (p.getZ(i) < p.getZ(end)) end = i;
    const { zHind } = trunk(root);
    const endZ = p.getZ(end), endY = p.getY(end) + mesh.position.y;
    const hip = sectionY(body, zHind);
    const fall = (u) => (hip.max - sectionY(body, zHind + u * (endZ - zHind)).max) / (hip.max - endY);
    return { fall, low: (endY - hip.min) / hip.depth };
  };
  const opts = { legs: { hindSet: 0.08 } };
  const blunt = rumpOf(makeQuadruped(opts).group);
  const round = rumpOf(makeQuadruped({ ...opts, torso: { round: 1 } }).group);

  assert.ok(blunt.low > 0.5, `a blunt rump closes at mid-height: ${blunt.low.toFixed(2)} of the way up the hip`);
  assert.ok(round.low < 0.4, `a round one ends low, at the buttock: ${round.low.toFixed(2)} of the way up the hip`);
  // an arc: it has fallen a little by the middle, most of the way by the end,
  // and it stands proud of the straight chamfer between the two all the way
  assert.ok(round.fall(0.5) > 0.08 && round.fall(0.5) < 0.3, `mid-rump the topline has fallen ${round.fall(0.5).toFixed(2)}`);
  assert.ok(round.fall(0.9) > 0.45, `near its end it has fallen ${round.fall(0.9).toFixed(2)}`);
  for (const u of [0.3, 0.5, 0.7, 0.85]) {
    assert.ok(round.fall(u) < u - 0.08, `a chamfer, not an arc, at ${u}: fallen ${round.fall(u).toFixed(2)}`);
  }

  // the thigh under it, with the hind legs set back toward the end
  for (const hindSet of [0, 0.06, 0.1]) {
    const { group } = makeQuadruped({ torso: { round: 1 }, legs: { hindSet } });
    legsJoinBody(group, `round rump, hindSet ${hindSet}`, assert.ok);
    const body = triangles(group, (o) => o.name === 'body');
    for (const leg of group.children.filter((o) => o.name === 'leg' && o.position.z < 0)) {
      // the ring the limb hangs from is the first six vertices of its loft
      const p = leg.geometry.getAttribute('position');
      for (let j = 0; j < 6; j++) {
        const q = new THREE.Vector3().fromBufferAttribute(p, j).add(leg.position);
        assert.ok(inside(body, q), `hindSet ${hindSet}: the thigh's top ring stands out of the round rump at `
          + `(${q.x.toFixed(3)}, ${q.y.toFixed(3)}, ${q.z.toFixed(3)})`);
      }
    }
  }
});

// The animals that state a round rump get one, measured on what ships: the
// trunk's hindmost point is the buttock, in the lower half of the hip's depth,
// and the topline has turned well down before it gets there.
test('dog, horse and buffalo end in a round rump, not a box', () => {
  for (const [label, build] of STANDING) {
    if (!['dog', 'horse', 'buffalo'].includes(label)) continue;
    const root = build();
    const mesh = root.getObjectByName('body');
    const body = triangles(root, (o) => o === mesh);
    const box = new THREE.Box3().setFromObject(mesh, true);
    const { zHind } = trunk(root);
    const hip = keelSection(body, zHind);
    const end = keelSection(body, box.min.z + 0.01 * (zHind - box.min.z));
    const endUp = ((end.max + end.min) / 2 - hip.min) / hip.depth;
    assert.ok(endUp < 0.42, `${label}: the rump's end stands ${endUp.toFixed(2)} of the way up the hip`);
    const late = keelSection(body, zHind + 0.9 * (box.min.z - zHind));
    const fallen = (hip.max - late.max) / hip.depth;
    assert.ok(fallen > 0.2,
      `${label}: a corner — near the rump's end the topline has fallen only ${fallen.toFixed(2)} of the hip's depth`);
  }
});

// `torso.sag` states the back as one line. With it, the middle sections lie on
// the chord from croup to withers (less the sag); without it, a long fall is
// spent unevenly and the same chord stands well clear of the back. Either
// way the plan's own `topAt` is the line that renders, so nothing has to be
// restated after the build.
test('torso.sag spends a falling back evenly, and plan.topAt reports it', () => {
  const backOf = (torso) => {
    const { group, plan } = makeQuadruped({ torso: { withers: 1.3, croup: 0.7, ...torso } });
    const body = triangles(group, (o) => o.name === 'body');
    const z0 = plan.zHip + 0.08 * (plan.zShoulder - plan.zHip), z1 = plan.zShoulder - 1e-6;
    const y0 = sectionY(body, z0).max, y1 = sectionY(body, z1).max;
    let off = 0, drift = 0;
    for (let i = 1; i < 20; i++) {
      const z = z0 + (z1 - z0) * (i / 20), y = sectionY(body, z).max;
      off = Math.max(off, Math.abs(y0 + (y1 - y0) * (i / 20) - y));
      drift = Math.max(drift, Math.abs(plan.topAt(z) - y));
    }
    return { off: off / plan.R, drift: drift / plan.R };
  };
  const stepped = backOf({}), line = backOf({ sag: 0 }), sagged = backOf({ sag: 0.08 });
  assert.ok(stepped.off > 0.08, `the default back leaves its own chord by ${stepped.off.toFixed(3)} R`);
  assert.ok(line.off < 0.01, `sag 0 is the chord: off it by ${line.off.toFixed(4)} R`);
  assert.ok(sagged.off > 0.05 && sagged.off < 0.09, `and a stated sag is that sag: ${sagged.off.toFixed(3)} R`);
  for (const b of [stepped, line, sagged]) assert.ok(b.drift < 1e-6, `plan.topAt is the mesh's own topline: ${b.drift}`);
});

// ---- THE SHOULDER, as tests ---------------------------------------------------
// A front leg used to be a post entering the underside of a round chest. Three
// things replace that and each is held on its own: the chest's sides come
// straight down to a corner over the leg (torso.slab), the leg is a column
// opening both ways into the chest at its top (legs.point), and the back turns
// up into the nape without a notch (neck.ease).

// half-width of a set of triangles at a station z and a height y: the cut of
// the cut, so it reads the surface that renders and not a ring's own vertices
function halfWidthAt(tris, z, y) {
  let w = 0;
  for (const t of tris) {
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      const za = t[a + 2], zb = t[b + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const k = (z - za) / (zb - za);
      pts.push([t[a] + (t[b] - t[a]) * k, t[a + 1] + (t[b + 1] - t[a + 1]) * k]);
    }
    if (pts.length < 2) continue;
    const [p, q] = pts;
    if ((p[1] - y) * (q[1] - y) > 0 || p[1] === q[1]) continue;
    w = Math.max(w, Math.abs(p[0] + (q[0] - p[0]) * ((y - p[1]) / (q[1] - p[1]))));
  }
  return w;
}

// one front leg, and what it stands under: its own triangles, the station it
// hangs at, the body's section there, and the belly line at the leg itself —
// the lowest level at which the leg's own axis is inside the chest
function frontLeg(root) {
  root.updateMatrixWorld(true);
  const legs = [];
  root.traverse((o) => { if (o.name === 'leg') legs.push(o); });
  const leg = legs.filter((l) => l.position.x > 0).sort((a, b) => b.position.z - a.position.z)[0];
  const body = triangles(root, (o) => o.name === 'body');
  const cut = sectionY(body, leg.position.z);
  let belly = cut.min;
  const step = (cut.max - cut.min) / 400;
  while (belly < cut.max && !inside(body, { x: leg.position.x, y: belly, z: leg.position.z })) belly += step;
  return { leg, tris: triangles(leg, () => true), body, z: leg.position.z, keel: cut.min, top: cut.max, belly };
}

// THE FOREARM AS A COLUMN, read off one front leg between two levels of its
// column (fractions of the belly's height) and on up to the belly: how far
// each edge drifts over the column and how much broader its top is than its
// foot (the column), and how far each edge sweeps out from the column's top
// to the hide, all as fractions of the column's breadth at its top (the
// flare). `breast` is how far the trunk stands ahead of the column's front
// edge a little above the belly line.
function column(root, lo, hi) {
  const F = foreleg(root);
  const L = F.at(lo), U = F.at(hi), T = F.at(1);
  const w = U.width;
  const front = sectionZ(F.body, 1.3 * F.belly).max;
  return {
    F, w,
    drift: Math.max(Math.abs(U.front - L.front), Math.abs(U.back - L.back)) / w,
    taper: U.width / L.width,
    fwd: (T.front - U.front) / w, aft: (U.back - T.back) / w,
    breast: ((front - F.leg.position.z) / F.H - U.front) / w,
  };
}

// the body's topline as the corners it turns through, from the back over the
// withers and up the nape: degrees at each, positive turning up
function toplineTurns(root) {
  const body = root.children.find((c) => c.name === 'body');
  const P = body.geometry.getAttribute('position');
  const { seg: SEG, top: TOP } = body.userData.ring;   // quadruped.js, A PROFILE LOFT
  const rings = (P.count - 2) / SEG;
  const zFront = trunk(root).zFront;
  let sh = 0;
  while (sh < rings - 1 && P.getZ(sh * SEG + TOP) < zFront - 1e-6) sh++;
  const tops = [];
  for (let r = sh - 1; r < rings; r++) tops.push([P.getY(r * SEG + TOP), P.getZ(r * SEG + TOP)]);
  const turns = [];
  for (let i = 1; i < tops.length - 1; i++) {
    const a = Math.atan2(tops[i][0] - tops[i - 1][0], tops[i][1] - tops[i - 1][1]);
    const b = Math.atan2(tops[i + 1][0] - tops[i][0], tops[i + 1][1] - tops[i][1]);
    turns.push((b - a) * 180 / Math.PI);
  }
  return { tops: tops.slice(1), turns };          // tops from the withers forward
}

test('torso.slab carries the sides of the chest straight down over the front legs, and nowhere else', () => {
  const base = { height: 1, neck: {} };
  const round = makeQuadruped(base), slab = makeQuadruped({ ...base, torso: { slab: 1 } });
  // how much of the chest's breadth is left three fifths of the way down from
  // its widest line to its keel
  const kept = (q, z) => {
    const body = triangles(q.group, (o) => o.name === 'body');
    const cut = sectionY(body, z), mid = (cut.max + cut.min) / 2;
    return halfWidthAt(body, z, mid - 0.6 * (mid - cut.min)) / halfWidthAt(body, z, mid);
  };
  const zS = round.plan.zShoulder - 1e-4, zH = round.plan.zHip + 1e-4;
  assert.ok(kept(round, zS) < 0.8, `a round chest has fallen away under its widest line: ${kept(round, zS).toFixed(2)}`);
  assert.ok(kept(slab, zS) > 0.9, `a slab-sided one is still nearly its full breadth: ${kept(slab, zS).toFixed(2)}`);
  assert.ok(Math.abs(kept(slab, zH) - kept(round, zH)) < 1e-9, 'the hindquarters are the section they were');
  // the profile is untouched: a slab is a change of section, not of outline
  const bs = triangles(slab.group, (o) => o.name === 'body'), br = triangles(round.group, (o) => o.name === 'body');
  for (const z of [zS, 0, zH]) {
    const a = sectionY(bs, z), b = sectionY(br, z);
    assert.ok(Math.abs(a.min - b.min) < 1e-9 && Math.abs(a.max - b.max) < 1e-9, `same top and bottom at z=${z.toFixed(2)}`);
  }
  legsJoinBody(slab.group, 'slab-chested plan', assert.ok);
});

// THE UNDERSIDE IS A KEEL. With one lower corner a side, a slabbed or
// barrelled section turns most of a right angle at that corner and runs on to
// the keel as a floor: a hard edge with a dark band under it the length of the
// belly, and from the front a flat rectangle between the forelegs. Keeled, it
// turns under in steps, and the underline sweeps up from the brisket on a
// curve.
test('torso.keel turns the underside under on a curve, rump to breast, with no more meshes', () => {
  const base = { height: 1, neck: {}, torso: { slab: 1, barrel: 1, girth: 0.16, round: 1, shoulderW: 1, barrelW: 1.05 }, legs: { point: 0.6, flare: 0.8, drop: 0.2 } };
  const box = makeQuadruped(base), keel = makeQuadruped({ ...base, torso: { ...base.torso, keel: 1 } });
  const bodyOf = (q) => triangles(q.group, (o) => o.name === 'body');
  const { zShoulder, zHip } = box.plan, span = zShoulder - zHip;
  for (const z of [zShoulder - 1e-4, zHip + 0.6 * span, zHip + 0.3 * span]) {
    const a = undersideTurn(bodyOf(box), z), b = undersideTurn(bodyOf(keel), z);
    assert.ok(a > 50, `one corner turns ${a.toFixed(0)} degrees at z=${z.toFixed(2)}`);
    assert.ok(b < 40, `keeled, no short stretch turns more than ${b.toFixed(0)} degrees at z=${z.toFixed(2)}`);
  }
  // the underline is fuller than the chord from flank to brisket
  const zM = zHip + 0.52 * span;
  assert.ok(sectionY(bodyOf(keel), zM).min < sectionY(bodyOf(box), zM).min - 0.005, 'the belly sweeps down toward the brisket');
  assert.strictEqual(keel.group.children.length, box.group.children.length, 'no more meshes');
  const ring = (q) => q.group.children.find((c) => c.name === 'body').userData.ring;
  assert.deepStrictEqual([ring(box).seg, ring(keel).seg], [8, 12], 'the ring says what it is');
  assert.ok(ring(keel).bot === ring(keel).top + ring(keel).seg / 2, 'and where its bottom point is');
  legsJoinBody(keel.group, 'keeled plan', assert.ok);
});

// THE HAUNCH IS THE TRUNK'S. A thigh hung under the belly line shows its top
// as a pale plate under the trunk's dark underside, with a step where it
// meets the rump; with `torso.haunch` the trunk itself hangs down over each
// hind leg, below its own belly line down the middle, and the legs are where
// they were.
test('torso.haunch hangs the trunk down over the hind legs and moves no joint', () => {
  const base = { height: 1, neck: {}, torso: { slab: 1, barrel: 1, girth: 0.16, round: 1, keel: 1, shoulderW: 1, barrelW: 1.05 }, legs: { point: 0.6, proud: 0 } };
  const flat = makeQuadruped(base), hung = makeQuadruped({ ...base, torso: { ...base.torso, haunch: 0.8 } });
  const bodyOf = (q) => triangles(q.group, (o) => o.name === 'body');
  const legZ = flat.group.children.find((o) => o.name === 'leg' && o.position.z < 0).position.z;
  const drop = (q) => keelSection(bodyOf(q), legZ).min - sectionY(bodyOf(q), legZ).min;
  assert.ok(drop(flat) < 1e-6, `without it the trunk is deepest down its middle (${drop(flat).toFixed(3)})`);
  assert.ok(drop(hung) > 0.4 * 0.8 * flat.plan.R, `with it the trunk hangs ${drop(hung).toFixed(3)} below its belly line over the leg`);
  // the belly line itself, and the back, are where they were
  for (const z of [legZ, 0, flat.plan.zShoulder - 1e-4]) {
    const a = keelSection(bodyOf(flat), z), b = keelSection(bodyOf(hung), z);
    assert.ok(Math.abs(a.min - b.min) < 1e-9 && Math.abs(a.max - b.max) < 1e-9, `same centreline at z=${z.toFixed(2)}`);
  }
  // it comes in from nothing at the flank
  const zF = flat.plan.zHip + 0.4 * (flat.plan.zShoulder - flat.plan.zHip);
  assert.ok(Math.abs(sectionY(bodyOf(hung), zF).min - sectionY(bodyOf(flat), zF).min) < 1e-9, 'not at the flank');
  // no joint moves: the hind legs hang from the same points
  const joints = (q) => q.group.children.filter((o) => o.name === 'leg').map((o) => o.position.toArray().map((v) => v.toFixed(6)).join());
  assert.deepStrictEqual(joints(hung), joints(flat));
  assert.strictEqual(hung.group.children.length, flat.group.children.length, 'no more meshes');
  legsJoinBody(hung.group, 'haunched plan', assert.ok);
});

// ...and dog, fox and horse carry one
test('dog, fox and horse: the thigh is the haunch of the trunk, down toward the stifle', () => {
  for (const [label, build] of STANDING.filter(([l]) => ['dog', 'fox', 'horse'].includes(l))) {
    const root = build();
    const body = triangles(root, (o) => o.name === 'body');
    const leg = root.children.find((o) => o.name === 'leg' && o.position.z < 0);
    const hang = (keelSection(body, leg.position.z).min - sectionY(body, leg.position.z).min) / leg.position.y;
    assert.ok(hang > 0.08, `${label}: the trunk hangs only ${hang.toFixed(3)} of the leg's run below its belly line over the thigh`);
  }
});

test('legs.point stands the forearm as a column that flares both ways into the chest', () => {
  const base = { height: 1, neck: {}, torso: { slab: 1 } };
  const legs = { point: 0.6, elbow: 1.1, flare: 0.8, drop: 0.2 };
  const post = column(makeQuadruped(base).group, 0.5, 0.75);
  const col = column(makeQuadruped({ ...base, legs }).group, 0.5, 0.75);
  // the plain limb opens only backward, its elbow pushed back into the belly
  assert.ok(post.fwd < 0.05 && post.aft > 0.15, `without it the leg opens ${post.fwd.toFixed(2)} forward and ${post.aft.toFixed(2)} back`);
  assert.ok(col.taper < 1.25 && col.drift < 0.2,
    `with it a column: ${col.taper.toFixed(2)}x broader at its top, its edges drifting ${col.drift.toFixed(2)} of its breadth`);
  assert.ok(col.fwd > 0.15 && col.aft > 0.15, `opening forward ${col.fwd.toFixed(2)} and back ${col.aft.toFixed(2)} at its top`);
  assert.ok(Math.max(col.fwd, col.aft) < 2 * Math.min(col.fwd, col.aft), 'and about as far one way as the other');
  const flat = column(makeQuadruped({ ...base, legs: { ...legs, flare: 0 } }).group, 0.5, 0.75);
  assert.ok(col.fwd > flat.fwd + 0.1 && col.aft > flat.aft + 0.1, `flare is what opens it: ${flat.fwd.toFixed(2)} / ${flat.aft.toFixed(2)} without`);
  const hind = (q) => q.group.children.filter((c) => c.name === 'leg' && c.position.z < 0)[0].geometry.getAttribute('position').array;
  assert.deepStrictEqual(Array.from(hind(makeQuadruped({ ...base, legs }))), Array.from(hind(makeQuadruped(base))),
    'and only the front legs take it');
  legsJoinBody(makeQuadruped({ ...base, legs }).group, 'column-legged plan', assert.ok);
  // the one-sided reach back into the belly is gone, and says so
  assert.throws(() => makeQuadruped({ ...base, legs: { point: 0.6, arm: 1.5 } }), /arm is retired/);
});

test('neck.ease turns the back up into the nape without a notch', () => {
  const base = { height: 1, neck: { set: 0.05, taper: 1 }, head: { shape: 'sphere', r: 0.1, fwd: 0.55, up: 0.38 } };
  const hard = toplineTurns(makeQuadruped(base).group);
  const eased = toplineTurns(makeQuadruped({ ...base, neck: { ...base.neck, ease: 0.5, easeUp: 0.45 } }).group);
  // the notch: the root's top stands under the withers, so the line dips
  // before it climbs, and climbs all at once
  assert.ok(hard.tops[1][0] < hard.tops[0][0], 'unasked, the root stands just under the withers');
  assert.ok(Math.max(...hard.turns) > 50, `...and the nape turns up at one corner: ${Math.max(...hard.turns).toFixed(0)} degrees`);
  assert.ok(eased.tops[1][0] > eased.tops[0][0], 'eased, the line climbs from the withers on');
  assert.ok(Math.max(...eased.turns) < 0.7 * Math.max(...hard.turns),
    `...and its sharpest corner is ${Math.max(...eased.turns).toFixed(0)} degrees against ${Math.max(...hard.turns).toFixed(0)}`);
});

const SHOULDERED = STANDING.filter(([label]) => label !== 'cat');
// Where each animal's column stands, as fractions of the belly's height: from
// above its knee to below its flare. A horse's knee is high under a short
// forearm; a fox's flare starts low and runs long.
const COLUMN = { dog: [0.35, 0.6], fox: [0.3, 0.5], horse: [0.45, 0.75], buffalo: [0.45, 0.7] };
// How far the slab corner may hang out past the leg's outer side, x height.
// A bison's chest is far wider than his stance and does hang over his legs.
const EAVE = { buffalo: 0.07 };

// THE FRONT LEG IS AN ARM, NOT A THIGH. Side-on, the forearm is a slim column,
// both edges near plumb and only a little broader at its top than at its foot;
// at its top it opens both ways into the trunk about equally, and the breast
// stands out ahead of it. A leg broad at the elbow and tapering hard, with its
// rear line leaning back into the belly and its front line straight, is a hind
// thigh standing under a chest.
test('dog, fox, horse and buffalo: a front leg is a column opening both ways into a slab-sided chest whose corner stands over it', () => {
  for (const [label, build] of SHOULDERED) {
    const root = build();
    const c = column(root, ...COLUMN[label]);
    assert.ok(c.drift < 0.2, `${label}: the column's edges drift ${c.drift.toFixed(2)} of its breadth: it leans`);
    assert.ok(c.taper > 0.95 && c.taper < 1.4, `${label}: the column is ${c.taper.toFixed(2)}x broader at its top`);
    assert.ok(c.fwd > 0.2 && c.aft > 0.12, `${label}: it opens ${c.fwd.toFixed(2)} forward and ${c.aft.toFixed(2)} back at its top`);
    assert.ok(Math.max(c.fwd, c.aft) < 2.2 * Math.min(c.fwd, c.aft), `${label}: one-sided: ${c.fwd.toFixed(2)} forward, ${c.aft.toFixed(2)} back`);
    assert.ok(c.w * c.F.H < 0.25 * sectionY(c.F.body, c.F.leg.position.z).depth, `${label}: a fat forearm`);
    assert.ok(c.breast > 0.4, `${label}: the breast stands only ${c.breast.toFixed(2)} of the forearm's breadth ahead of it`);
    // the chest at the shoulder: still most of its breadth well down its
    // side, and then turning under on a curve to a keel, not at one corner
    // onto a floor
    const { tris, body, z, belly } = frontLeg(root);
    const zS = trunk(root).zFront - 1e-4;
    const cut = sectionY(body, zS), mid = (cut.max + cut.min) / 2;
    const kept = halfWidthAt(body, zS, mid - 0.45 * (mid - cut.min)) / halfWidthAt(body, zS, mid);
    assert.ok(kept > 0.8, `${label}: the chest keeps ${kept.toFixed(2)} of its breadth down toward the leg`);
    const turn = undersideTurn(body, zS);
    assert.ok(turn < 45, `${label}: the chest turns ${turn.toFixed(0)} degrees at one corner under the side`);
    // ...and that side neither hangs far out past the leg nor stands inside it
    const height = new THREE.Box3().setFromObject(root).max.y;
    const corner = halfWidthAt(body, z, belly + 0.03 * height);
    // (just off the leg's own station: a cut through a ring's corners exactly
    // finds no edge crossing it there)
    const legOut = halfWidthAt(tris, z + 1e-4, belly - 0.02 * height);
    assert.ok(legOut > 0 && corner - legOut < (EAVE[label] ?? 0.05) * height && legOut - corner < 0.03 * height,
      `${label}: chest side ${(corner / height).toFixed(3)} against the outer side of the leg ${(legOut / height).toFixed(3)} (x height)`);
  }
});

test('dog, fox and horse: the topline runs back, withers, nape with no notch and no sharp corner', () => {
  for (const [label, build] of SHOULDERED.filter(([l]) => l !== 'buffalo')) {
    const { tops, turns } = toplineTurns(build());
    for (let i = 1; i < tops.length; i++) {
      assert.ok(tops[i][0] > tops[i - 1][0], `${label}: the line climbs all the way from the withers (section ${i})`);
    }
    assert.ok(Math.max(...turns) < 40, `${label}: sharpest corner ${Math.max(...turns).toFixed(0)} degrees`);
  }
});

// ---- THE BARREL, as tests -------------------------------------------------------
// how much of a trunk's breadth is left three fifths of the way from its
// widest line to its top (side = 1) or its keel (side = -1), at a station
function breadthKept(root, z, side) {
  const body = triangles(root, (o) => o.name === 'body');
  const cut = sectionY(body, z), mid = (cut.max + cut.min) / 2;
  const y = mid + side * 0.6 * ((side > 0 ? cut.max : cut.min) - mid) * side;
  return halfWidthAt(body, z, y) / halfWidthAt(body, z, mid);
}

test('torso.barrel fills the section above and below its widest line, rump to shoulder, and leaves the outline alone', () => {
  const base = { height: 1, neck: {} };
  const round = makeQuadruped(base), full = makeQuadruped({ ...base, torso: { barrel: 1 } });
  for (const z of [round.plan.zShoulder - 1e-4, 0, round.plan.zHip + 1e-4]) {
    for (const side of [1, -1]) {
      const a = breadthKept(round.group, z, side), b = breadthKept(full.group, z, side);
      assert.ok(a < 0.8, `round, the section has fallen away to ${a.toFixed(2)} (z=${z.toFixed(2)}, side ${side})`);
      assert.ok(b > 0.86, `barrelled, it keeps ${b.toFixed(2)} of its breadth (z=${z.toFixed(2)}, side ${side})`);
    }
    const p = sectionY(triangles(round.group, (o) => o.name === 'body'), z), q = sectionY(triangles(full.group, (o) => o.name === 'body'), z);
    assert.ok(Math.abs(p.min - q.min) < 1e-9 && Math.abs(p.max - q.max) < 1e-9, 'same top and bottom');
  }
  legsJoinBody(full.group, 'barrelled plan', assert.ok);
});

test('torso.girth ends the shoulder at a section of its own, drawn in behind the elbow', () => {
  const base = { height: 1, neck: {}, torso: { slab: 1, barrel: 1, shoulderW: 1, barrelW: 1 } };
  const eased = makeQuadruped(base), girt = makeQuadruped({ ...base, torso: { ...base.torso, girth: 0.16 } });
  const count = (q) => q.group.children.find((c) => c.name === 'body').geometry.getAttribute('position').count;
  assert.strictEqual(count(girt) - count(eased), 8, 'one more ring in the trunk, and no more meshes');
  assert.strictEqual(girt.group.children.length, eased.group.children.length);
  const { zShoulder, zHip } = girt.plan, zG = zShoulder - 0.16 * (zShoulder - zHip) - 1e-4;
  const wide = (q, z) => { const body = triangles(q.group, (o) => o.name === 'body'); const c = sectionY(body, z); return halfWidthAt(body, z, (c.max + c.min) / 2); };
  assert.ok(wide(girt, zG) < wide(girt, zShoulder - 1e-4) && wide(girt, zG) < wide(girt, zG - 0.2 * (zShoulder - zHip)),
    'the trunk is narrower at the girth than at the shoulder ahead of it or the ribs behind');
  assert.ok(wide(eased, zG) > wide(girt, zG), 'without it there is no such waist');
  // and the slab is gone by there: the chest's side has turned under
  assert.ok(breadthKept(girt.group, zG, -1) < breadthKept(girt.group, zShoulder - 1e-4, -1), 'the slab ends at the girth');
});

test('dog, fox and horse are barrels: broad either side of the spine and full in the rib, with a shoulder that ends at a girth', () => {
  for (const [label, build] of SHOULDERED.filter(([l]) => l !== 'buffalo')) {
    const root = build();
    const { zHind, zFront, span } = trunk(root);
    for (const z of [zHind + 0.3 * span, zHind + 0.6 * span]) {
      for (const side of [1, -1]) {
        const k = breadthKept(root, z, side);
        assert.ok(k > 0.84, `${label}: the trunk keeps ${k.toFixed(2)} of its breadth (side ${side}) at z=${z.toFixed(2)}`);
      }
      // ...and still turns under to its keel on a curve, not at one corner
      const turn = undersideTurn(triangles(root, (o) => o.name === 'body'), z);
      assert.ok(turn < 40, `${label}: the belly turns ${turn.toFixed(0)} degrees at one corner at z=${z.toFixed(2)}`);
    }
    const body = triangles(root, (o) => o.name === 'body');
    const wide = (z) => { const c = sectionY(body, z); return halfWidthAt(body, z, (c.max + c.min) / 2); };
    const zG = zFront - 0.16 * span;
    assert.ok(wide(zG) < wide(zFront - 1e-4), `${label}: the shoulder stands out of the girth behind it`);
  }
});
