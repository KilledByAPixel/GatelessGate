import * as THREE from '../../lib/three.module.js';

// THE WOOD OF A TREE, SKINNED — the one limb builder every broadleaf in the
// book grows through (tree.js and oak.js; forest.js stamps copies of theirs).
//
// A limb used to be its own tapered prism set down on its parent's tip, with a
// knot ball over the seam. That put a visible knuckle on every fork, for two
// reasons that are easy to miss on paper:
//
//   - A tube is a PRISM. Its flat faces sit well inside the circle its corners
//     lie on, so a child ring "no wider than its parent" by the radii still
//     put its corners through the parent's faces.
//   - The child's base ring is tilted by the fork angle, so half of it rose
//     past the END of the parent, where there was no parent left to be inside.
//     The knot covered that and stood proud of both.
//
// So this skins a skeleton instead of stacking parts, and a fork is two
// different things:
//
//   THE LEADER. One child carries its parent on through the fork: same tube,
//   same radius where they meet, the corner eased over two rings. There is no
//   join there at all, which is the only kind that cannot show.
//
//   THE LATERALS. Every other child is rooted INSIDE the parent — its base
//   ring centred on the parent's axis, set back from the fork far enough that
//   the tilted ring is still inside wood, and no fatter than the parent's
//   faces allow. What the eye gets is the saddle where one tube leaves
//   another, with nothing standing out of it.
//
// A builder grows a SKELETON — nodes of { S, J?, E, len, level, kids, run?,
// phase? }: where a limb starts, its elbow if it has one, its tip, and what
// forks from that tip — and hands the root to `clothe()`, which decides the
// leaders and laterals, sizes and roots every limb, and skins the lot into one
// non-indexed geometry plus, per vertex, the two numbers the foliage wind
// wants. Keeping the two apart is what lets the wood be reworked without moving
// a leaf: only the skeleton draws from a seed.
//
// It also returns the record of every join — measured from the points and radii
// that were actually skinned, not from what the builder meant — which the
// builders leave on `userData.limbs` so a test can hold every tree in the book
// to the rule.

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

// How much of a parent's face radius a lateral's base may fill. Under one, so
// the ring is buried rather than flush: flush is z-fighting along the seam.
const BURY = 0.9;
// How far back along each side of a corner a leader's bend is spread, as a
// share of the shorter side.
const EASE = 0.24;

// A parent's faces, as a fraction of the radius its corners sit on.
const faceRatio = (sides) => Math.cos(Math.PI / sides);

// The largest base radius a lateral can have and still be buried, rooted on the
// axis of a parent whose radius there is `parentR`.
const buriedRadius = (parentR, sides) => parentR * faceRatio(sides) * BURY;

// The closest point on a limb's axis to `p`: how far off the axis `p` is, and
// the limb's radius there.
function nearestOnPath(path, p) {
  let best = { d: Infinity, r: 0 };
  for (let i = 0; i + 1 < path.length; i++) {
    const A = path[i].p, B = path[i + 1].p;
    _a.subVectors(B, A);
    const L2 = _a.lengthSq();
    const t = L2 > 0 ? Math.min(1, Math.max(0, _b.subVectors(p, A).dot(_a) / L2)) : 0;
    const d = _c.copy(A).addScaledVector(_a, t).distanceTo(p);
    if (d < best.d) best = { d, r: path[i].r + (path[i + 1].r - path[i].r) * t };
  }
  return best;
}

// Ease a corner in a path over two rings instead of one: the point at `i` is
// replaced by one a little back along the way in and one a little along the way
// out. A leader passing through a fork bends there, and a single mitred ring at
// a fork-sized angle reads as a pipe elbow; two reads as wood that grew round.
function easeCorner(path, i) {
  const P = path[i], A = path[i - 1], B = path[i + 1];
  const dIn = P.p.distanceTo(A.p), dOut = P.p.distanceTo(B.p);
  const d = EASE * Math.min(dIn, dOut);
  if (!(d > 0)) return;
  const toward = (X, t) => {
    const o = { p: P.p.clone().lerp(X.p, t), r: P.r + (X.r - P.r) * t };
    if (P.run !== undefined && X.run !== undefined) o.run = P.run + (X.run - P.run) * t;
    return o;
  };
  path.splice(i, 1, toward(A, d / dIn), toward(B, d / dOut));
}

// THE CHAINS. One limb is a run of skeleton nodes: at every fork the child that
// leans least from the way its parent was already going is the LEADER and stays
// in the same tube; the rest are laterals, each a limb of its own rooted inside
// this one.
//
//   head     the path so far, base first — the bole's flared foot. Each point
//            is { p: Vector3, r, run? }.
//   baseR    the radius the first stretch tapers FROM, which for a bole is not
//            the radius of the last ring of its foot.
//   taper    (node) => the share of its base radius a stretch keeps by its tip.
//            A leader enters the next stretch at exactly that — it is the same
//            tube — which is why laterals come out the thinner of the two: the
//            read of a tree that grew, not one split evenly at every fork.
//   lateral  a lateral's base against the stretch it leaves, before the burial
//            limit gets its say (which, on a tube with few sides, it usually does).
//   leads    (node) => whether the fork at this node's tip has a leader at all.
//            Where every child leaves at a wide angle there is nothing to carry
//            the parent on: bending a bole that far to follow one reads as the
//            trunk breaking. Without one the limb simply ends, capped, and
//            every child is a lateral rooted just under the end.
//   extra    goes on the first limb's record (the bole's `flareTop`).
//
// Returns { geometry, run, phase, records }: `run` and `phase` are one value
// per vertex of `geometry`, in its order — the foliage wind's path length and
// lag, for a builder whose wood moves; `records` is one per limb,
// { gen, r0, parentR, offAxis, proud } (the bole: { gen: 0, r0, ...extra }).
export function clothe(root, head, {
  sides = 6, baseR = head[head.length - 1].r,
  taper = () => 0.7, lateral = 0.66, leads = () => true, extra = {},
} = {}) {
  const limbs = [];
  const into = new THREE.Vector3(), out = new THREE.Vector3();
  const heading = (k) => out.subVectors(k.J || k.E, k.S).normalize();
  const runAt = (node, share) => (node.run === undefined ? undefined : node.run + node.len * share);

  function chain(first, start, startR, parent, more) {
    const path = start.slice();
    const limb = { gen: first.level, path, phase: first.phase || 0, parent, ...more };
    limbs.push(limb);
    const forks = [];
    let r = startR;
    for (let node = first; node;) {
      const tipR = r * taper(node);
      if (node.J) path.push({ p: node.J, r: (r + tipR) / 2, run: runAt(node, 0.5) });
      path.push({ p: node.E, r: tipR, run: runAt(node, 1) });
      if (!node.kids.length) break;
      let leader = null;
      if (leads(node)) {
        into.subVectors(node.E, path[path.length - 2].p).normalize();
        let straightest = -Infinity;
        for (const k of node.kids) {
          const along = heading(k).dot(into);
          if (along > straightest) { straightest = along; leader = k; }
        }
      }
      forks.push({ node, i: path.length - 1, leader, nodeR: r });
      node = leader;
      r = tipR;
    }
    // Last fork first, so easing a corner never renumbers one still to come.
    for (let f = forks.length - 1; f >= 0; f--) {
      const { node, i, leader, nodeR } = forks[f];
      const before = path[i - 1], corner = path[i];
      const reach = corner.p.distanceTo(before.p);
      into.subVectors(corner.p, before.p).normalize();
      const roots = node.kids.filter((k) => k !== leader).map((k) => {
        // Set back down the parent from the fork: far enough that the
        // lateral's tilted base ring is still inside wood on its high side,
        // and clear of the corner a leader is about to be eased round.
        const sin = Math.sqrt(Math.max(0, 1 - heading(k).dot(into) ** 2));
        const back = Math.min(0.7 * reach, Math.max(
          leader ? EASE * 1.08 * reach : 0,
          1.15 * sin * buriedRadius(corner.r, sides)));
        const t = back / reach;
        const at = {
          p: corner.p.clone().lerp(before.p, t),
          r: Math.min(lateral * nodeR, buriedRadius(corner.r + (before.r - corner.r) * t, sides)),
        };
        if (corner.run !== undefined && before.run !== undefined) {
          at.run = corner.run + (before.run - corner.run) * t;
        }
        return { k, at };
      });
      if (leader) easeCorner(path, i);
      for (const { k, at } of roots) chain(k, [at], at.r, limb, {});
    }
  }

  chain(root, head, baseR, null, extra);
  return skin(limbs, sides);
}

// limbs: [{ gen, path: [{ p, r, run? }], parent?: <limb>, phase, ...extra }],
// base first. Every limb's far end is closed to a point: a tip is buried in
// leaves on most limbs, but not on all of them and not from above.
function skin(limbs, sides) {
  const pos = [];
  const run = [];
  const phase = [];
  const records = [];
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3();
  const mid = new THREE.Vector3(), fn = new THREE.Vector3();

  // One triangle, wound so its face looks AWAY from `inside`. Settling the
  // winding from the geometry rather than from the ring order is what lets a
  // limb bend any way it likes without a face turning its back.
  const tri = (A, B, C, inside, rA, rB, rC, ph) => {
    fn.subVectors(B, A).cross(_a.subVectors(C, A));
    mid.copy(A).add(B).add(C).multiplyScalar(1 / 3).sub(inside);
    const flip = fn.dot(mid) < 0;
    const [P, Q, R] = flip ? [A, C, B] : [A, B, C];
    const [rP, rQ, rR] = flip ? [rA, rC, rB] : [rA, rB, rC];
    pos.push(P.x, P.y, P.z, Q.x, Q.y, Q.z, R.x, R.y, R.z);
    run.push(rP, rQ, rR);
    phase.push(ph, ph, ph);
  };

  for (const limb of limbs) {
    const { path, parent, phase: ph, gen, ...extra } = limb;
    const rings = [];
    for (let i = 0; i < path.length; i++) {
      // the ring's plane bisects the corner it sits on
      t.set(0, 0, 0);
      if (i > 0) t.add(_a.subVectors(path[i].p, path[i - 1].p).normalize());
      if (i + 1 < path.length) t.add(_a.subVectors(path[i + 1].p, path[i].p).normalize());
      t.normalize();
      if (i === 0) {
        // any perpendicular will do for the first ring, so long as it is the
        // same one every build
        n.set(1, 0, 0);
        if (Math.abs(t.x) > 0.8) n.set(0, 0, 1);
      }
      // ...and every later ring carries the one before it forward rather than
      // choosing afresh, so the faces run straight along a limb instead of
      // twisting round it
      n.addScaledVector(t, -n.dot(t)).normalize();
      b.crossVectors(t, n);
      const ring = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        ring.push(path[i].p.clone()
          .addScaledVector(n, Math.cos(a) * path[i].r)
          .addScaledVector(b, Math.sin(a) * path[i].r));
      }
      rings.push(ring);
    }

    const inside = new THREE.Vector3();
    for (let i = 0; i + 1 < rings.length; i++) {
      const lo = rings[i], hi = rings[i + 1];
      const rl = path[i].run || 0, rh = path[i + 1].run || 0;
      inside.copy(path[i].p).add(path[i + 1].p).multiplyScalar(0.5);
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides;
        tri(lo[k], lo[k1], hi[k1], inside, rl, rl, rh, ph);
        tri(lo[k], hi[k1], hi[k], inside, rl, rh, rh, ph);
      }
    }
    const last = path[path.length - 1];
    const apex = last.p.clone().addScaledVector(
      _a.subVectors(last.p, path[path.length - 2].p).normalize(), last.r * 0.9);
    const end = rings[rings.length - 1];
    const re = last.run || 0;
    for (let k = 0; k < sides; k++) {
      tri(end[k], end[(k + 1) % sides], apex, last.p, re, re, re, ph);
    }

    // ---- the record of the join, measured off what was just skinned --------
    const rec = { gen, r0: path[0].r, ...extra };
    if (parent) {
      const at = nearestOnPath(parent.path, path[0].p);
      rec.parentR = at.r;
      rec.offAxis = at.d;
      // how far the base ring's worst corner stands outside the parent's
      // FACES — the measure that would have caught the old knuckle, which the
      // radii alone called buried
      rec.proud = -Infinity;
      for (const v of rings[0]) {
        const q = nearestOnPath(parent.path, v);
        rec.proud = Math.max(rec.proud, q.d - q.r * faceRatio(sides));
      }
    }
    records.push(rec);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.computeVertexNormals();   // non-indexed, so these are face normals
  return { geometry, run, phase, records };
}

// The foot of a trunk, as path points: the bole's own taper with a widening
// laid over it that is steep at the ground and has run out by `top`. Several
// rings, because a flare that turns into the bole at one hard corner is a
// pedestal the trunk stands on, and a collar set down around it is a step.
// `radiusAt(y)` is the plain bole; `spread` is how much wider the foot is than
// that, as a radius.
const FLARE_RINGS = [
  // [share of the flare's height, share of the spread still left]
  [0, 1], [0.22, 0.52], [0.52, 0.2], [1, 0],
];
export function flarePoints({ top, spread, radiusAt }) {
  return FLARE_RINGS.map(([f, s]) => ({
    p: new THREE.Vector3(0, f * top, 0),
    r: radiusAt(f * top) + s * spread,
  }));
}
