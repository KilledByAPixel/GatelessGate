import * as THREE from '../../lib/three.module.js';

// HOW A LOFT'S QUADS BECOME TRIANGLES, for every ring loft in the kit.
//
// A quad between two rings is split along one of its diagonals, and unless
// its four corners lie in a plane — on a sculpted body they almost never do —
// the split is a fold: along one diagonal a ridge, along the other a crease.
// Every loft here used to split every quad along the SAME diagonal all the
// way round the ring. Going round, a diagonal that leans one way on the +x
// side is the opposite-handed diagonal of its own mirror image on the -x
// side, so the two sides of every animal were differently shaped: a ridge
// where the other side had a crease, a V point under one front leg and not
// the other, the diagonals across a cat's chest all leaning one way over the
// midline. The kit's judging shots were mostly taken from the +x side, and
// the other side went unseen for four passes.
//
// THE RULE: each quad folds OUTWARD — of its two diagonals, the one whose
// fold is a ridge, never a crease. On these bulging bodies a crease is never
// what was meant (it is the pinch under a leg's join, the dent in a flank),
// and the choice is made from the quad's own geometry, so a mirrored quad
// makes the mirrored choice and the two sides of an animal agree without
// either being told which side it is. A quad that is flat (as a quad lying
// across the midline always is) has no fold to choose by, and ties are broken
// by a fixed diagonal mirrored across x = 0, so a near-flat quad and its
// mirror cannot fall either side of the line by rounding.
//
// The other rule tried was the fixed diagonal mirrored across the midline
// everywhere, which keeps the +x side exactly as it was and copies it to the
// other. It only made the faults symmetric: the V point behind the foreleg's
// join and the crease down the flank at the girth were on both sides instead
// of one. What the outward fold costs: a part sunk into another bulges its
// own faces outward too, so the line where it meets the hide rises in the
// middle of each face and can read as a point; a part sunk that way has to
// sit only just under the skin, with its front set back under the body that
// hides it (the seated cat's arm, in cat.js). See tests/symmetry.test.js for
// the hold.
//
// A quad is [p0, p1, p2, p3], wound so that p0 -> p1 -> p2 faces out. Its
// mirror image is stated [m(p1), m(p0), m(p3), m(p2)] — which is what a ring
// laid the other way round gives — and the fixed tie-break diagonal (p1-p3 on
// the +x side, p0-p2 on the -x side) maps onto itself under that.
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
const P = (pos, i, out) => out.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), vd = new THREE.Vector3();

// how far `q` stands above the plane of (a, b, c), wound outward: positive
// is out, so the fold across the shared edge is a crease
function rise(a, b, c, q) {
  e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
  const len = n.length();
  return len < 1e-20 ? 0 : d.subVectors(q, a).dot(n) / len;
}

// Which diagonal: true for p1-p3, false for p0-p2.
export function splitOnP1P3(pos, q0, q1, q2, q3) {
  P(pos, q0, va); P(pos, q1, vb); P(pos, q2, vc); P(pos, q3, vd);
  // split p1-p3: triangles (p0, p1, p3) and (p1, p2, p3); p2 standing out of
  // the first is a crease. Split p0-p2: (p0, p1, p2) and (p0, p2, p3).
  const a = rise(va, vb, vd, vc), b = rise(va, vb, vc, vd);
  const size = Math.max(va.distanceTo(vc), vb.distanceTo(vd));
  // the tie: flat within rounding, relative to the quad's own size
  if (Math.abs(a) + Math.abs(b) > 1e-5 * size) return a < b;
  const cx = va.x + vb.x + vc.x + vd.x;
  return cx >= -1e-9 * size;
}

// The index list of a loft from its quads (each four indices, wound out) and
// any plain triangles (fans, caps). `outward` first reads which way the whole
// surface faces by its signed volume and turns every face round if inward —
// for a loft whose rings run whichever way the caller's path happened to,
// like a mirrored horn — so the outward fold is chosen on outward faces.
export function stitch(pos, quads, tris = [], { outward = false } = {}) {
  if (outward) {
    let vol = 0;
    const tri = (a, b, c) => { P(pos, a, va); P(pos, b, vb); P(pos, c, vc); vol += va.dot(vd.crossVectors(vb, vc)); };
    for (let i = 0; i < quads.length; i += 4) { tri(quads[i], quads[i + 1], quads[i + 2]); tri(quads[i], quads[i + 2], quads[i + 3]); }
    for (let i = 0; i < tris.length; i += 3) tri(tris[i], tris[i + 1], tris[i + 2]);
    if (vol < 0) {
      quads = quads.slice(); tris = tris.slice();
      for (let i = 0; i < quads.length; i += 4) {
        const [a, b, c, e] = quads.slice(i, i + 4);
        quads[i] = b; quads[i + 1] = a; quads[i + 2] = e; quads[i + 3] = c;
      }
      for (let i = 0; i < tris.length; i += 3) { const t = tris[i + 1]; tris[i + 1] = tris[i + 2]; tris[i + 2] = t; }
    }
  }
  const idx = [];
  for (let i = 0; i < quads.length; i += 4) {
    const [a, b, c, e] = [quads[i], quads[i + 1], quads[i + 2], quads[i + 3]];
    if (splitOnP1P3(pos, a, b, c, e)) idx.push(a, b, e, b, c, e);
    else idx.push(a, b, c, a, c, e);
  }
  for (const t of tris) idx.push(t);
  return idx;
}

// The quads between ring `a` and ring `b` (start indices, `seg` each, the
// rings running the same way round), wound so that a ring running toward +a's
// own direction of travel faces out — the winding of the trunk's profile
// loft. `flip` is the other winding.
export function ringQuads(quads, a, b, seg, flip = false) {
  for (let j = 0; j < seg; j++) {
    const j2 = (j + 1) % seg;
    if (flip) quads.push(a + j, b + j, b + j2, a + j2);
    else quads.push(a + j, a + j2, b + j2, b + j);
  }
  return quads;
}

// THE OTHER ONE OF A PAIR. A left part is the right one reflected, never a
// copy of it rebuilt from the same recipe: a recipe that lays its rings the
// same way round on both sides joins the reflected points into different
// triangles, and the pair are two different shapes. So the right one is built
// and this reflects it — every point across x = 0 and every face turned
// round to keep facing out.
export function mirrorGeometry(geo) {
  const out = geo.clone();
  const p = out.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  if (out.index) {
    const ix = out.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  } else {
    for (let i = 0; i < p.count; i += 3) {
      for (let k = 0; k < 3; k++) { const t = p.getComponent(i + 1, k); p.setComponent(i + 1, k, p.getComponent(i + 2, k)); p.setComponent(i + 2, k, t); }
    }
  }
  p.needsUpdate = true;
  out.computeVertexNormals();
  return out;
}
