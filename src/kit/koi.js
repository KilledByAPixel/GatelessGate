import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { hash1 } from '../util/noise.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';

// Koi, for the ponds — the thing that turns a flat pale disc into water. A
// still surface reads as a platform however you tint it; a shape moving under
// it reads as a pool at once, so the fish are doing the water's work.
//
// Reusable: any scene with a surface can drop a school in. The default tone is
// ink wash (a sumi-e koi is a brush shape, not a spot of orange), but a scene
// whose seal IS the fish can pass an accent colour.
//
// Each koi swims a closed form over the simTime handed to update() — a seeded
// ellipse at a shallow depth, the body yawed along its own tangent, the tail
// beating. Nothing is stored between frames and no Math.random is used, so the
// same pond holds the same fish every run. The group sits at the water's
// SURFACE; the fish hang just beneath it.
//
// A fish is a flexing LINE, not a rigid pellet: the body is two segments, not
// one. FORE (nose to just past mid-body, fullest a third of the way back) is
// rigid, the way a real fish keeps its head steady while the rest of it
// sweeps — the taper alone, nose to the fore/aft joint, is what used to be
// missing (one uniform ellipsoid tapers to nothing, everywhere, at once). AFT
// (the peduncle) hangs off a pivot and is itself narrower than fore; the tail
// fin hangs off a second pivot at the end of AFT. Both pivots beat on the same
// clock as the tail always did, phase-lagged so the wave visibly travels back
// along the body rather than the whole fish snapping side to side as one
// piece — still driven entirely from pose(), called only from update(), so a
// turn (the ellipse tangent changing k.group.rotation.y) and a stroke (the
// pivots) are the same existing update path doing two things at once. Two
// flat triangle fins — dorsal on fore, ventral on aft — are baked into their
// segment's own merged geometry (mergeSimple), so the hint costs no extra
// draw call; both sit ON the fish's plane of symmetry, so neither needs a
// mirrored twin to read correctly as the school wheels past every angle.

export function makeKoi({
  count = 3,
  seed = 30,
  length = 0.95,
  color = WASH.mid,
  radius = 2.0,
  depth = 0.13,
  // Optional: the water's own heightAt(x, z). Given one, the fish ride the
  // surface — a ripple crossing the pond lifts whatever is under it, which is
  // what ties the school to the water instead of leaving it swimming in a
  // separate layer. Any surface with a height field can pass this.
  surfaceAt = null,
  // How much of the surface's motion the fish take. 1 is right for a shallow
  // pond, where the water moves nearly as one column and a fish a hand's depth
  // down rises with the wave above it. Anything less makes the fish lag the
  // surface, which in a pond this shallow lets a dorsal fin cross it in a
  // trough — the fish must never surface unasked.
  ride = 1,
} = {}) {
  const g = new THREE.Group();
  g.name = 'koi';
  const L = length;
  // DoubleSide: the fin-hint triangles below are zero-thickness planes, and
  // toonMaterial defaults to FrontSide — a single-sided fin vanishes for half
  // of every lap, whenever the yaw swings its back face toward the camera
  // (visible in wip-koi-r2.jpeg: one fish's dorsal fin missing while the
  // other two showed theirs). Shared by the whole fish rather than a
  // fin-only material so body/tail keep the same material identity as before.
  const mat = toonMaterial({ color, flat: true, side: THREE.DoubleSide });

  // A flat triangle standing off the plane of symmetry (z=0 in the segment's
  // own local space) — reads from any angle without a mirrored twin, since it
  // never leans to one side.
  function finPlane(root, rootY, tip, tipY) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      root[0], rootY, 0,
      root[1], rootY, 0,
      tip, tipY, 0,
    ]), 3));
    geo.computeVertexNormals();
    return geo;
  }

  const fish = [];
  for (let i = 0; i < count; i++) {
    const f = new THREE.Group();
    f.name = 'fish';

    // FORE: nose to just past mid-body, fullest a third of the way back, then
    // tapering into the fore/aft joint — the taper the old single ellipsoid
    // never had (it tapered identically toward both ends at once). Rigid: a
    // real fish keeps its head steady while the rest of the line sweeps.
    // Reaches past the joint on purpose (overlapping AFT below) — two
    // ellipsoids butted exactly at their own zero-radius tips pinch to a
    // wasp waist; overlapped, AFT's own flesh fills the taper in behind FORE.
    const foreGeo = new THREE.SphereGeometry(0.5, 10, 8);
    foreGeo.scale(L * 0.40, L * 0.15, L * 0.24);
    foreGeo.translate(L * 0.11, 0, 0);
    // dorsal fin hint, a small ridge just proud of the back — sized against
    // the body's own radius (0.075L), not against the fish's overall length
    const dorsal = finPlane([L * 0.10, L * 0.04], L * 0.070, L * 0.07, L * 0.115);
    const fore = new THREE.Mesh(mergeSimple([foreGeo, dorsal]), mat);
    fore.name = 'koi-body';
    f.add(fore);

    // AFT — the peduncle: a pivot that beats, carrying a segment narrower
    // than fore so the taper continues on toward the tail root. This second
    // joint (plus the tail's own, below) is what turns the swim into a
    // travelling flex instead of the whole fish snapping as one rigid piece.
    const aftPivot = new THREE.Group();
    aftPivot.name = 'koi-aft-pivot';
    aftPivot.position.x = -L * 0.06;
    const aftGeo = new THREE.SphereGeometry(0.5, 8, 6);
    aftGeo.scale(L * 0.30, L * 0.09, L * 0.15);
    aftGeo.translate(-L * 0.10, 0, 0);
    // a small ventral/anal fin hint, near the joint, sized against AFT's own
    // (thinner) radius
    const ventral = finPlane([-L * 0.03, -L * 0.09], -L * 0.040, -L * 0.06, -L * 0.070);
    const aft = new THREE.Mesh(mergeSimple([aftGeo, ventral]), mat);
    aft.name = 'koi-aft';
    aftPivot.add(aft);
    f.add(aftPivot);

    // the caudal fin: a flat triangle fan hinged at the tail root, so it can
    // beat side to side. Pointed toward the body, flaring out behind. Hung
    // off the end of the peduncle rather than straight off fore, now that
    // there is a peduncle to hang it off of; sized down a touch to match the
    // slimmer peduncle it now grows from.
    const tail = new THREE.Group();
    tail.name = 'koi-tail';
    tail.position.x = -L * 0.25;
    const finGeo = new THREE.ConeGeometry(L * 0.15, L * 0.28, 3);
    finGeo.rotateZ(Math.PI / 2);          // apex toward +x (the body), base trailing -x
    finGeo.scale(1, 1, 0.28);             // flatten to a fin, upright in the water
    const fin = new THREE.Mesh(finGeo, mat);
    fin.name = 'koi-fin';
    fin.position.x = -L * 0.12;
    tail.add(fin);
    aftPivot.add(tail);

    g.add(f);
    fish.push({
      group: f, tail, aftPivot,
      phase: hash1(i * 4 + 1, seed) * Math.PI * 2,
      rx: radius * (0.55 + hash1(i * 4 + 2, seed) * 0.4),
      rz: radius * (0.45 + hash1(i * 4 + 3, seed) * 0.4),
      rate: 0.16 + hash1(i * 4 + 4, seed) * 0.14,
      dir: hash1(i * 4 + 5, seed) < 0.4 ? -1 : 1,
      beat: 4.5 + hash1(i * 4 + 6, seed) * 3,
      cx: (hash1(i * 4 + 7, seed) - 0.5) * radius * 0.4,
      cz: (hash1(i * 4 + 8, seed) - 0.5) * radius * 0.4,
    });
  }

  let clock = 0;

  function pose() {
    for (const k of fish) {
      const a = k.phase + clock * k.rate * k.dir;
      const x = k.cx + Math.cos(a) * k.rx;
      const z = k.cz + Math.sin(a) * k.rz;
      let y = -depth + Math.sin(clock * 0.6 + k.phase) * 0.02;
      // rise and fall with the water directly overhead
      if (surfaceAt) y += surfaceAt(x, z) * ride;
      k.group.position.set(x, y, z);
      // face along the tangent of the ellipse it is swimming
      const vx = -k.rx * Math.sin(a) * k.dir;
      const vz = k.rz * Math.cos(a) * k.dir;
      k.group.rotation.y = Math.atan2(-vz, vx);
      // the travelling wave: the peduncle beats first, the tail catches the
      // same wave a beat later and swings further — a flexing line, not a
      // rigid pellet turning as one piece. The tail's own formula is
      // unchanged from before this segment existed.
      const beatPhase = clock * k.beat + k.phase;
      k.aftPivot.rotation.y = Math.sin(beatPhase - 0.7) * 0.22;
      k.tail.rotation.y = Math.sin(beatPhase) * 0.5;
      // the body banks a little into its turns
      k.group.rotation.z = Math.sin(clock * k.beat * 0.5 + k.phase) * 0.08;
    }
  }
  pose();

  return {
    group: g,
    fishCount() { return fish.length; },
    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      pose();
    },
  };
}
