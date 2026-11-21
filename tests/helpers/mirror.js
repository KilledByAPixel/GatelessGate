// Mirror-symmetry and winding probes for the kit's animals, shared by
// tests/symmetry.test.js and the dev audit script beside it.
//
// AN ANIMAL AT REST IS ITS OWN MIRROR IMAGE about its x = 0 plane, in its
// vertices AND in how they are joined into triangles: a quad that is not flat
// folds along whichever diagonal splits it, so two sides with the same points
// but differently split quads are two differently shaped sides. So the
// measure here is the SURFACE, not the vertex list: every triangle of a mesh
// is sampled (corners, edge midpoints, centre), the samples are reflected,
// and each must land on the partner mesh's surface — the mesh itself for a
// part on the midline, the other one of a left/right pair otherwise. A fold
// along the other diagonal leaves the reflected centre of each half off the
// partner by the depth of the fold, which is exactly the crease it draws.
import * as THREE from '../../lib/three.module.js';

// Every mesh under `root`, with its triangles in root's own frame.
export function meshesOf(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.getAttribute('position')) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const p = o.geometry.getAttribute('position'), idx = o.geometry.index;
    const n = idx ? idx.count : p.count;
    const tris = [];
    for (let i = 0; i + 2 < n; i += 3) {
      tris.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m)));
    }
    const box = new THREE.Box3();
    for (const t of tris) for (const v of t) box.expandByPoint(v);
    out.push({ mesh: o, name: o.name, tris, box, centre: box.getCenter(new THREE.Vector3()) });
  });
  return out;
}

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5).
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), ap = new THREE.Vector3(), bp = new THREE.Vector3(), cp = new THREE.Vector3();
function closest(p, a, b, c, out) {
  ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);
  bp.subVectors(p, b);
  const d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return out.copy(a).addScaledVector(ab, d1 / (d1 - d3));
  cp.subVectors(p, c);
  const d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return out.copy(a).addScaledVector(ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    return out.copy(b).addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  }
  const den = 1 / (va + vb + vc);
  return out.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den);
}

const faceNormal = (t, out = new THREE.Vector3()) => out.subVectors(t[1], t[0]).cross(ac.subVectors(t[2], t[0])).normalize();

// How far the reflection of `a`'s surface lies from `b`'s, at its worst, and
// how many of its faces land on a face of `b` that looks the other way (a
// winding that is not mirrored). Zero-area triangles carry no surface and are
// skipped.
export function mirrorGap(a, b) {
  const q = new THREE.Vector3(), best = new THREE.Vector3(), s = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3();
  const bt = b.tris.map((t) => ({ t, box: new THREE.Box3().setFromPoints(t), n: faceNormal(t) }));
  let worst = 0, at = null, flipped = 0;
  for (const t of a.tris) {
    const area = ab.subVectors(t[1], t[0]).cross(ac.subVectors(t[2], t[0])).length();
    if (area < 1e-12) continue;
    faceNormal(t, na); na.x = -na.x;
    const samples = [t[0], t[1], t[2],
      t[0].clone().add(t[1]).multiplyScalar(0.5), t[1].clone().add(t[2]).multiplyScalar(0.5),
      t[2].clone().add(t[0]).multiplyScalar(0.5),
      t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3)];
    for (let k = 0; k < samples.length; k++) {
      s.copy(samples[k]); s.x = -s.x;
      let d = Infinity, face = null;
      for (const f of bt) {
        if (f.box.distanceToPoint(s) >= d) continue;
        closest(s, f.t[0], f.t[1], f.t[2], q);
        const dq = q.distanceTo(s);
        if (dq < d) { d = dq; best.copy(q); face = f; }
      }
      if (d > worst) { worst = d; at = s.clone(); }
      // the centre sample says which face it lies on cleanly; a corner sits on several
      if (k === 6 && face && d < 1e-4 && nb.copy(face.n).dot(na) < 0) flipped++;
    }
  }
  return { gap: worst, at, flipped };
}

// Each mesh's mirror partner: the mesh of the same name whose reflected box
// centre is nearest its own — itself, for a part standing on the midline.
export function partnerOf(m, all) {
  const r = m.centre.clone(); r.x = -r.x;
  let best = null, d = Infinity;
  for (const o of all) {
    if (o.name !== m.name) continue;
    const dd = o.centre.distanceTo(r);
    if (dd < d) { d = dd; best = o; }
  }
  return best;
}

// The whole animal: one row per mesh, worst first. `skip(name)` leaves out a
// part whose rest pose is meant to be one-sided.
export function symmetryReport(root, { skip = () => false } = {}) {
  const all = meshesOf(root).filter((m) => !skip(m.name));
  return all.map((m, i) => {
    const p = partnerOf(m, all);
    const r = mirrorGap(m, p);
    return { name: m.name, i, partner: p === m ? 'self' : all.indexOf(p), ...r };
  }).sort((x, y) => y.gap - x.gap);
}

// WHICH WAY A MESH FACES. Vertices are welded by position (a loft's seam, a
// soup of separate triangles), triangles grouped into the pieces they make,
// and each piece read for whether it is closed — every edge shared by exactly
// two faces, once each way round — and, closed, for its signed volume, which
// is positive when it faces out.
export function shellsOf(tris, eps = 1e-6) {
  const key = (v) => `${Math.round(v.x / eps)},${Math.round(v.y / eps)},${Math.round(v.z / eps)}`;
  const ids = new Map(), pos = [];
  const id = (v) => { const k = key(v); if (!ids.has(k)) { ids.set(k, pos.length); pos.push(v); } return ids.get(k); };
  const faces = tris.map((t) => t.map(id)).filter(([a, b, c]) => a !== b && b !== c && c !== a);
  const parent = pos.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const [a, b, c] of faces) { parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const groups = new Map();
  for (const f of faces) {
    const r = find(f[0]);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(f);
  }
  return [...groups.values()].map((fs) => {
    const directed = new Map();
    for (const [a, b, c] of fs) for (const [u, v] of [[a, b], [b, c], [c, a]]) directed.set(`${u}>${v}`, (directed.get(`${u}>${v}`) || 0) + 1);
    let open = 0, twisted = 0;
    for (const [k, n] of directed) {
      const [u, v] = k.split('>');
      const back = directed.get(`${v}>${u}`) || 0;
      if (n > 1) twisted++;
      else if (back === 0) open++;
    }
    let vol = 0;
    const c = new THREE.Vector3();
    for (const [a, b, d] of fs) vol += pos[a].dot(c.crossVectors(pos[b], pos[d])) / 6;
    return { faces: fs.length, open, twisted, volume: vol };
  });
}

// EVERY KIT ANIMAL AT REST, as the test holds it. Build-time state is the
// design and must be symmetric; what is left out or put back here is MOTION,
// each with its reason:
//
//   - a head's yaw (and the dog's cock), an ear's twitch, a tail's wag or
//     sweep: the idle drift `update(0, 0)` has already applied at build, and
//     a turn about y or z is one-sided by nature. Put back to rest — never
//     the pitch about x, which a mirror leaves alone.
//   - a verlet strand (horse, buffalo): its warm-up runs the idle sway, so it
//     is built mid-swing. tests/symmetry.test.js holds the strand's own loft
//     to symmetry separately, built straight.
//   - the cat's tail: it hooks round to one side by design (the seed picks
//     which), with a seeded kink in every joint.
export async function restAnimals() {
  const kit = await import('../../src/kit/index.js');
  const still = (o, axes = ['y', 'z']) => { if (o) for (const a of axes) o.rotation[a] = 0; };
  return [
    {
      key: 'dog', build: () => {
        const d = kit.makeDog({});
        still(d.head); still(d.tail);
        for (const e of d.ears) e.rotation.x = e.userData.baseX;
        return d.group;
      }, skip: () => false,
    },
    {
      key: 'fox', build: () => {
        const f = kit.makeFox({});
        still(f.head); still(f.tail);
        for (const e of f.ears) e.rotation.x = 0;
        return f.group;
      }, skip: () => false,
    },
    { key: 'cat', build: () => kit.makeCat({}).group, skip: (n) => n === 'tailseg' },
    { key: 'cat-stand', build: () => kit.makeCat({ pose: 'stand' }).group, skip: (n) => n === 'tailseg' },
    { key: 'horse', build: () => kit.makeHorse({}).group, skip: (n) => n === 'strand' },
    { key: 'buffalo', build: () => kit.makeBuffalo({}).group, skip: (n) => n === 'strand' },
  ];
}
