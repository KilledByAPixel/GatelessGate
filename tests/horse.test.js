import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHorse } from '../src/kit/horse.js';
import { triangles, sectionY } from './helpers/quadruped-probe.js';

// Pins the silhouette events that make it a HORSE and not a llama, measured
// from the meshes themselves wherever a mesh can answer, so a regression in
// either horse.js or the shared plan trips them. `plan` (quadruped.js) is read
// only for where things are — the shoulder, the hip, the neck's two ends — and
// never for the shape being asserted.

function build() {
  const horse = makeHorse({});
  horse.group.updateMatrixWorld(true);
  return horse;
}

const find = (group, name) => {
  const out = [];
  group.traverse((o) => { if (o.name === name && o.isMesh) out.push(o); });
  return out;
};

const bodyOf = (group) => triangles(group, (o) => o.name === 'body');

// withers = the top of the body's own section over the front legs
const withersOf = ({ group, plan }) => sectionY(bodyOf(group), plan.zShoulder - 1e-3).max;

test('the horse holds its mesh count: trade, never add', () => {
  // k45 bakes its whole horse to one mesh with `bakeStatic`, but the horse is
  // shared (k36 stages it unbaked), so its mesh count is exactly what any case
  // drawing it unbaked pays: the body with its neck, four legs, the head, the
  // merged ear pair, the tail's one skin. The crest and the croup are the
  // body's own rings moved, and cost nothing.
  const { group } = build();
  let meshes = 0;
  group.traverse((o) => { if (o.isMesh) meshes++; });
  assert.ok(meshes <= 8, `mesh count is what an unbaked horse costs — trade, never add: ${meshes}`);
});

test('THE NECK WEDGE: leaning 40-50 degrees off vertical, deep at the chest, slim at the poll', () => {
  const horse = build();
  const { root, end } = horse.plan.neck;                  // [y, z] each
  const lean = THREE.MathUtils.radToDeg(Math.atan2(end[1] - root[1], end[0] - root[0]));
  assert.ok(lean > 40 && lean < 50,
    `neck leans ${lean.toFixed(1)} deg off vertical (the llama stood at ~29)`);

  // The wedge, off the mesh: the body's extent ACROSS the neck's own line,
  // sampled near its root and near the poll. A pipe holds its depth.
  const len = Math.hypot(end[0] - root[0], end[1] - root[1]);
  const d = [(end[0] - root[0]) / len, (end[1] - root[1]) / len];   // along the neck, [y, z]
  const n = [d[1], -d[0]];                                          // across it, toward the crest
  const p = find(horse.group, 'body')[0].geometry.getAttribute('position');
  const bodyY = find(horse.group, 'body')[0].position.y;
  const depthAt = (t0, t1) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + bodyY - root[0], z = p.getZ(i) - root[1];
      const along = (y * d[0] + z * d[1]) / len;
      if (along < t0 || along > t1) continue;
      const across = y * n[0] + z * n[1];
      lo = Math.min(lo, across); hi = Math.max(hi, across);
    }
    return hi - lo;
  };
  const low = depthAt(0.2, 0.45), high = depthAt(0.9, 1.1);
  assert.ok(high > 0 && low > 0, 'the neck has rings at both ends');
  assert.ok(high / low < 0.65,
    `a third of the way up, the neck is still well deeper than at the poll: ${(high / low).toFixed(2)}x (a pipe is ~0.85)`);
  // and where it leaves the chest it is deeper again, by a wide margin
  const { rootDepth, endDepth } = horse.plan.neck;
  assert.ok(endDepth / rootDepth < 0.5, `poll to root ${(endDepth / rootDepth).toFixed(2)}x`);
});

test('a LONG DEEP head, carried around 1.05-1.25x withers, hung steeper than the neck leans', () => {
  const horse = build();
  const withers = withersOf(horse);
  const head = find(horse.group, 'head')[0];
  const v = new THREE.Vector3();
  head.getWorldPosition(v);

  // the llama carried its head centre at 1.34x withers
  assert.ok(v.y / withers > 1.05 && v.y / withers < 1.25,
    `head centre at ${(v.y / withers).toFixed(2)}x withers`);

  // A head no bigger than the end of its neck is a deer's. Poll to nostril it
  // is about as long as the neck is deep at its root, and deep at the jaw —
  // but still a head, not a second neck.
  head.geometry.computeBoundingBox();
  const bb = head.geometry.boundingBox;
  const long = (bb.max.z - bb.min.z) / withers, deep = (bb.max.y - bb.min.y) / withers;
  assert.ok(long > 0.36 && long < 0.46, `the head is ${long.toFixed(2)}x withers long`);
  assert.ok(deep > 0.19, `and ${deep.toFixed(2)}x withers deep at the jaw`);
  assert.ok(Math.abs(long * withers / horse.plan.neck.rootDepth - 1) < 0.2,
    `about as long as the neck is deep at its root: ${(long * withers / horse.plan.neck.rootDepth).toFixed(2)}x`);

  // Hung below level by more than the neck rises above it: carried along the
  // neck's own line the face is only the neck's taper going on, and the two
  // never read as two masses meeting at the throat.
  const { root, end } = horse.plan.neck;
  const rise = Math.atan2(end[0] - root[0], end[1] - root[1]);
  assert.ok(head.rotation.x > rise,
    `the face hangs ${head.rotation.x.toFixed(2)} rad below level, the neck rises ${rise.toFixed(2)}`);
});

test('ONE head: one loft tapering poll to nostril unbroken', () => {
  // the head is a single lofted geometry, not a skull with a muzzle bolted on
  const { group } = build();
  const head = find(group, 'head')[0];
  const p = head.geometry.getAttribute('position');
  assert.ok(p.count > 24, 'a loft, not a 24-corner box');

  // ring half-widths must NARROW monotonically from the cheek forward — one
  // continuous taper is what makes it read as one form, not parts
  const zs = new Map();
  for (let i = 0; i < p.count; i++) {
    const z = +p.getZ(i).toFixed(4);
    zs.set(z, Math.max(zs.get(z) ?? 0, Math.abs(p.getX(i))));
  }
  const stations = [...zs.entries()].sort((a, b) => a[0] - b[0])
    .map(([, w]) => w).filter((w) => w > 1e-6);
  const cheekAt = stations.indexOf(Math.max(...stations));
  for (let i = cheekAt; i < stations.length - 1; i++) {
    assert.ok(stations[i + 1] <= stations[i] + 1e-6,
      `taper never widens again forward of the cheek (station ${i})`);
  }
  // and the nostril end is genuinely narrower than the skull — a taper, not a tube
  assert.ok(stations[stations.length - 1] < Math.max(...stations) * 0.6,
    'the muzzle ends well inside the skull width');
});

test('deep chest, tucked flank, withers over the back', () => {
  const horse = build();
  const { plan } = horse;
  const body = bodyOf(horse.group);
  const span = plan.zShoulder - plan.zHip;
  const chest = sectionY(body, plan.zShoulder - 0.05 * span);
  const flank = sectionY(body, plan.zHip + 0.3 * span);
  const mid = sectionY(body, plan.zHip + 0.6 * span);
  assert.ok(chest.depth > flank.depth * 1.25,
    `chest ${chest.depth.toFixed(3)} is well deeper than the flank ${flank.depth.toFixed(3)}`);
  assert.ok(flank.min > chest.min + 0.15 * chest.depth,
    `the underline climbs aft: brisket ${chest.min.toFixed(3)}, flank ${flank.min.toFixed(3)}`);
  assert.ok(chest.max > mid.max, 'the withers stand over the middle of the back');
});

test('the hind fold sits at a LOW hock, behind the hip', () => {
  const horse = build();
  const withers = withersOf(horse);
  const hinds = find(horse.group, 'leg').filter((l) => l.position.z < 0);
  assert.equal(hinds.length, 2, 'both hind legs');
  const v = new THREE.Vector3();
  for (const leg of hinds) {
    // the hock is the rearmost point of the leg's own outline
    const p = leg.geometry.getAttribute('position');
    const hock = new THREE.Vector3(0, 0, Infinity);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
      if (v.z < hock.z) hock.copy(v);
    }
    assert.ok(hock.y / withers < 0.4, `hock at ${(hock.y / withers).toFixed(2)}x withers — low`);
    assert.ok(hock.z < leg.position.z - 0.05, 'the hock folds BACK of the hip');
  }
});

test('the tail hangs from the croup', () => {
  const horse = build();
  const { group, tail, plan } = horse;
  assert.ok(tail, 'the strand tail is live');

  // root on the rump's top-rear, not a stub at rear-centre height: above the
  // body's axis, behind the hip, and under the topline so the join is buried
  assert.ok(tail.group.position.y > plan.bodyY + 0.1, 'roots above the body axis');
  assert.ok(tail.group.position.z < plan.zHip - 0.05, 'roots behind the hip');
  assert.ok(tail.group.position.y < sectionY(bodyOf(group), tail.group.position.z).max,
    'and under the topline there, not perched on it');

  // ONE HANGING MASS. A stub aimed well back with a strand plumb off its end
  // is two sticks and a hinge, so: no joint bends far, and below the dock the
  // strand is close to plumb.
  // the strand's own nodes, carried into the animal's frame
  group.updateMatrixWorld(true);
  const nodes = tail.nodes().map((n) => tail.group.localToWorld(new THREE.Vector3(...n)));
  const dirs = nodes.slice(1).map((n, i) => n.clone().sub(nodes[i]).normalize());
  const deg = THREE.MathUtils.radToDeg;
  for (let i = 1; i < dirs.length; i++) {
    const kink = deg(dirs[i].angleTo(dirs[i - 1]));
    assert.ok(kink < 22, `joint ${i} bends ${kink.toFixed(1)} deg — a hinge`);
    const lean = deg(Math.acos(Math.min(1, Math.abs(dirs[i].y))));
    assert.ok(lean < 13, `below the dock the tail hangs: segment ${i} is ${lean.toFixed(1)} deg off plumb`);
  }
  // it still falls just clear of the buttock rather than down inside the rump
  const box = new THREE.Box3().setFromObject(tail.group);
  const rump = new THREE.Box3().setFromObject(find(group, 'body')[0]);
  assert.ok(box.min.z < rump.min.z - 0.03, 'the hang shows behind the rump');
  // and it is a mass, not a whip: thin at the dock, fuller below it
  const withers = withersOf(horse);
  assert.ok((box.max.x - box.min.x) / withers > 0.18,
    `the tail is ${((box.max.x - box.min.x) / withers).toFixed(3)}x withers across`);
  // the skin is one mesh, a ring of vertices per node: measure a ring across
  const skin = find(group, 'strand')[0];
  const P = skin.geometry.getAttribute('position');
  const sides = (P.count - 2) / nodes.length;
  const across = (ring) => {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < sides; j++) { const x = P.getX(ring * sides + j); lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return hi - lo;
  };
  assert.ok(across(2) > across(0) * 1.5, 'fuller through the middle than at the dock');
  // reaching about to the hock, and long: a full hank is most of the hind
  // leg's own height, where a short one is a switch
  assert.ok(box.min.y / withers > 0.2 && box.min.y / withers < 0.36,
    `the tip hangs at ${(box.min.y / withers).toFixed(2)}x withers`);
  assert.ok((box.max.y - box.min.y) / withers > 0.6,
    `the hank is ${((box.max.y - box.min.y) / withers).toFixed(2)}x withers from dock to tip`);
});

// across the neck's own line, the body's extent between two stations along it
function neckDepth(horse, t0, t1) {
  const { root, end } = horse.plan.neck;
  const len = Math.hypot(end[0] - root[0], end[1] - root[1]);
  const d = [(end[0] - root[0]) / len, (end[1] - root[1]) / len];
  const n = [d[1], -d[0]];
  const body = find(horse.group, 'body')[0];
  const p = body.geometry.getAttribute('position');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + body.position.y - root[0], z = p.getZ(i) - root[1];
    const along = (y * d[0] + z * d[1]) / len;
    if (along < t0 || along > t1) continue;
    const across = y * n[0] + z * n[1];
    lo = Math.min(lo, across); hi = Math.max(hi, across);
  }
  return hi - lo;
}

test('the neck is deeper at the shoulder than at the throat, and stays deep leaving it', () => {
  const horse = build();
  const withers = withersOf(horse);
  const { rootDepth, endDepth } = horse.plan.neck;
  const third = neckDepth(horse, 0.2, 0.45), upper = neckDepth(horse, 0.55, 0.8);
  assert.ok(rootDepth > third && third > upper && upper > endDepth,
    'one wedge: every station slimmer than the one below it');
  // A deep root is not enough. A neck that spends its depth at once is thin
  // where it leaves the shoulders, and the head then hangs off a stick.
  assert.ok(third / withers > 0.31,
    `a third of the way up the neck is ${(third / withers).toFixed(3)}x withers deep`);
  // ...and it has to LAST: with the crest standing on it, the upper half of
  // the neck is still a thick thing where it nears the head
  assert.ok(upper / withers > 0.26,
    `two thirds of the way up the neck is ${(upper / withers).toFixed(3)}x withers deep`);
  // The root runs withers to the point of the breast, and the breast stands
  // well up the chest — so the root is not the whole depth of the chest, and
  // the brisket shows as a corner below it.
  assert.ok(rootDepth / withers > 0.36,
    `at the shoulder it is ${(rootDepth / withers).toFixed(3)}x withers deep`);
  assert.ok(endDepth / rootDepth < 0.4, `throat to root ${(endDepth / rootDepth).toFixed(2)}x`);
});

test('the crest: the top of the neck bows well clear of a straight line, withers to poll', () => {
  // The mane is outline, not strands. The body is a ring per section and the
  // neck is its last four; each ring's top point is the topline there. Between
  // the withers and the poll the two rings up the neck must stand above the
  // straight line joining them — a plain wedge barely leaves it.
  const horse = build();
  const p = find(horse.group, 'body')[0].geometry.getAttribute('position');
  const SEG = 8, TOP = 2;                       // quadruped.js, A PROFILE LOFT
  const rings = (p.count - 2) / SEG;
  assert.ok(Number.isInteger(rings) && rings >= 6, 'the body is still a ring loft with two apexes');
  const top = (r) => [p.getY(r * SEG + TOP), p.getZ(r * SEG + TOP)];
  const a = top(rings - 4), b = top(rings - 1);
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const r of [rings - 3, rings - 2]) {
    const t = top(r);
    const clear = ((t[0] - a[0]) * (b[1] - a[1]) - (t[1] - a[1]) * (b[0] - a[0])) / chord;
    assert.ok(clear / chord > 0.08,
      `the crest stands ${(clear / chord * 100).toFixed(1)}% of the neck's length clear of its chord`);
  }
});

test('the trunk is carried high: more than half the height at the withers is leg', () => {
  const horse = build();
  const s = sectionY(bodyOf(horse.group), horse.plan.zShoulder - 1e-3);
  assert.ok(s.min / s.max > 0.5, `the brisket stands at ${(s.min / s.max).toFixed(3)}x withers`);
});

test('the head is deep at the jaw and tapers to the muzzle along its underline', () => {
  const horse = build();
  const head = find(horse.group, 'head')[0];
  const p = head.geometry.getAttribute('position');
  const rings = new Map();
  for (let i = 0; i < p.count; i++) {
    const z = +p.getZ(i).toFixed(4);
    const r = rings.get(z) ?? { lo: Infinity, hi: -Infinity, n: 0 };
    r.lo = Math.min(r.lo, p.getY(i)); r.hi = Math.max(r.hi, p.getY(i)); r.n++;
    rings.set(z, r);
  }
  const rs = [...rings.entries()].filter(([, r]) => r.n > 1).sort((x, y) => x[0] - y[0]).map(([, r]) => r);
  const depth = (r) => r.hi - r.lo;
  const jawAt = rs.reduce((m, r, i) => (depth(r) > depth(rs[m]) ? i : m), 0);
  const jaw = rs[jawAt], muzzle = rs[rs.length - 1];
  assert.ok(jawAt <= 2, 'the deepest section is back at the jaw, not out along the face');
  assert.ok(depth(jaw) > depth(muzzle) * 2.3,
    `jaw ${depth(jaw).toFixed(3)} against muzzle ${depth(muzzle).toFixed(3)}`);
  // The taper is the JAW's: the underline climbs to the muzzle further than
  // the forehead falls to it. Tapered evenly about its axis the head is a
  // wedge on the end of the neck.
  const rise = muzzle.lo - jaw.lo, fall = jaw.hi - muzzle.hi;
  assert.ok(rise > fall * 1.2,
    `underline climbs ${rise.toFixed(3)}, forehead falls ${fall.toFixed(3)}`);
  // and the neck arrives no deeper than the jaw it joins
  assert.ok(horse.plan.neck.endDepth < depth(jaw), 'the throat is slimmer than the jaw');
});

test('the withers stand above the low point of the back, and so does the croup', () => {
  const horse = build();
  const { plan } = horse;
  const body = bodyOf(horse.group);
  const span = plan.zShoulder - plan.zHip;
  const withers = withersOf(horse);
  const depth = sectionY(body, plan.zShoulder - 1e-3).depth;
  let low = Infinity, lowAt = 0, croup = -Infinity;
  for (let i = 0; i <= 40; i++) {
    const s = sectionY(body, plan.zHip + span * (i / 40));
    if (s.max < low) { low = s.max; lowAt = i / 40; }
    if (i <= 8) croup = Math.max(croup, s.max);
  }
  assert.ok(lowAt > 0.3 && lowAt < 0.85,
    `the low point is in the back itself: ${lowAt.toFixed(2)} of the way forward`);
  // the shared plan test bounds how far a back may dip under its own chord, so
  // these are small numbers by construction — but they are not nothing
  assert.ok((withers - low) / depth > 0.092,
    `withers stand ${((withers - low) / depth * 100).toFixed(1)}% of the chest's depth over the back`);
  assert.ok(croup > low + 0.03 * depth, 'the croup rises behind the dip');
  assert.ok(withers > croup, 'and the withers are the high point of the trunk');
});

test('a broad chest: nearly as wide as deep at the shoulder', () => {
  const horse = build();
  const { plan } = horse;
  const body = find(horse.group, 'body')[0];
  const p = body.geometry.getAttribute('position');
  let w = 0;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getZ(i) - plan.zShoulder) < 1e-3) w = Math.max(w, Math.abs(p.getX(i)));
  }
  const depth = sectionY(bodyOf(horse.group), plan.zShoulder - 1e-3).depth;
  assert.ok(2 * w / depth > 0.72, `shoulder breadth ${(2 * w / depth).toFixed(2)}x its depth — a slab is ~0.68`);
});

test('the hind feet stand under the body, not propped out behind it', () => {
  const horse = build();
  const withers = withersOf(horse);
  const v = new THREE.Vector3();
  for (const leg of find(horse.group, 'leg').filter((l) => l.position.z < 0)) {
    const p = leg.geometry.getAttribute('position');
    let z = 0, n = 0;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(leg.matrixWorld);
      if (v.y < 0.02) { z += v.z; n++; }
    }
    assert.ok(n > 0, 'the leg reaches the ground');
    const behind = (leg.position.z - z / n) / withers;
    assert.ok(behind > 0 && behind < 0.1, `the hoof stands ${behind.toFixed(3)}x withers behind the hip`);
  }
});

test('deterministic and steady: the update only stirs the tail', () => {
  const a = build(), b = build();
  for (let i = 0; i < 90; i++) { a.update(1 / 60, i / 60); b.update(1 / 60, i / 60); }
  a.group.updateMatrixWorld(true);
  b.group.updateMatrixWorld(true);
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  const segsA = a.tail.nodes(), segsB = b.tail.nodes();
  assert.ok(segsA.length >= 3, 'the strand has nodes');
  assert.equal(segsA.length, segsB.length);
  for (let i = 0; i < segsA.length; i++) {
    va.set(...segsA[i]);
    vb.set(...segsB[i]);
    assert.ok(Number.isFinite(va.x + va.y + va.z), 'finite tail');
    assert.ok(va.distanceTo(vb) < 1e-9, 'same seed, same sway');
  }
  assert.equal(a.group.name, 'horse');
});
