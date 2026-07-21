import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { INK } from '../palette.js';

// The kit monk, second pass: a lathed robe (narrow shoulders flaring to a wide
// hem), sleeves with the hands hidden inside, sphere head, wide sedge hat.
// Featureless by design — ink figures have no faces (a smile is an event).
// Poses: 'stand' (sleeves hang), 'point' (one sleeve raised toward +x), 'sit' (seated proportions, folded sleeves).
export function makeMonk({ height = 1.6, stout = 1, color = INK, hat = true, pose = 'stand', elder = false } = {}) {
  const g = new THREE.Group();
  g.name = 'monk';
  const mat = toonMaterial({ color, flat: true });
  const s = stout;
  const seated = pose === 'sit';

  const standProfile = [
    [0.02, 0.0], [0.21, 0.0], [0.20, 0.03], [0.155, 0.30],
    [0.125, 0.48], [0.115, 0.58], [0.13, 0.64], [0.06, 0.68],
  ];
  const sitProfile = [
    [0.02, 0.0], [0.30, 0.0], [0.32, 0.05], [0.27, 0.16],
    [0.20, 0.28], [0.165, 0.36], [0.15, 0.42], [0.07, 0.46],
  ];
  const profile = (seated ? sitProfile : standProfile)
    .map(([r, y], i) => new THREE.Vector2((i === 0 ? r : r * s) * height, y * height));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), mat);
  body.name = 'body';
  g.add(body);

  const shoulderY = (seated ? 0.40 : 0.60) * height;
  const sleeveL = (seated ? 0.24 : 0.34) * height;
  const makeSleeve = (side) => {
    const geo = new THREE.CylinderGeometry(0.035 * height, 0.065 * height, sleeveL, 7);
    geo.translate(0, -sleeveL / 2, 0);
    const arm = new THREE.Mesh(geo, mat);
    arm.name = 'arm';
    arm.position.set(side * 0.115 * s * height, shoulderY, seated ? 0.03 * height : 0);
    if (pose === 'point' && side === 1) { arm.rotation.z = Math.PI - 0.95; arm.rotation.y = 0.15; }
    // 'raise' is NOT 'point'. Point swings the sleeve up and OUT along the
    // bearing the figure faces, which is right for indicating a thing across the
    // scene (case 29's monk and the flag). Held up beside another person it aims
    // at them, and a raised finger aimed at someone reads as an insult rather
    // than a teaching — which is exactly how case 3 first came out. This holds
    // the arm nearly vertical, a few degrees clear of the body and tipped
    // forward, so the gesture is offered to the air instead of at anybody.
    // Rest sits ~20 degrees off plumb rather than dead vertical so a case can
    // still ANIMATE the lift toward vertical (k3 adds 0.24rad); starting plumb
    // would send the arm over the top and back down the far side.
    else if (pose === 'raise' && side === 1) { arm.rotation.z = Math.PI - 0.34; arm.rotation.x = 0.22; }
    else if (seated) { arm.rotation.x = -1.15; arm.rotation.z = side * 0.12; } // fold into the lap
    else { arm.rotation.z = side * 0.28; }
    g.add(arm);
    return arm;
  };
  makeSleeve(-1);
  makeSleeve(1);

  const headR = 0.095 * height;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 14, 10), mat);
  head.name = 'head';
  head.position.y = (seated ? 0.50 : 0.735) * height;
  g.add(head);

  if (hat) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.185 * height, 0.10 * height, 12), mat);
    cone.name = 'hat';
    cone.position.y = (seated ? 0.545 : 0.80) * height;
    g.add(cone);
  }

  if (elder) {
    const staffLen = (seated ? 0.7 : 1.2) * height;
    const staffGeo = new THREE.CylinderGeometry(0.018 * height, 0.018 * height, staffLen, 6);
    staffGeo.translate(0, staffLen / 2, 0);   // base at the local origin -> stands on the ground
    const staff = new THREE.Mesh(staffGeo, mat);
    staff.name = 'staff';
    staff.position.set(0.26 * s * height, 0, 0.06 * height);
    staff.rotation.z = 0.08;
    g.add(staff);
  }
  return g;
}

// Turn a monk so its pointing sleeve (local +x, raised by pose:'point') aims at
// a target {x,z} in the monk's parent space. rotation.y = atan2(-dz, dx) maps
// local +x → the world direction (cos, 0, -sin) onto the target bearing.
export function aimMonk(monk, target) {
  const dx = target.x - monk.position.x;
  const dz = target.z - monk.position.z;
  monk.rotation.y = Math.atan2(-dz, dx);
  return monk;
}
