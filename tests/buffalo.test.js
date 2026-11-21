import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../lib/three.module.js';
import { makeBuffalo } from '../src/kit/buffalo.js';
import { triangles, sectionY, sectionZ } from './helpers/quadruped-probe.js';

// What makes the shared body plan a WATER BUFFALO: a trunk that is most of his
// height and falls from high withers to a low croup, a deep blunt block of a
// head carried low and nosed down, and horns that lie out sideways and back in
// a crescent. Each of these is read off the meshes, so they hold whichever way
// the trunk, head and horns are built.

const H = 1.4;

// The ears and the hanging hair share one mesh. The ears stand wholly out to
// one side of the skull; everything in that mesh that reaches the middle of
// him is hair.
const isHair = (t) => {
  const xs = [t[0], t[3], t[6]];
  return Math.min(...xs.map(Math.abs)) < 0.09 * H || (Math.min(...xs) < 0 && Math.max(...xs) > 0);
};
const points = (tris) => tris.flatMap((t) => [0, 3, 6].map((k) => new THREE.Vector3(t[k], t[k + 1], t[k + 2])));

function probe() {
  const b = makeBuffalo({ height: H });
  const root = b.group;
  root.updateMatrixWorld(true);
  const cloud = (name) => {
    const pts = [];
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh || o.name !== name) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).clone());
    });
    return pts;
  };
  const ext = (pts, k) => Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k]));
  const body = triangles(root, (o) => o.name === 'body');
  const legZ = root.children.filter((c) => c.name === 'leg').map((c) => c.position.z);
  const withers = sectionY(body, Math.max(...legZ) - 1e-3).max;
  const horns = root.children.filter((c) => c.name === 'horn');
  return { b, root, cloud, ext, body, withers, horns };
}

test('the buffalo carries its head below its withers, nosed down', () => {
  const { cloud, withers } = probe();
  const head = cloud('head');
  const zs = head.map((p) => p.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const mean = (pts) => pts.reduce((s, p) => s + p.y, 0) / pts.length;
  // the two ends of the skull, each taken as the top of its own slice so a jaw
  // or an ear hanging off either end cannot stand in for the forehead line
  const top = (pts) => Math.max(...pts.map((p) => p.y));
  const rear = head.filter((p) => p.z < z0 + 0.2 * (z1 - z0));
  const front = head.filter((p) => p.z > z1 - 0.2 * (z1 - z0));
  const poll = top(rear);
  assert.ok(poll < withers - 0.08 * H,
    `the poll (${poll.toFixed(2)}) is carried clearly under the withers (${withers.toFixed(2)})`);
  // LOW is not enough: a level head held low is a drawer pulled out of the
  // chest. The forehead line falls from poll to muzzle.
  const drop = poll - top(front);
  assert.ok(drop > 0.3 * (z1 - z0),
    `the forehead falls ${drop.toFixed(2)} over a head ${(z1 - z0).toFixed(2)} long`);
  assert.ok(mean(front) < mean(rear), 'the muzzle hangs below the back of the skull');
});

test('the back falls in one line from high withers to a low croup', () => {
  const { root, body, withers } = probe();
  const legZ = root.children.filter((c) => c.name === 'leg').map((c) => c.position.z);
  const zf = Math.max(...legZ), zh = Math.min(...legZ);
  const croup = sectionY(body, zh + 1e-3).max;
  assert.ok(withers - croup > 0.14 * H,
    `the back falls ${((withers - croup) / H).toFixed(3)} of his height from withers to croup`);
  // ...and spends that fall evenly. A level back with a rise at the front end
  // of it is a long box with a hump on; a step down ahead of the rump is a
  // table with a rump on.
  let off = 0;
  for (let i = 1; i < 20; i++) {
    const s = i / 20;
    const top = sectionY(body, zh + (zf - zh) * s).max;
    off = Math.max(off, Math.abs(top - (croup + (withers - croup) * s)));
  }
  assert.ok(off < 0.025 * H, `the back strays ${(off / H).toFixed(3)} of his height off the straight line`);
  // THE TRUNK IS MOST OF HIM: the legs are what is left under the chest
  const chest = sectionY(body, zf - 1e-3);
  assert.ok(chest.depth > 0.69 * withers,
    `a chest ${chest.depth.toFixed(2)} deep under withers ${withers.toFixed(2)} off the ground`);
});

test('the head is one deep blunt block, not a wedge and not a ball with a muzzle on it', () => {
  const { root, cloud, ext, body, withers } = probe();
  const names = [];
  root.traverse((o) => names.push(o.name));
  assert.ok(!names.includes('snout'), 'skull and muzzle are one piece');
  const head = cloud('head');
  // length along the head's own line, poll to nose
  const nose = head.reduce((a, p) => (p.z > a.z ? p : a));
  const back = head.reduce((a, p) => (p.z < a.z ? p : a));
  const len = Math.hypot(nose.y - back.y, nose.z - back.z);
  const wide = ext(head, 'x');
  assert.ok(len > 1.4 * wide, `the head is ${len.toFixed(2)} long on ${wide.toFixed(2)} across`);
  // DEEP, in the head's own frame (the mesh is tilted; its geometry is not):
  // a head that is long for its depth and narrows to the nose is an anteater's
  const geo = root.getObjectByName('head').geometry;
  geo.computeBoundingBox();
  const hb = geo.boundingBox;
  const deep = hb.max.y - hb.min.y, long = hb.max.z - hb.min.z;
  assert.ok(deep > 0.6 * long, `the skull is ${deep.toFixed(2)} deep on ${long.toFixed(2)} long`);
  // ...but it is a skull, and a jaw's depth is all it has: carried deeper to
  // stand for the beard under it, the head is as deep as the chest it hangs
  // in front of and the beard is body
  assert.ok(deep < 0.22 * withers, `the skull is ${(deep / withers).toFixed(3)} of the withers' height deep`);
  // and BLUNT: the last quarter of it keeps most of that depth
  const p = geo.getAttribute('position');
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < hb.max.z - 0.25 * long) continue;
    lo = Math.min(lo, p.getY(i)); hi = Math.max(hi, p.getY(i));
  }
  assert.ok(hi - lo > 0.7 * deep, `the muzzle keeps ${((hi - lo) / deep).toFixed(2)} of the skull's depth`);
  // BROAD-MUZZLED: it narrows toward the nose, but never to a snout
  const zs = head.map((p) => p.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const muzzle = ext(head.filter((p) => p.z > z1 - 0.25 * (z1 - z0)), 'x');
  assert.ok(muzzle > 0.55 * wide && muzzle < 0.9 * wide,
    `the muzzle is ${(muzzle / wide).toFixed(2)} of the skull's width`);
  // and the whole head stays small against the animal: an oversized one is
  // most of what reads as a toy
  let bw = 0;
  for (const t of body) for (let k = 0; k < 9; k += 3) bw = Math.max(bw, Math.abs(t[k]));
  assert.ok(wide < 0.7 * 2 * bw, `a head ${wide.toFixed(2)} across on a body ${(2 * bw).toFixed(2)} across`);
});

test('the horns sweep wider than they rise, out and back', () => {
  const { root, horns, cloud, ext, withers } = probe();
  assert.equal(horns.length, 2, 'two horns');
  // SIDE-ON THEY STILL SHOW. The nape climbs from the poll to withers that
  // stand well over it, and a horn laid back inside that line leaves a
  // hornless animal in profile. Somewhere along its sweep the horn stands
  // clear above everything solid in the same column.
  const solid = triangles(root, (o) => o.name === 'body' || o.name === 'head');
  const hornTris = triangles(root, (o) => o.name === 'horn');
  const zs = cloud('horn').map((p) => p.z);
  let clear = -Infinity;
  for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.004 * H) {
    const a = sectionY(hornTris, z), b = sectionY(solid, z);
    if (Number.isFinite(a.max) && Number.isFinite(b.max)) clear = Math.max(clear, a.max - b.max);
  }
  assert.ok(clear > 0.05 * H, `side-on the horn stands ${(clear / H).toFixed(3)} of his height clear of the nape`);
  const all = cloud('horn');
  const span = ext(all, 'x');
  for (const horn of horns) {
    const bb = new THREE.Box3().setFromObject(horn);
    const base = horn.position;
    const reach = Math.max(Math.abs(bb.max.x - base.x), Math.abs(bb.min.x - base.x));
    const rise = bb.max.y - base.y;
    // A CRESCENT LAID BACK: upright horns are a goat's from the front and a
    // pair of ears from the side. They do climb — along the nape, which is the
    // only way they show from the side — but always less than they spread.
    assert.ok(reach > 1.5 * rise, `a horn reaches ${reach.toFixed(2)} out and rises ${rise.toFixed(2)}`);
    assert.ok(base.z - bb.min.z > 0.5 * reach,
      `and sweeps back ${(base.z - bb.min.z).toFixed(2)} behind its base`);
    assert.ok(bb.max.z - base.z < 0.25 * reach, 'never forward of it');
    // lying back toward the plane of the back, never standing over it
    assert.ok(bb.max.y < withers, `the horn tops out at ${bb.max.y.toFixed(2)}, under the withers ${withers.toFixed(2)}`);
  }
  // WIDE: the pair outreaches the trunk itself
  assert.ok(span > 0.85 * H, `tip to tip ${span.toFixed(2)} on a ${H} buffalo`);
});

test('small ears hang below the horn bases', () => {
  const { root, horns, cloud, ext } = probe();
  const ears = points(triangles(root, (o) => o.name === 'ear').filter((t) => !isHair(t)));
  assert.ok(ears.length > 0, 'the buffalo has ears');
  const hornBase = Math.min(...horns.map((h) => h.position.y));
  const mid = ears.reduce((s, p) => s + p.y, 0) / ears.length;
  assert.ok(mid < hornBase, `the ears sit at ${mid.toFixed(2)}, under the horn bases at ${hornBase.toFixed(2)}`);
  // on both sides, and much the smaller pair
  assert.ok(Math.min(...ears.map((p) => p.x)) < 0 && Math.max(...ears.map((p) => p.x)) > 0);
  assert.ok(ext(ears, 'x') < 0.6 * ext(cloud('horn'), 'x'), 'the ears do not compete with the horns');
  // and the pair is one draw, hair and all: the whole skull costs what the ball and spikes did
  assert.equal(root.children.filter((c) => c.name === 'ear').length, 1, 'one mesh for the ears and the hair');
  let meshes = 0;
  root.traverse((o) => { if (o.isMesh && !o.parent.name.includes('tail')) meshes++; });
  // body, four legs, head, an ear pair, two horns
  assert.ok(meshes <= 9, `${meshes} meshes besides the tail`);
});

// WHAT HANGS UNDER THE HEAD IS HAIR, NOT BODY: a beard under the jaw running
// back down the throat to a bib on the brisket. Four things make it hair, and
// each is read off the mesh: it hangs below everything it is hung from; its
// lower edge is a few large points with the page between them; it is
// narrower than what carries it; and it stops clear of the front legs.
test('a beard and a fringe hang under the head and throat, ragged, narrow and clear of the legs', () => {
  const { root, body } = probe();
  const hair = triangles(root, (o) => o.name === 'ear').filter(isHair);
  assert.ok(hair.length > 0, 'the buffalo has hair hanging under him');
  const skull = triangles(root, (o) => o.name === 'head');
  const solid = [...body, ...skull];
  const front = root.children.filter((c) => c.name === 'leg' && c.position.z > 0);
  const legs = triangles(root, (o) => front.includes(o));
  const zs = points(hair).map((p) => p.z);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const chin = Math.max(...points(skull).map((p) => p.z));
  assert.ok(z1 > chin - 0.2 * H && z0 < chin - 0.3 * H,
    `it runs from under the jaw back to the brisket: z ${(z0 / H).toFixed(2)} to ${(z1 / H).toFixed(2)}`);

  // THE LOWER EDGE, walked front to back: where it turns from falling to
  // rising is a point, from rising to falling a notch
  const N = 240, edge = [], hung = [];
  for (let i = 1; i < N; i++) {
    const z = z0 + (z1 - z0) * (i / N);
    edge.push(sectionY(hair, z).min);
    hung.push(sectionY(solid, z).min - edge[i - 1]);
  }
  assert.ok(Math.max(...hung) > 0.12 * H, `its longest point hangs ${(Math.max(...hung) / H).toFixed(3)} of his height below him`);
  const turns = [];
  for (let i = 1; i < edge.length - 1; i++) {
    const down = edge[i] < edge[i - 1], up = edge[i + 1] > edge[i];
    if (down && up) turns.push({ y: edge[i], point: true });
    else if (!down && !up) turns.push({ y: edge[i], point: false });
  }
  const tips = turns.filter((t) => t.point);
  assert.ok(tips.length >= 3 && tips.length <= 6, `a few large points, not a straight edge and not a comb: ${tips.length}`);
  for (let i = 1; i < turns.length - 1; i++) {
    if (turns[i].point) continue;
    const bite = turns[i].y - Math.max(turns[i - 1].y, turns[i + 1].y);
    assert.ok(bite > 0.04 * H, `the page shows ${(bite / H).toFixed(3)} of his height up between two points`);
  }

  // NARROWER THAN WHAT CARRIES IT, all the way along
  const across = (tris, z) => {
    let w = 0;
    for (const t of tris) {
      for (let e = 0; e < 3; e++) {
        const a = e * 3, b = ((e + 1) % 3) * 3;
        if ((t[a + 2] - z) * (t[b + 2] - z) > 0 || t[a + 2] === t[b + 2]) continue;
        w = Math.max(w, Math.abs(t[a] + (t[b] - t[a]) * ((z - t[a + 2]) / (t[b + 2] - t[a + 2]))));
      }
    }
    return w;
  };
  for (let i = 1; i < 12; i++) {
    const z = z0 + (z1 - z0) * (i / 12);
    assert.ok(across(hair, z) < 0.75 * across(solid, z),
      `at z = ${(z / H).toFixed(2)} the hair is ${(across(hair, z) / across(solid, z)).toFixed(2)} of the width it hangs from`);
  }

  // ITS FOOT IS BURIED: the top of every section is under the hide
  const tops = new Map();
  for (const p of points(hair)) {
    const k = p.z.toFixed(4);
    if (!tops.has(k) || p.y > tops.get(k).y) tops.set(k, p);
  }
  for (const p of tops.values()) {
    assert.ok(inside(body, p) || inside(skull, p), `the hair's foot at z = ${(p.z / H).toFixed(2)} is inside him`);
  }

  // CLEAR OF THE FRONT LEGS: below the brisket there is paper between the
  // last point and the leg, at every height the point reaches
  const lowest = Math.min(...edge);
  const brisket = sectionY(body, z0).min;
  let rows = 0;
  for (let y = lowest + 0.01 * H; y < brisket - 0.02 * H; y += 0.01 * H) {
    const gap = sectionZ(hair, y).min - sectionZ(legs, y).max;
    assert.ok(gap > 0.05 * H, `at y = ${(y / H).toFixed(2)} the hair stands ${(gap / H).toFixed(3)} of his height ahead of the leg`);
    rows++;
  }
  assert.ok(rows > 8, 'and the last point hangs well below the brisket');
});

// The back line is the plan's own (`torso.sag`), not a restatement laid over
// the trunk after the build — so what the plan reports is what renders, and
// anything seated on the back from `plan.topAt` sits on the back.
test('the plan reports the back that renders', () => {
  const b = makeBuffalo({ height: H });
  b.group.updateMatrixWorld(true);
  const body = triangles(b.group, (o) => o.name === 'body');
  const { zHip, zShoulder } = b.plan;
  for (let i = 0; i <= 10; i++) {
    const z = zHip + (zShoulder - zHip - 1e-6) * (i / 10);
    const drift = Math.abs(b.plan.topAt(z) - sectionY(body, z).max);
    assert.ok(drift < 1e-6 * H, `plan.topAt is ${drift.toFixed(4)} off the trunk at z = ${z.toFixed(2)}`);
  }
});

// A THIN TAIL WITH A TUFT ON ITS END. Read off the strand's own rings: the
// rope tapers from the root, then one ring near the tip stands well out of
// that taper, and the ring after it is drawn in again.
test('the tail is a rope that ends in a tuft', () => {
  const b = makeBuffalo({ height: H });
  const skin = b.group.getObjectByName('strand');
  const nodes = b.tail.nodes();
  const n = nodes.length;
  const P = skin.geometry.getAttribute('position');
  const sides = 6;   // the skin's own; its vertex count also carries the buried root ring
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  const r = nodes.map((node, ring) => {
    c.set(...node);
    let far = 0;
    for (let j = 0; j < sides; j++) far = Math.max(far, v.fromBufferAttribute(P, ring * sides + j).distanceTo(c));
    return far;
  });
  const tuft = 2 + r.slice(2).indexOf(Math.max(...r.slice(2)));
  assert.ok(tuft >= n - 3 && tuft < n - 1, `the tuft is ring ${tuft} of ${n}: near the tip, not on it`);
  assert.ok(r[tuft] > 1.8 * r[tuft - 1], `it stands out of the rope: ${r[tuft].toFixed(3)} against ${r[tuft - 1].toFixed(3)}`);
  assert.ok(r[n - 1] < 0.5 * r[tuft], 'and closes again below');
  for (let i = 1; i < tuft; i++) assert.ok(r[i] < r[i - 1], `the rope above it tapers (ring ${i})`);
  assert.ok(r[tuft] < 1.3 * r[0], 'a tuft, not a club: no fuller than the root of the tail');
});

// Is a point inside a closed surface? Parity of crossings along one skew ray,
// asked of the triangles that render.
function inside(tris, p) {
  const dx = 0.5377, dy = 0.8011, dz = 0.2618;
  let hits = 0;
  for (const t of tris) {
    const e1x = t[3] - t[0], e1y = t[4] - t[1], e1z = t[5] - t[2];
    const e2x = t[6] - t[0], e2y = t[7] - t[1], e2z = t[8] - t[2];
    const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-14) continue;
    const sx = p.x - t[0], sy = p.y - t[1], sz = p.z - t[2];
    const u = (sx * hx + sy * hy + sz * hz) / det;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) / det;
    if (v < 0 || u + v > 1) continue;
    if ((e2x * qx + e2y * qy + e2z * qz) / det > 1e-9) hits++;
  }
  return hits % 2 === 1;
}

// LIMBS UNDER A MASS. Side-on, the leg between the hoof and the belly is a
// small fraction of the chest's depth — at a sixth of it the animal stands on
// posts — and it is still a leg with a shape: thicker where it leaves the
// belly, and standing on a hoof wider than the cannon over it.
test('the legs are limbs under the trunk, not posts', () => {
  const { root, body } = probe();
  const legs = root.children.filter((c) => c.name === 'leg');
  const chest = sectionY(body, Math.max(...legs.map((l) => l.position.z)) - 1e-3);
  for (const leg of legs) {
    const tris = triangles(root, (o) => o === leg);
    const wide = (f) => sectionZ(tris, f * chest.min).depth;
    let cannon = Infinity;
    for (let f = 0.15; f < 0.6; f += 0.05) cannon = Math.min(cannon, wide(f));
    assert.ok(cannon < 0.13 * chest.depth,
      `a cannon ${(cannon / chest.depth).toFixed(3)} of the chest's depth is a post`);
    assert.ok(cannon > 0.07 * chest.depth, `and ${(cannon / chest.depth).toFixed(3)} of it is a deer's`);
    // read at the leg's own belly: the chest hangs down around the front
    // legs (torso.arm), and the brisket's height there is not where the
    // hind leg leaves the trunk
    const own = sectionY(body, leg.position.z + (leg.position.z > 0 ? -1e-3 : 1e-3));
    assert.ok(sectionZ(tris, 0.9 * own.min).depth > 1.5 * cannon, 'the leg is thickest where it leaves the belly');
    assert.ok(wide(0.05) > 1.3 * cannon, 'and stands on a hoof wider than its cannon');
    if (leg.position.z < 0) continue;
    // A FRONT LEG IS A HEAVY ARM, NOT A THIGH. Slim all the way up it is a
    // post set under a box; broad at the elbow and tapering hard it is a hind
    // thigh under the chest. The forearm is a column well over the cannon's
    // breadth, near one width to the top, opening into the chest there.
    assert.ok(wide(0.6) > 1.3 * cannon, `the forearm is ${(wide(0.6) / cannon).toFixed(2)}x the cannon`);
    assert.ok(wide(0.75) < 1.2 * wide(0.6), `a wedge: ${(wide(0.75) / wide(0.6)).toFixed(2)}x broader a little higher`);
    assert.ok(wide(0.9) > wide(0.75), 'and it opens into the chest at its top');
    assert.ok(wide(0.9) < 0.2 * chest.depth, `but still a leg: ${(wide(0.9) / chest.depth).toFixed(3)} of the chest's depth`);
  }
});

// half the breadth of a set of triangles at one height on one station
function halfWidthAt(tris, z, y) {
  let w = 0;
  for (const t of tris) {
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e * 3, b = ((e + 1) % 3) * 3;
      if ((t[a + 2] - z) * (t[b + 2] - z) > 0 || t[a + 2] === t[b + 2]) continue;
      const k = (z - t[a + 2]) / (t[b + 2] - t[a + 2]);
      pts.push([t[a] + (t[b] - t[a]) * k, t[a + 1] + (t[b + 1] - t[a + 1]) * k]);
    }
    if (pts.length < 2) continue;
    const [p, q] = pts;
    if ((p[1] - y) * (q[1] - y) > 0 || p[1] === q[1]) continue;
    w = Math.max(w, Math.abs(p[0] + (q[0] - p[0]) * ((y - p[1]) / (q[1] - p[1]))));
  }
  return w;
}

// A BROAD ROUNDED MASS, WITH THE SHOULDER ITS OWN PLANE. From in front a
// section that is widest along one line and falls straight away above and
// below it is a diamond; his keeps most of its breadth well up toward the
// back and well down toward the belly. And the shoulder ends: just behind the
// elbow the trunk is drawn in a little before the ribs swell out again, which
// is the edge that sets the shoulder off on his side.
test('the trunk is a barrel, not a diamond, and the shoulder is set off by a girth behind it', () => {
  const b = makeBuffalo({ height: H });
  b.group.updateMatrixWorld(true);
  const body = triangles(b.group, (o) => o.name === 'body');
  const { zShoulder, zHip } = b.plan;
  const mid = (z) => { const c = sectionY(body, z); return (c.max + c.min) / 2; };
  for (const z of [zShoulder - 1e-3, 0.5 * zHip]) {
    const c = sectionY(body, z), m = mid(z);
    // (down only so far: below that the underside rounds into a keel)
    for (const [end, f] of [[c.max, 0.6], [c.min, 0.45]]) {
      const kept = halfWidthAt(body, z, m + f * (end - m)) / halfWidthAt(body, z, m);
      assert.ok(kept > 0.8, `at z = ${(z / H).toFixed(2)} the section keeps ${kept.toFixed(2)} of its breadth ${end === c.max ? 'up' : 'down'}`);
    }
  }
  const at = (z) => halfWidthAt(body, z, mid(z));
  const zG = zShoulder - 0.16 * (zShoulder - zHip);
  let waist = Infinity, zW = 0;
  for (let z = zG - 0.04 * H; z <= zG + 0.04 * H; z += 0.005 * H) if (at(z) < waist) { waist = at(z); zW = z; }
  assert.ok(waist < 0.985 * at(zShoulder - 1e-3), `behind the shoulder he is drawn in to ${(waist / at(zShoulder - 1e-3)).toFixed(3)} of its breadth`);
  assert.ok(waist < 0.985 * at(0), `and swells again behind that: ${(waist / at(0)).toFixed(3)} of the ribs`);
});

// THE TAIL GOES INTO THE RUMP. Its skin starts on a ring laid down past the
// strand's own rings, and that ring — with the point the skin closes on — is
// wholly under the trunk's surface with room to spare, at the root's full
// girth, while the stub's free end is outside: the surface is crossed by the
// side of the tail, never by its end. The buried run and the stub are rigid,
// so this holds through a swish as it does at rest; both are asked.
test('the tail enters the rump at full girth, its end buried', () => {
  const b = makeBuffalo({ height: H });
  b.group.updateMatrixWorld(true);
  const trunk = triangles(b.group, (o) => o.name === 'body');
  const skin = b.group.getObjectByName('strand');
  const P = skin.geometry.getAttribute('position');
  const n = b.tail.nodes().length;
  const SIDES = 6;
  assert.equal(P.count, (n + 1) * SIDES + 2, 'the skin carries one ring more than the strand has nodes');
  const at = (i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(skin.matrixWorld);
  const apexAt = n * SIDES, buried = n * SIDES + 2;
  const girth = (r0) => Math.max(...Array.from({ length: SIDES }, (_, j) => at(r0 + j).distanceTo(at(r0 + (j + 3) % SIDES))));
  const check = (when) => {
    const apex = at(apexAt);
    assert.ok(inside(trunk, apex), `${when}: the tail's closed end is inside the rump`);
    for (let j = 0; j < SIDES; j++) {
      // a quarter again its own size: buried, not merely covered
      const rim = at(buried + j).sub(apex).multiplyScalar(1.25).add(apex);
      assert.ok(inside(trunk, rim), `${when}: buried ring corner ${j} is under the surface`);
    }
    assert.ok(girth(buried) > 0.95 * girth(0), `${when}: and it is as thick as the root it runs out to`);
    const free = new THREE.Vector3(...b.tail.nodes()[1]).applyMatrix4(b.tail.group.matrixWorld);
    assert.ok(!inside(trunk, free), `${when}: the stub's free end is outside`);
  };
  check('at rest');
  b.tail.impulse(1.2);
  for (let i = 0; i < 90; i++) {
    b.update(1 / 60, i / 60);
    if (i % 6 === 0) check(`${i} steps into a swish`);
  }
});

// IT LEAVES AT THE TURN OF THE CROUP, AT A SLANT. Rooted down on the rump's
// own face and laid nearly as steep as the rump, the tail is a strut fixed to
// the back of him. So its root stands close under the croup and inside the
// trunk, and the stub leans well back off plumb to come out through the hide —
// but not so far that the one mitred ring at its free end, where the rope
// turns to hang, is pinched thin.
test('the tail leaves at the turn of the croup and comes out through the hide at a slant', () => {
  const b = makeBuffalo({ height: H });
  b.group.updateMatrixWorld(true);
  const [root, free] = b.tail.nodes();
  const dy = free[1] - root[1], dz = free[2] - root[2];
  const offPlumb = Math.atan2(Math.hypot(dz, free[0] - root[0]), -dy) * 180 / Math.PI;
  assert.ok(dz < 0 && offPlumb > 38, `the stub leans ${offPlumb.toFixed(0)} degrees back off plumb`);
  assert.ok(offPlumb < 50, `and no further: ${offPlumb.toFixed(0)} degrees is a pinched bend where the rope turns down`);
  const at = new THREE.Vector3(...root).applyMatrix4(b.tail.group.matrixWorld);
  const croup = b.plan.topAt(b.plan.zHip);
  assert.ok(croup - at.y < 0.17 * H && croup - at.y > 0.08 * H,
    `the root stands ${((croup - at.y) / H).toFixed(3)} of his height under the croup`);
  assert.ok(inside(triangles(b.group, (o) => o.name === 'body'), at), 'and inside the trunk');
});

// ...and it comes to rest hanging plumb behind the rump, not still swinging
// from its own construction: the tuft under the end of the stub, clear of the
// buttock, from the first frame anyone sees.
test('the tail is at rest when the buffalo is built', () => {
  const b = makeBuffalo({ height: H });
  b.group.updateMatrixWorld(true);
  const nodes = b.tail.nodes();
  const stubEnd = nodes[1];
  // every node of the rope, not only the tip: a rope still swinging in from
  // its construction is bowed in the middle with its tip nearly home
  for (let i = 2; i < nodes.length; i++) {
    assert.ok(Math.abs(nodes[i][2] - stubEnd[2]) < 0.014 * H,
      `node ${i} hangs ${((nodes[i][2] - stubEnd[2]) / H).toFixed(3)} of his height off plumb, fore and aft`);
    assert.ok(Math.abs(nodes[i][0]) < 0.014 * H, 'and on the centreline');
  }
  const rumpEnd = Math.min(...triangles(b.group, (o) => o.name === 'body').flatMap((t) => [t[2], t[5], t[8]]));
  assert.ok(b.tail.group.position.z + stubEnd[2] < rumpEnd, 'the rope hangs from behind the rump, not from inside it');
});

// THE HORNS GO INTO THE SKULL. Each horn's first ring is wholly inside the
// head and its tip wholly outside, so what crosses the skull's surface is the
// horn's side at full girth. A horn that begins at its own base has half that
// ring in the air and shows its end.
test('each horn is rooted inside the skull', () => {
  const { root, horns } = probe();
  const skull = triangles(root, (o) => o.name === 'head');
  for (const horn of horns) {
    const P = horn.geometry.getAttribute('position');
    const at = (i) => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(horn.matrixWorld);
    const SIDES = 6;
    const mid = new THREE.Vector3();
    for (let j = 0; j < SIDES; j++) mid.add(at(j));
    mid.multiplyScalar(1 / SIDES);
    for (let j = 0; j < SIDES; j++) {
      const rim = at(j).sub(mid).multiplyScalar(1.1).add(mid);
      assert.ok(inside(skull, rim), `the horn's first ring (corner ${j}) is inside the skull`);
    }
    // the buried ring is as thick as the horn is where it shows
    const girth = (ring) => Math.max(...Array.from({ length: SIDES }, (_, j) => at(ring * SIDES + j).distanceTo(at(ring * SIDES + (j + 3) % SIDES))));
    assert.ok(girth(0) > 0.95 * girth(1), 'and at full girth');
    // `position` is still where the horn leaves the head: on its surface, give or take
    assert.ok(inside(skull, horn.position) && !inside(skull, at(2 * SIDES).add(at(2 * SIDES + 3)).multiplyScalar(0.5)),
      'the horn leaves the skull between its base and the ring after');
  }
});
