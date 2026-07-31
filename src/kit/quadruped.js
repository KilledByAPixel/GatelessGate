import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';
import { makeTail } from './tail.js';

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
  color = INK,
  // barrel
  bodyR = 0.22, bodyLen = 0.72, bodyDrop = 0.16,
  // legs
  legH = 0.52, legR = 0.055, legTaper = 0.82, hipX = 0.13, hipZ = 0.32,
  legs = null,           // { knee } — radians of bend in the HIND pair; 0/absent = posts
  // head
  head = { shape: 'sphere', r: 0.20, fwd: 0.56, up: 0.22 },
  neck = null,           // { r, len, tilt } — a short column from chest to head
  snout = null,          // { r0, r1, len, fwd, up, tilt } — tilt noses the muzzle DOWN off horizontal
  ears = null,           // { r, h, x, up, fwd, tilt } — x/up/fwd AIM from the head's centre; see EARS ROOT ON THE SKULL below
  horns = null,          // { r, len, x, up, fwd, sweep }
  hump = null,           // { r, scaleY, scaleZ, up, fwd }
  haunch = null,         // { r, scaleY, scaleZ, up, back } — the rump, over the hind legs
  shoulder = null,       // { r, scaleY, up, fwd } — and the mass over the front pair
  chest = null,          // { r, drop, fwd } — the brisket, hanging under the neck
  tail = null,           // { kind: 'stiff'|'strand', ... }
  seed = 1,
} = {}) {
  const g = new THREE.Group();
  const mat = toonMaterial({ color, flat: true });
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
  const legTop = belly + 0.06 * h;                 // bury the top slightly in the barrel
  const knee = (legs && legs.knee) || 0;

  // A cylinder is built centred on its own origin. For a jointed leg we want it
  // HUNG from its top instead, so that the top stays pinned where THE LEG RULE
  // put it while the far end swings — the same trick `spike` plays for ears.
  const hung = (r0, r1, len, seg) => {
    const geo = new THREE.CylinderGeometry(r0, r1, len, seg);
    geo.translate(0, -len / 2, 0);
    return geo;
  };

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

      const thigh = new THREE.Mesh(hung(rHip, rKnee, thighLen, 6), mat);
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
      // other end of the leg.
      const shin = new THREE.Mesh(hung(rKnee, rFoot, shinLen, 6), mat);
      shin.name = 'shin';
      shin.position.y = -thighLen;                    // the hock, in the thigh's own frame
      shin.rotation.x = -knee;
      thigh.add(shin);

      g.add(thigh);
      continue;
    }
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(legR * h * legTaper, legR * h, legTop, 6), mat);
    leg.name = 'leg';
    leg.position.set(sx * hx, legTop / 2, sz * hipZ * h);
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

  // EARS ROOT ON THE SKULL. The old placement took { x, up, fwd } as a raw
  // body-frame POSITION, which left every ear base either floating beside the
  // head or buried in its cheek at the wrong angle — "hanging off the side of
  // its head" (Frank, on the fox and the dog both). Those three numbers are now
  // a DIRECTION: the ray from the head's centre toward the stated point picks
  // WHERE on the skull the ear roots — the sphere's surface, or for a box head
  // the face that ray exits through — the base is snapped onto that surface,
  // slightly sunk so the join is buried, never gapped, and the cone is canted
  // along a blend of the surface normal and world-up (out of the skull AND
  // standing up off it, the way an ear actually sits), then leaned a further
  // `tilt` outward — tilt still means what it always did.
  const EAR_SINK = 0.96;                 // of the way to the surface — buried join
  if (ears) {
    const X = new THREE.Vector3(1, 0, 0);
    const UP = new THREE.Vector3(0, 1, 0);
    for (const sx of [-1, 1]) {
      // A 5-gon cone's default spin points an EDGE at the front, so from the
      // book's 3/4 cameras the ear read as a sliver; half a facet of pre-spin
      // (π/5) centres a flat face on +z instead. Baked into the geometry so it
      // cannot fight the placement below or the flick the species drive.
      const m = new THREE.Mesh(spike(ears.r * h, ears.h * h, 5, Math.PI / 5), mat);
      m.name = 'ear';

      const dir = new THREE.Vector3(
        sx * ears.x * h,
        bodyY + ears.up * h - headY,
        ears.fwd * h - headZ);
      if (dir.lengthSq() < 1e-12) dir.set(sx * 0.5, 1, 0);  // degenerate: out-and-up
      dir.normalize();

      let base, normal;
      if (head.shape === 'box') {
        // Intersect the aim ray with the box in the head's own tilted frame;
        // the exit face is the axis the ray runs out of room on first.
        const tilt = head.tilt || 0;
        const local = dir.clone().applyAxisAngle(X, -tilt);
        const half = [head.w * h / 2, head.hh * h / 2, head.d * h / 2];
        let t = Infinity, exit = 1;
        for (let i = 0; i < 3; i++) {
          const d = Math.abs(local.getComponent(i));
          if (d > 1e-9 && half[i] / d < t) { t = half[i] / d; exit = i; }
        }
        base = local.clone().multiplyScalar(t * EAR_SINK).applyAxisAngle(X, tilt);
        normal = new THREE.Vector3().setComponent(
          exit, Math.sign(local.getComponent(exit)) || 1).applyAxisAngle(X, tilt);
      } else {
        base = dir.clone().multiplyScalar(head.r * h * EAR_SINK);
        normal = dir;
      }
      m.position.set(base.x, headY + base.y, headZ + base.z);

      // The axis: surface normal pulled halfway back to world-up, then leaned
      // `tilt` further OUTWARD (about z, so tilt spreads the pair no matter
      // which way the normal faced). Expressed as rotation.z (how far off
      // vertical) + rotation.y (which way around) and NEVER rotation.x — that
      // channel is the hinge the species animate (the fox's flick and the
      // cat's swivel overwrite it every frame, so anything stored there would
      // be lost on the first update). Sign note: rotating +y about +z sends
      // it toward -x, so the LEFT ear (sx = -1) takes the POSITIVE angle —
      // same convention as the horns below.
      const axis = normal.clone().add(UP).normalize();
      if (ears.tilt) axis.applyAxisAngle(new THREE.Vector3(0, 0, 1), -sx * ears.tilt);
      const polar = Math.acos(Math.min(1, Math.max(-1, axis.y)));
      m.rotation.z = -sx * polar;
      if (Math.hypot(axis.x, axis.z) > 1e-6)
        m.rotation.y = Math.atan2(-sx * axis.z, sx * axis.x);
      g.add(m);
    }
  }

  if (horns) for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(spike(horns.r * h, horns.len * h, 6), mat);
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
