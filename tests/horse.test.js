import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeHorse } from '../src/kit/horse.js';
import { triangles, sectionY, sectionZ, inside, partOf, cornerKey } from './helpers/quadruped-probe.js';

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
  // merged ear pair, the tail's one skin. The croup is the body's own ring
  // moved, and the mane rides in the ears' mesh: neither costs a draw.
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

  // ONE MASS LEAVING IN AN ARC. The dock runs well back off the croup and the
  // hank falls from it; one stub aimed that far back with the strand plumb
  // off its end is two sticks and a hinge. So the turn from the dock's line
  // to the hang is shared between two joints, neither of them sharp, and
  // below the dock the strand is close to plumb.
  // the strand's own nodes, carried into the animal's frame
  group.updateMatrixWorld(true);
  const nodes = tail.nodes().map((n) => tail.group.localToWorld(new THREE.Vector3(...n)));
  const dirs = nodes.slice(1).map((n, i) => n.clone().sub(nodes[i]).normalize());
  const deg = THREE.MathUtils.radToDeg;
  const offPlumb = (d) => deg(Math.acos(Math.min(1, Math.abs(d.y))));
  assert.ok(offPlumb(dirs[0]) > 40 && offPlumb(dirs[0]) < 65 && dirs[0].z < 0,
    `the dock leaves the croup running back: ${offPlumb(dirs[0]).toFixed(1)} deg off plumb`);
  const kinks = [];
  for (let i = 1; i < dirs.length; i++) {
    const kink = deg(dirs[i].angleTo(dirs[i - 1]));
    kinks.push(kink);
    assert.ok(kink < 32, `joint ${i} bends ${kink.toFixed(1)} deg — a hinge`);
    if (i >= 2) {
      assert.ok(offPlumb(dirs[i]) < 13, `below the dock the tail hangs: segment ${i} is ${offPlumb(dirs[i]).toFixed(1)} deg off plumb`);
    }
  }
  assert.ok(kinks[1] > 0.5 * kinks[0], `the turn is one joint's: ${kinks[0].toFixed(1)} then ${kinks[1].toFixed(1)} deg`);
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
  // a ring per node, the two apexes, and the one buried ring past them
  const sides = (P.count - 2) / (nodes.length + 1);
  assert.ok(Number.isInteger(sides), 'the skin is rings, two apexes, and one buried ring');
  const across = (ring) => {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < sides; j++) { const x = P.getX(ring * sides + j); lo = Math.min(lo, x); hi = Math.max(hi, x); }
    return hi - lo;
  };
  // FULLEST LOW. A hank widest just under the dock is a club hung by its
  // thick end; a tail of hair is thin at the dock, widest in its lower half,
  // and drawn in again to its end.
  const widths = nodes.map((n, i) => across(i));
  const widest = widths.indexOf(Math.max(...widths));
  assert.ok(widest >= nodes.length / 2,
    `the hank is fullest at ring ${widest} of ${nodes.length}: in its lower half`);
  // Far fuller there than at the dock — in the side plane, where the dock is
  // slim. Across, the dock is a band lying on the rump, and the hank is only
  // somewhat broader than that.
  const deepAt = (ring) => {
    let d = 0;
    for (let j = 0; j < sides; j++) for (let k = 0; k < j; k++) {
      d = Math.max(d, Math.hypot(P.getY(ring * sides + j) - P.getY(ring * sides + k), P.getZ(ring * sides + j) - P.getZ(ring * sides + k)));
    }
    return d;
  };
  assert.ok(deepAt(widest) > deepAt(0) * 1.6,
    `far fuller there than at the dock: ${deepAt(widest).toFixed(3)} deep against ${deepAt(0).toFixed(3)}`);
  assert.ok(widths[widest] > widths[0] * 1.1, 'and broader than the dock as well');
  // ...but the dock is not a rod: a root much narrower than the rump's own
  // facets reads as a stick pushed into the middle of one
  assert.ok(widths[0] / withers > 0.12, `the dock is ${(widths[0] / withers).toFixed(3)}x withers across`);
  assert.ok(widths[nodes.length - 1] < 0.5 * widths[widest], 'and drawn in again to its end');
  // reaching below the hock but never near the ground, and long: a full hank
  // is most of the hind leg's own height, where a short one is a switch
  assert.ok(box.min.y / withers > 0.08 && box.min.y / withers < 0.3,
    `the tip hangs at ${(box.min.y / withers).toFixed(2)}x withers`);
  assert.ok((box.max.y - box.min.y) / withers > 0.6,
    `the hank is ${((box.max.y - box.min.y) / withers).toFixed(2)}x withers from dock to tip`);
});

test('the tail joins: its root is a full section buried in the rump, at rest and mid-swish', () => {
  const horse = build();
  const { group, tail } = horse;
  const body = bodyOf(group);
  const skin = find(group, 'strand')[0];
  const n = tail.nodes().length;
  const P = skin.geometry.getAttribute('position');
  const sides = (P.count - 2) / (n + 1);
  const buried = n * sides + 2;                 // tail.js: the buried ring follows both apexes
  const v = new THREE.Vector3();
  const ring = (first) => {
    const out = [];
    for (let j = 0; j < sides; j++) out.push(v.fromBufferAttribute(P, first + j).applyMatrix4(skin.matrixWorld).clone());
    return out;
  };
  const span = (pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  const depthOf = (pts) => Math.max(...pts.flatMap((a) => pts.map((b) => Math.hypot(a.y - b.y, a.z - b.z))));
  const check = (when) => {
    const deep = ring(buried), dock = ring(0);
    // FULL GIRTH: what crosses the hide is the dock's whole section, not a
    // cone closing to a point somewhere in the surface
    assert.ok(span(deep) > 0.95 * span(dock), `${when}: the buried end is as wide as the dock`);
    // DEEP: every corner of the buried ring, and the point the skin closes
    // on, is well inside the trunk's own section there — under the back,
    // over the belly, inside the flanks
    const apex = v.fromBufferAttribute(P, n * sides).applyMatrix4(skin.matrixWorld).clone();
    for (const p of [...deep, apex]) {
      const s = sectionY(body, p.z);
      const margin = 0.02 * (s.max - s.min);
      assert.ok(p.y < s.max - margin && p.y > s.min + margin,
        `${when}: buried at y ${p.y.toFixed(3)} inside ${s.min.toFixed(3)}..${s.max.toFixed(3)}`);
    }
    // and it is a real run into the body, not a ring a hair behind the dock
    // (against the dock's depth in the animal's side plane: its breadth is a
    // band's, and says nothing about how far a run has to go to bury an end)
    const mid = (pts) => pts.reduce((m, p) => m.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const run = mid(deep).distanceTo(mid(dock));
    assert.ok(run > 0.9 * depthOf(dock), `${when}: the buried run is ${run.toFixed(3)} long`);
    assert.ok(mid(deep).z > mid(dock).z + 0.5 * depthOf(dock), `${when}: and it runs forward, into the rump`);
    // NOTHING STANDS PROUD AT THE CROUP: the dock's whole first section, upper
    // side included, is under the hide. With its upper corners outside, the
    // tail shows as a facet standing on the croup turn ahead of the place it
    // comes out for good.
    for (const p of dock) assert.ok(inside(body, p), `${when}: a corner of the dock's first section stands out of the rump at y ${p.y.toFixed(3)}`);
    return deep;
  };
  const rest = check('at rest');
  // a swish swings the hank and must not carry the root out with it
  tail.impulse(1);
  let swung = 0;
  const tip0 = new THREE.Vector3(...tail.nodes()[n - 1]);
  for (let i = 0; i < 40; i++) {
    horse.update(1 / 60, 2 + i / 60);
    swung = Math.max(swung, tip0.distanceTo(new THREE.Vector3(...tail.nodes()[n - 1])));
    if (i % 8 === 7) {
      const now = check(`step ${i}`);
      now.forEach((p, j) => assert.ok(p.distanceTo(rest[j]) < 1e-6, 'the buried ring does not move'));
    }
  }
  assert.ok(swung > 0.1, `the hank did swing: ${swung.toFixed(3)}`);
});

test('the tail flows out of the croup: it breaks the hide once, high on the rump, as a band with a ridge up its back', () => {
  const horse = build();
  const { group, tail, plan } = horse;
  const body = bodyOf(group);
  const skin = find(group, 'strand')[0];
  const n = tail.nodes().length;
  const P = skin.geometry.getAttribute('position');
  const sides = (P.count - 2) / (n + 1);
  const v = new THREE.Vector3();
  const ring = (i) => {
    const out = [];
    for (let j = 0; j < sides; j++) out.push(v.fromBufferAttribute(P, i * sides + j).applyMatrix4(skin.matrixWorld).clone());
    return out;
  };
  // THE UPPER SIDE, ring to ring: the corner of each section furthest up and
  // back. It starts under the hide and, once out, never goes back in — a tail
  // whose upper side dips into the rump again further down has left it twice.
  const ridge = [];
  for (let i = 0; i < 4; i++) ridge.push(ring(i).reduce((m, p) => (p.y - 0.3 * p.z > m.y - 0.3 * m.z ? p : m)));
  let out = false, where = null;
  for (let i = 0; i < ridge.length - 1; i++) {
    for (let k = 0; k <= 20; k++) {
      const p = ridge[i].clone().lerp(ridge[i + 1], k / 20);
      const is = !inside(body, p);
      if (is && !out) where = where ?? p;
      assert.ok(is || !out, `the tail's upper side goes back into the rump at y ${p.y.toFixed(3)}`);
      out = out || is;
    }
  }
  assert.ok(where, 'the tail comes out of the rump');
  // HIGH: within the upper part of the trunk's depth at the hip — out of the
  // croup, not out of the back of the buttock
  const hip = sectionY(body, plan.zHip);
  const down = (hip.max - where.y) / hip.depth;
  assert.ok(down > 0.1 && down < 0.4, `it leaves the hide ${down.toFixed(2)} of the trunk's depth below the croup`);
  // ...and going OUTWARD: there the tail's line is shallower than the rump is
  // falling away, which is what makes it the croup's line carried on
  const s0 = sectionY(body, where.z + 0.02).max, s1 = sectionY(body, where.z - 0.02).max;
  const rump = Math.atan2(s0 - s1, 0.04);
  const dock = Math.atan2(ridge[0].y - ridge[1].y, ridge[0].z - ridge[1].z);
  assert.ok(dock < rump, `the dock falls at ${THREE.MathUtils.radToDeg(dock).toFixed(0)} deg where the rump falls at ${THREE.MathUtils.radToDeg(rump).toFixed(0)}`);
  // A BAND ACROSS THE RUMP, gathered into the hank below: the dock is broader
  // than it is deep, and the strand is round again by its middle
  const shape = (pts) => {
    const xs = pts.map((p) => p.x);
    const across = Math.max(...xs) - Math.min(...xs);
    return across / Math.max(...pts.flatMap((a) => pts.map((b) => Math.hypot(a.y - b.y, a.z - b.z))));
  };
  assert.ok(shape(ring(0)) > 1.2, `the dock is ${shape(ring(0)).toFixed(2)}x as broad as deep`);
  assert.ok(shape(ring(4)) < 1.05, `mid-hank the section is round: ${shape(ring(4)).toFixed(2)}`);
  // A RIDGE UP ITS BACK: one corner of the first section stands on the
  // centreline, above the rest
  const r0 = ring(0), top = r0.reduce((m, p) => (p.y > m.y ? p : m));
  assert.ok(Math.abs(top.x) < 1e-6, 'the dock has a flat face up its back, not a ridge');
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
  assert.ok(third / withers > 0.28,
    `a third of the way up the neck is ${(third / withers).toFixed(3)}x withers deep`);
  // ...and it has to LAST: the upper half of the neck is still a real thing
  // where it nears the head
  assert.ok(upper / withers > 0.2,
    `two thirds of the way up the neck is ${(upper / withers).toFixed(3)}x withers deep`);
  // BUT IT IS A NECK. The mane's fullness is hair standing on the crest; drawn
  // as the neck's own depth it is a horse with a thick neck.
  assert.ok(third / withers < 0.36 && upper / withers < 0.26,
    `the neck itself stays slim: ${(third / withers).toFixed(3)}x and ${(upper / withers).toFixed(3)}x withers`);
  // The root runs withers to the point of the breast, and the breast stands
  // well up the chest — so the root is not the whole depth of the chest, and
  // the brisket shows as a corner below it.
  assert.ok(rootDepth / withers > 0.36,
    `at the shoulder it is ${(rootDepth / withers).toFixed(3)}x withers deep`);
  assert.ok(endDepth / rootDepth < 0.4, `throat to root ${(endDepth / rootDepth).toFixed(2)}x`);
});

test('the mane is hair on the neck: proud of the crest, narrower than it, stepped lock to lock', () => {
  const horse = build();
  const withers = withersOf(horse);
  const body = find(horse.group, 'body')[0];
  const p = body.geometry.getAttribute('position');
  const { seg: SEG, top: TOP } = body.userData.ring;   // quadruped.js, A PROFILE LOFT
  const rings = (p.count - 2) / SEG;
  assert.ok(Number.isInteger(rings) && rings >= 6, 'the body is still a ring loft with two apexes');
  // the neck's own crest, poll back to withers: [y, z, half-width]
  const crest = [1, 2, 3, 4].map((k) => {
    const o = (rings - k) * SEG;
    return [p.getY(o + TOP) + body.position.y, p.getZ(o + TOP), Math.abs(p.getX(o))];
  });
  const at = (z) => {
    let i = 0;
    while (i < crest.length - 2 && z < crest[i + 1][1]) i++;
    const a = crest[i], b = crest[i + 1], t = (z - a[1]) / (b[1] - a[1]);
    return { y: a[0] + (b[0] - a[0]) * t, w: a[2] + (b[2] - a[2]) * t };
  };

  // The hair rides in the ears' mesh. Everything in that mesh that stands
  // over the neck, clear of the head, is mane.
  const ear = find(horse.group, 'ear');
  assert.equal(ear.length, 1, 'one mesh for the ears and the hair');
  const E = ear[0].geometry.getAttribute('position');
  const z0 = crest[3][1], z1 = crest[0][1];
  const hair = triangles(horse.group, (o) => o.name === 'ear');
  const N = 24, mid = [];
  for (let k = 3; k < N - 3; k++) {
    const z = z0 + (z1 - z0) * (k + 0.5) / N;
    mid.push(sectionY(hair, z).max - at(z).y);
  }
  // PROUD, and for the whole length of the neck: it stands off the crest by
  // enough to be a thing of its own, with no break in it
  assert.ok(Math.min(...mid) / withers > 0.012,
    `the mane runs the length of the neck without a break: lowest ${(Math.min(...mid) / withers).toFixed(3)}x withers`);
  const proud = Math.max(...mid) / withers;
  assert.ok(proud > 0.035 && proud < 0.08, `the mane stands ${proud.toFixed(3)}x withers off the crest`);
  // NARROWER: the step in width is what separates hair from neck off the
  // square-on view. Only what stands above the crest counts — below it is a
  // lock's buried foot.
  let wide = 0;
  for (let i = 0; i < E.count; i++) {
    const z = E.getZ(i);
    if (z < z0 + 0.1 * (z1 - z0) || z > z1 - 0.1 * (z1 - z0) || E.getY(i) < at(z).y) continue;
    wide = Math.max(wide, Math.abs(E.getX(i)) / at(z).w);
  }
  assert.ok(wide > 0.1 && wide < 0.45, `its upper edge is ${wide.toFixed(2)}x the neck's half-width`);

  // STEPPED, AND RUN OUT ONTO THE WITHERS: read off the hair's own outline,
  // poll back to the withers, as its height over the topline under it. Where
  // one lock ends and the next starts lower the outline drops at once; along
  // a lock it only ramps. The last lock is the exception: it falls away to
  // nothing on the withers, so the mane does not end in a step of its own on
  // top of the corner where the neck leaves the back.
  const oW = (rings - 5) * SEG;
  const wth = [p.getY(oW + TOP) + body.position.y, p.getZ(oW + TOP)];
  const line = (z) => (z >= z0 ? at(z).y : wth[0] + (crest[3][0] - wth[0]) * (z - wth[1]) / (z0 - wth[1]));
  const M = 400, zEnd = z1 - 0.04 * (z1 - z0);
  const rise = [];
  for (let k = 0; k <= M; k++) {
    const z = zEnd + (wth[1] - zEnd) * k / M;
    const top = sectionY(hair, z).max;
    rise.push(Number.isFinite(top) ? top - line(z) : 0);
  }
  let drops = 0;
  for (let k = 1; k <= M; k++) if (rise[k - 1] - rise[k] > 0.006 * withers) drops++;
  assert.ok(drops >= 3 && drops <= 5, `the outline steps down from lock to lock: ${drops} steps`);
  const tail = rise.slice(Math.round(0.9 * M));
  let step = 0;
  for (let k = 1; k < tail.length; k++) step = Math.max(step, tail[k - 1] - tail[k]);
  assert.ok(step < 0.004 * withers,
    `the mane's last run to the withers has no step in it: ${(step / withers).toFixed(4)}x withers`);
  assert.ok(rise[M - 2] < 0.012 * withers && rise[M - 2] > -0.01 * withers,
    `the mane has run out by the withers: ${(rise[M - 2] / withers).toFixed(3)}x withers left standing`);
  assert.ok(rise[Math.round(0.8 * M)] > 0.012 * withers, 'and it is still hair over the root of the neck');

  // The neck under it is the plain wedge: its own crest barely leaves the
  // straight line from withers to poll, so none of the fullness is neck.
  const a = crest[3], b = crest[0];
  const chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (const t of [crest[1], crest[2]]) {
    const clear = ((t[0] - a[0]) * (b[1] - a[1]) - (t[1] - a[1]) * (b[0] - a[0])) / chord;
    assert.ok(clear / chord < 0.07,
      `the neck's own crest stands only ${(clear / chord * 100).toFixed(1)}% of its length clear of its chord`);
  }

  // and a forelock lies forward of the ears, down the forehead
  const head = find(horse.group, 'head')[0];
  ear[0].geometry.computeBoundingBox();
  assert.ok(ear[0].geometry.boundingBox.max.z > head.position.z + 0.06 * withers, 'a forelock reaches forward of the ears');
});

test('each ear is a closed leaf rising out of a corner of the poll, buried at its base and inside the width of the head', () => {
  // A cone on an open ring, stood on a poll narrower than the ring, hangs out
  // past the side of the head: from in front there is paper under its outer
  // edge. The ears ride in one mesh with the hair, so each is found from its
  // tip — the highest thing on its side of the head — and held to being a
  // solid of its own whose base is inside the skull and whose outer side
  // stays within the head's own breadth.
  const horse = build();
  const withers = withersOf(horse);
  const head = triangles(horse.group, (o) => o.name === 'head');
  const headOut = Math.max(...head.map((t) => Math.max(Math.abs(t[0]), Math.abs(t[3]), Math.abs(t[6]))));
  const headTop = Math.max(...head.map((t) => Math.max(t[1], t[4], t[7])));
  const all = triangles(horse.group, (o) => o.name === 'ear');
  for (const side of [-1, 1]) {
    const part = partOf(all, cornerKey(all, (x, y) => (side * x > 0.4 * headOut ? y : -Infinity)));
    assert.ok(part.closed, 'an ear is open underneath');
    assert.ok(part.tris.length <= 16, `an ear is a part of its own, not joined to the hair: ${part.tris.length} faces`);
    const buried = part.verts.filter((p) => inside(head, p));
    assert.ok(buried.length >= 4, `only ${buried.length} corners of an ear's base are inside the skull`);
    const out = Math.max(...part.verts.map((p) => side * p.x));
    assert.ok(out < 1.02 * headOut, `an ear hangs out past the side of the head: ${out.toFixed(3)} against ${headOut.toFixed(3)}`);
    assert.ok(Math.max(...buried.map((p) => side * p.x)) > 0.6 * headOut, 'its base reaches toward the side of the poll');
    // upright and small: it stands over the poll by a few hundredths of the
    // withers' height, and leans out less than it stands
    const tip = part.verts.reduce((m, p) => (p.y > m.y ? p : m));
    const foot = buried.reduce((m, p) => ({ x: m.x + p.x / buried.length, y: m.y + p.y / buried.length }), { x: 0, y: 0 });
    const rise = (tip.y - headTop) / withers;
    assert.ok(rise > 0.03 && rise < 0.1, `an ear stands ${rise.toFixed(3)}x withers over the poll`);
    assert.ok(Math.abs(tip.x - foot.x) < 0.4 * (tip.y - foot.y), 'an ear lies out sideways');
    // a leaf: broader partway up than where it leaves the skull would give a
    // straight-sided triangle
    const free = part.verts.filter((p) => !buried.includes(p) && p !== tip);
    assert.ok(free.length >= 3, 'an ear has a section between base and tip');
    assert.ok(Math.max(...free.map((p) => side * p.x)) > Math.max(...buried.map((p) => side * p.x)),
      'the ear bows outward above its base');
  }
});

test('slim legs under real mass: the cannon is a fraction of the chest, the forearm a column over it', () => {
  const horse = build();
  const { plan } = horse;
  const chest = sectionY(bodyOf(horse.group), plan.zShoulder - 1e-3);
  // fore-and-aft thickness of one leg at a height, stated as a fraction of
  // the brisket's own height off the ground, x the chest's depth
  const legs = find(horse.group, 'leg');
  const front = legs.find((l) => l.position.z > 0), hind = legs.find((l) => l.position.z < 0);
  const thick = (leg, f) => {
    const s = sectionZ(triangles(horse.group, (o) => o === leg), f * chest.min);
    return (s.max - s.min) / chest.depth;
  };
  const forearm = thick(front, 0.7), cannonF = thick(front, 0.2);
  const gaskin = thick(hind, 0.75), cannonH = thick(hind, 0.2);
  // The slimness is the cannon's, and the forearm over it is a column, not a
  // wedge: a little broader than the cannon, near one width from the knee to
  // where it opens into the chest. Broad at the elbow and spent by the knee,
  // it leaned its rear line back into the belly like a hind thigh, and it was
  // fat.
  assert.ok(forearm > 0.15 && forearm < 0.24, `the forearm is ${forearm.toFixed(2)}x the chest's depth`);
  assert.ok(cannonF > 0.1 && cannonF < 0.17, `the front cannon is ${cannonF.toFixed(2)}x`);
  assert.ok(forearm > cannonF * 1.2, `and the forearm stands on it: ${(forearm / cannonF).toFixed(2)}x the cannon`);
  const knee = thick(front, 0.45);
  assert.ok(knee > 0.7 * forearm, `a wedge: ${knee.toFixed(2)}x at the knee against ${forearm.toFixed(2)}x above`);
  assert.ok(gaskin > 0.2 && gaskin < 0.27, `the gaskin is ${gaskin.toFixed(2)}x the chest's depth`);
  assert.ok(cannonH > 0.1 && cannonH < 0.17, `the hind cannon is ${cannonH.toFixed(2)}x`);
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
