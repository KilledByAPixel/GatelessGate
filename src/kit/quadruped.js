import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { makeTail } from './tail.js';
import { mergeSimple } from './scatter.js';

// The shared body plan for every four-legged animal in the book: a barrel slung
// between four legs, a head out front, and optional hump / horns / ears / snout.
// The dog (case 1) and the water buffalo (case 37) are the same construction at
// different proportions.
//
// THE LEG RULE, which both animals got wrong independently and which is the
// reason this file exists: a leg must run PAST the belly, not up to it. The
// barrel is a capsule, so it narrows toward its sides — a leg standing at hip
// offset x meets the barrel's surface at
//
//     y = bodyY - sqrt(bodyR^2 - x^2)
//
// which is HIGHER than the barrel's lowest point. Sizing a leg to reach the
// bottom of the body therefore leaves it hanging in the air at the hip, which is
// exactly what "its legs don't connect" looked like. That height is computed
// here rather than hand-tuned, so no future animal can reintroduce it.
//
// THE SECOND RULE, which the first pass of every animal here also got wrong: a
// barrel on four straight posts is a TABLE. Two things break that reading, and
// both are optional so no species is forced into them:
//
//   `legs.knee`  — the hind pair folds. A quadruped drives from behind, and the
//                  bend at the hock is the one asymmetry that tells a viewer
//                  which end is the front, even in silhouette at fog distance.
//   `haunch` / `shoulder` / `chest` — mass ON the barrel. A bare capsule is a
//                  sack; what makes it read as a body is the lumps where the
//                  legs drive into it and the brisket that hangs under the neck.
//
// Everything scales off `height` (withers height) and faces +z.
export function makeQuadruped({
  height = 1,
  color = INK_LIT,
  // barrel
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  legBury = 0.06,        // how far the leg TOPS sink up into the barrel, x height — raise it to close a leg/body gap
  legs = null,           // { knee } — radians of bend in the HIND pair; 0/absent = posts
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },   // + scaleX/scaleY/scaleZ (default 1): squish the skull in its own tilted frame
  neck = null,           // { r, len, tilt } — a short column from chest to head
  snout = null,          // { r0, r1, len, fwd, up, tilt } — tilt noses the muzzle DOWN off horizontal
  ears = null,           // { r, h, x, y, z, tilt } — DIRECT base offsets from the head's centre; see EARS ARE PLACED DIRECTLY below
  horns = null,          // { r, len, x, up, fwd, sweep, back?, curve? } — curve bends the spike into an arc
  hump = null,           // { r, scaleY, scaleZ, up, fwd }
  haunch = null,         // { r, scaleY, scaleZ, up, back } — the rump, over the hind legs
  shoulder = null,       // { r, scaleY, up, fwd } — and the mass over the front pair
  chest = null,          // { r, drop, fwd } — the brisket, hanging under the neck
  tail = null,           // { kind: 'stiff'|'strand', ... }
  seed = 1,
} = {}) {
  const g = new THREE.Group();
  const mat = washMaterial({ color, flat: true });
  const h = height;
  const R = bodyR * h;
  const legLen = legH * h;
  const bodyY = legLen + bodyDrop * h;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(R, bodyLen * h, 4, 8), mat);
  body.name = 'body';
  body.rotation.x = Math.PI / 2;                  // lie along z
  body.position.set(0, bodyY, 0);
  g.add(body);

  // see THE LEG RULE above
  const hx = hipX * h;
  const belly = bodyY - Math.sqrt(Math.max(0, R * R - hx * hx));
  // How deep the tops ride inside the barrel is a DIAL (legBury), not a
  // constant: the belly formula above is exact only at the barrel's
  // cylindrical mid-span, so a species whose hips sit near the capsule's
  // rounding caps — or whose barrel is pitched — shows a sliver of air at
  // the join. Cranking legBury is the one-number fix (Frank: "I need a way
  // to adjust the legs to be inside the body more").
  const legTop = belly + legBury * h;
  const knee = (legs && legs.knee) || 0;

  // A cylinder is built centred on its own origin. For a jointed leg we want it
  // HUNG from its top instead, so that the top stays pinned where THE LEG RULE
  // put it while the far end swings — the same trick `spike` plays for ears.
  const hung = (r0, r1, len, seg) => {
    const geo = new THREE.CylinderGeometry(r0, r1, len, seg);
    geo.translate(0, -len / 2, 0);
    return geo;
  };

  // A ring loft — the one cut behind every SHAPED limb, ear and horn here,
  // the same construction koi.js lofts its body with. `stations` is
  // [{ p: [x,y,z], r }] from ROOT to TIP: the root ring stays open (it is
  // always buried inside a larger mass), the tip is fanned shut. Each ring
  // sits square to the path's own tangent, so a curved run (the horn arc
  // below) carries its rings around the bend without shearing. Basis
  // convention matches koi.js — b2 x b1 = -tangent — so the same index
  // pattern keeps every face outward.
  const loft = (stations, seg, spin = 0) => {
    const P = stations.map((s) => new THREE.Vector3(...s.p));
    const last = P.length - 1;
    const pos = [];
    for (let i = 0; i < P.length; i++) {
      const t = P[Math.min(i + 1, last)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
      const seed = Math.abs(t.x) > 0.9
        ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const b1 = seed.cross(t).normalize();
      const b2 = t.clone().cross(b1);
      for (let j = 0; j < seg; j++) {
        const a = spin + (j / seg) * Math.PI * 2;
        const c = Math.cos(a) * stations[i].r, s = Math.sin(a) * stations[i].r;
        pos.push(P[i].x + b2.x * c + b1.x * s,
          P[i].y + b2.y * c + b1.y * s,
          P[i].z + b2.z * c + b1.z * s);
      }
    }
    const idx = [];
    for (let i = 0; i < last; i++) {
      const a = i * seg, b = a + seg;
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        idx.push(a + j, b + j, a + j2, a + j2, b + j, b + j2);
      }
    }
    const tip = pos.length / 3;
    pos.push(P[last].x, P[last].y, P[last].z);
    for (let j = 0; j < seg; j++)
      idx.push(tip, last * seg + (j + 1) % seg, last * seg + j);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  // A LIMB, NOT A DOWEL (Frank: "the legs are mostly just sticks", across
  // every animal). A real leg spends its width unevenly: broad where the
  // thigh leaves the body, a pinch at the knee line, a slim cannon bone, and
  // a small flare back out at the foot. Four rings say all of that in one
  // mesh — same count as the old cylinder, so no species pays a draw for it.
  // `legTaper` keeps its job as the TOP's knob (the horse runs it at 1.2 for
  // a broad forearm over a wire cannon); the foot stays anchored on legR so
  // front and hind feet always match.
  const limb = (rTop, rFoot, len, seg) => loft([
    { p: [0, 0, 0], r: rTop * 1.18 },
    { p: [0, -0.45 * len, 0], r: rFoot * 0.85 },
    { p: [0, -0.82 * len, 0], r: rFoot * 0.68 },
    { p: [0, -len, 0], r: rFoot * 0.85 },
  ], seg);

  // Share of the leg's VERTICAL run taken by the thigh; the shin has the rest.
  // TWO THIRDS, which is not the obvious choice and is the whole trick. Splitting
  // the leg at its middle puts the hock at mid-height — which is exactly where
  // the haunch hangs, so the mass swallows the bend and the hind leg comes out
  // reading as a SHORT POST rather than a folded one (shot
  // wip-quadruped-r1-dog). A real hock sits low, around a third of the way up;
  // put it there and the fold clears the body and shows.
  const THIGH_RUN = 0.66;
  // A BENT identical cylinder is still an identical cylinder — the fold alone
  // did not stop the hind pair reading as sticks. A hind limb is broad at the
  // hip, pinched at the hock and only then drops as a thin cannon bone, so the
  // jointed path spends its radii that way instead of following `legTaper`.
  // The FOOT keeps radius `legR`, unchanged, so it still matches the front feet.
  const THIGH_SWELL = 1.35;   // x legR at the hip
  const HOCK_PINCH = 0.85;    // x legR at the joint

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // Hind legs only (the animal faces +z), and only if a knee was asked for.
    if (knee && sz < 0) {
      const thighDrop = THIGH_RUN * legTop;           // how far the thigh falls...
      const thighLen = thighDrop / Math.cos(knee);    // ...and how long it is, tilted
      const shinLen = legTop - thighDrop;             // the shin makes up the rest, plumb
      const rHip = legR * h * THIGH_SWELL;
      const rKnee = legR * h * HOCK_PINCH;
      const rFoot = legR * h;

      // THE KNEE BALL. Two lofts meeting at an angle touch edge-to-edge and
      // open a wedge of daylight on the OUTSIDE of the bend ("there's like a
      // gap where the two cylinders are touching" — Frank). A ball of the
      // joint's own radius, centred exactly on the hinge point, keeps the
      // joint covered at any bend — and it is MERGED into the thigh's
      // geometry rather than added as a child, so it costs no mesh and no
      // draw call — free, which is what mattered back when k45's horse
      // budget was frozen at the line; k45 now bakes its horse to one mesh
      // regardless, but the merge still costs nothing for any quadruped
      // that uses this plan.
      const kneeBall = new THREE.SphereGeometry(rKnee * 1.05, 7, 5);
      kneeBall.translate(0, -thighLen, 0);
      const thigh = new THREE.Mesh(
        mergeSimple([hung(rHip, rKnee, thighLen, 6), kneeBall]), mat);
      thigh.name = 'leg';                             // still 'leg': species re-parent by name
      thigh.position.set(sx * hx, legTop, sz * hipZ * h);
      // Rotating +y about +x by θ sends it toward +z, so a POSITIVE angle tips
      // the thigh's top forward and swings its lower end — the hock — BACK,
      // which is the direction a hind leg actually folds.
      thigh.rotation.x = knee;

      // The shin hangs off the thigh rather than off the group, so the joint is
      // a real hinge: move or re-angle the thigh and the shin follows it. It
      // undoes the thigh's tilt to stand plumb again, and its length is solved
      // (not tuned) so the foot lands exactly on y = 0 — THE LEG RULE, at the
      // other end of the leg. Its radii make the FOLD READ: pinched where it
      // leaves the hock, a slim cannon below, the same small foot as the front.
      const shin = new THREE.Mesh(loft([
        { p: [0, 0, 0], r: rKnee },
        { p: [0, -shinLen * 0.5, 0], r: rFoot * 0.66 },
        { p: [0, -shinLen, 0], r: rFoot * 0.85 },
      ], 6), mat);
      shin.name = 'shin';
      shin.position.y = -thighLen;                    // the hock, in the thigh's own frame
      shin.rotation.x = -knee;
      thigh.add(shin);

      g.add(thigh);
      continue;
    }
    // Hung from its top like the jointed pair, so the limb profile above can
    // put its rings at stated fractions of the visible run.
    const leg = new THREE.Mesh(limb(legR * h * legTaper, legR * h, legTop, 6), mat);
    leg.name = 'leg';
    leg.position.set(sx * hx, legTop, sz * hipZ * h);
    g.add(leg);
  }

  if (hump) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(hump.r * h, 7, 5), mat);
    m.name = 'hump';
    m.scale.set(1, hump.scaleY ?? 0.7, hump.scaleZ ?? 1.25);
    m.position.set(0, bodyY + hump.up * h, hump.fwd * h);
    g.add(m);
  }

  // The three masses that turn the barrel into a body. Each is one ellipsoid
  // placed off `bodyY`, exactly as the hump is, so it rides the barrel's own
  // line instead of floating beside it — and each is a single centred lump, not
  // a left/right pair: at ink-and-fog distance a body is read as weight, and a
  // pair costs two draw calls to say the same thing.
  const mass = (name, r, y, z, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r * h, 7, 5), mat);
    m.name = name;
    m.scale.set(1, sy, sz);
    m.position.set(0, y, z);
    g.add(m);
  };

  if (haunch) mass('haunch', haunch.r,
    bodyY + (haunch.up ?? 0) * h, -(haunch.back ?? 0) * h,
    haunch.scaleY ?? 1, haunch.scaleZ ?? 1);
  if (shoulder) mass('shoulder', shoulder.r,
    bodyY + (shoulder.up ?? 0) * h, (shoulder.fwd ?? 0) * h,
    shoulder.scaleY ?? 1);
  if (chest) mass('chest', chest.r, bodyY - chest.drop * h, chest.fwd * h);

  const headY = bodyY + head.up * h;
  const headZ = head.fwd * h;
  if (neck) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(neck.r * h * 0.85, neck.r * h, neck.len * h, 7), mat);
    m.name = 'neck';
    // stand it between the chest and the head rather than at a guessed angle
    const cz = bodyLen * h * 0.4;
    const cy = bodyY + 0.04 * h;
    m.position.set(0, (cy + headY) / 2, (cz + headZ) / 2);
    m.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, headY - cy, headZ - cz).normalize());
    g.add(m);
  }

  const headMesh = head.shape === 'box'
    ? new THREE.Mesh(new THREE.BoxGeometry(head.w * h, head.hh * h, head.d * h), mat)
    : new THREE.Mesh(new THREE.SphereGeometry(head.r * h, 12, 10), mat);
  headMesh.name = 'head';
  headMesh.position.set(0, headY, headZ);
  // the skull SQUISH: a sphere r is one number, and no real head is a ball —
  // per-axis scales (defaulting to 1, same idiom as hump.scaleY) let a
  // species flatten, lengthen or narrow it without a new shape. Applied in
  // the mesh's own frame, so a tilted head squishes along its own axes.
  headMesh.scale.set(head.scaleX ?? 1, head.scaleY ?? 1, head.scaleZ ?? 1);
  // A head held level projects like a drawer pulled out of the chest. Nosing it
  // down sinks the back of the skull into the shoulder and leaves the muzzle as
  // the thing that sticks out, which is what the silhouette wants.
  if (head.tilt) headMesh.rotation.x = head.tilt;
  g.add(headMesh);

  if (snout) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(snout.r0 * h, snout.r1 * h, snout.len * h, 7), mat);
    m.name = 'snout';
    // π/2 lies the cylinder along +z; `tilt` noses it DOWN from there, so a
    // nosed-down head (the horse) can carry its muzzle along the skull's own
    // line instead of jutting a horizontal beak off the jaw.
    m.rotation.x = Math.PI / 2 + (snout.tilt || 0);
    m.position.set(0, bodyY + snout.up * h, snout.fwd * h);
    g.add(m);
  }

  // Ears and horns HINGE AT THEIR BASE. A cone is built centred on its own
  // origin, so attaching one at the skull buries half its length inside the head
  // and only the outer half shows — which is why the buffalo's horns read as two
  // small bumps rather than a sweep. Translating the geometry first means the
  // stated length is the length you actually see. `spin` pre-turns the cone
  // about its own axis at the GEOMETRY level, so all three rotation channels
  // stay free for placement and animation.
  const spike = (r, len, seg, spin = 0) => {
    const geo = new THREE.ConeGeometry(r, len, seg);
    if (spin) geo.rotateY(spin);
    geo.translate(0, len / 2, 0);
    return geo;
  };

  // EARS ARE PLACED DIRECTLY — width, height, position, angle. Nothing hidden.
  //
  //   r      base radius (the ear's width)      — in units of height
  //   h      the ear's length
  //   x      lateral offset of the BASE from the head's centre (mirrored ±)
  //   y, z   base offset up / forward from the head's centre
  //   tilt   lean off vertical, OUTWARD (the pair spreads)
  //
  // The base ring is a flared loft, so push {x,y,z} INSIDE the skull to bury
  // the join — how close the ear sits to the head is a DIAL here, not a
  // hidden constant. This replaces the aim-ray scheme, which normalized
  // {x, up, fwd} into a direction and snapped the base onto the surface at a
  // fixed sink: the magnitudes did nothing (the dog's x: 0.005 still landed
  // 45° out on the crown, because only the RATIO survived), and the
  // ear-to-head distance was untunable — Frank fought exactly that in the
  // model viewer and could not win, because the knob did not exist.
  if (ears) {
    if (ears.up !== undefined || ears.fwd !== undefined) {
      throw new Error('ears take direct head-relative offsets { r, h, x, y, z, tilt } now — '
        + 'up/fwd belonged to the old aim-ray scheme; see EARS ARE PLACED DIRECTLY in quadruped.js');
    }
    for (const sx of [-1, 1]) {
      // Not a bare cone: the base ring FLARES a quarter wider than the stated
      // radius and waists back in just above it, so the ear grows OUT of the
      // skull the way a real ear roots in a muscle bulge, instead of a
      // triangle resting on the surface. 5-gon, and the half-facet of
      // pre-spin (π/5) centres a flat face on +z so the book's 3/4 cameras
      // never catch an edge-on sliver.
      const m = new THREE.Mesh(loft([
        { p: [0, 0, 0], r: ears.r * h * 1.25 },
        { p: [0, ears.h * h * 0.30, 0], r: ears.r * h * 0.92 },
        { p: [0, ears.h * h, 0], r: ears.r * h * 0.02 },
      ], 5, Math.PI / 5), mat);
      m.name = 'ear';
      m.position.set(
        sx * (ears.x || 0) * h,
        headY + (ears.y || 0) * h,
        headZ + (ears.z || 0) * h);
      // The cant lives in rotation.z and NEVER rotation.x — that channel is
      // the hinge the species animate (the fox's flick and the cat's swivel
      // overwrite it every frame, so anything stored there would be lost on
      // the first update). Sign note: rotating +y about +z sends it toward
      // -x, so the LEFT ear (sx = -1) takes the POSITIVE angle — same
      // convention as the horns below.
      m.rotation.z = -sx * (ears.tilt || 0);
      g.add(m);
    }
  }

  // A HORN IS AN ARC, NOT A SPIKE (Frank, on the buffalo: "they're supposed to
  // be ROUND, curved — like a devil's horn almost"). `horns.curve` (additive;
  // absent keeps the legacy straight cone) lofts the rings along a quadratic
  // arc instead: the horn leaves its base along local +y, then bends toward
  // local -z — up, then hooking back — with the radius shrinking to a point.
  // `curve` is how far the tip is displaced off the straight line, as a
  // fraction of len; the arc trades some vertical reach for it (0.85·len), the
  // way a bent finger stands shorter than a straight one. Base still hinges at
  // the origin, so placement and the sweep/back channels work unchanged.
  if (horns) for (const sx of [-1, 1]) {
    let geo;
    if (horns.curve) {
      const N = 6, sts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        sts.push({
          p: [0, (2 * (1 - t) * t * 0.55 + t * t * 0.85) * horns.len * h,
            -t * t * horns.curve * horns.len * h],
          r: Math.max(horns.r * h * Math.pow(1 - t, 0.8), horns.r * h * 0.04),
        });
      }
      geo = loft(sts, 6);
    } else {
      geo = spike(horns.r * h, horns.len * h, 6);
    }
    const m = new THREE.Mesh(geo, mat);
    m.name = 'horn';
    m.position.set(sx * horns.x * h, bodyY + horns.up * h, horns.fwd * h);
    if (horns.back) m.rotation.x = -horns.back;  // swept back over the skull
    m.rotation.z = -sx * horns.sweep;            // and out to the side — see the sign note above
    g.add(m);
  }

  let strand = null;
  if (tail && tail.kind === 'strand') {
    strand = makeTail({
      segments: tail.segments ?? 7,
      length: tail.length * h,
      thickness: tail.thickness * h,
      color: tail.color ?? color,
      seed,
    });
    strand.group.position.set(0, bodyY + tail.up * h, -tail.back * h);
    g.add(strand.group);
  } else if (tail && tail.kind === 'stiff') {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(tail.r0 * h, tail.r1 * h, tail.length * h, 6), mat);
    m.name = 'tail';
    m.position.set(0, bodyY + tail.up * h, -tail.back * h);
    m.rotation.x = tail.tilt ?? -1.0;
    g.add(m);
  }

  return { group: g, tail: strand, material: mat };
}
