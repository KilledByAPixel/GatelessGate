import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';
import { clamp01 } from '../util/math.js';

// Basho's staff rack (case 44): "When you have a staff, I will give it to you.
// If you have no staff, I will take it away from you."
//
// So the rack can never settle. Touch it holding a staff and you are given
// one; touch it holding none and the one you have not got is taken. Each tap
// flips the state, and neither state is ever the right one — that back and
// forth IS the object's behaviour, and the reason it is a kit piece rather
// than a prop: it refuses to resolve wherever it appears.
//
// Origin on the ground between the posts; the staff leans in the near bay.

const easeOut = (k) => 1 - (1 - k) * (1 - k);

const SWAP = 0.45;       // seconds for a staff to arrive or go

export function makeRack({ height = 1.25, color = WASH.dark, staffColor = WASH.mid, holding = true } = {}) {
  const H = height;
  const g = new THREE.Group();
  g.name = 'rack';

  const timber = washMaterial({ color });
  const flat = washMaterial({ color, flat: true });

  const SPREAD = 0.78 * H;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * H, 0.065 * H, H, 7), timber);
    post.name = 'post';
    post.position.set(sx * SPREAD / 2, H / 2, 0);
    g.add(post);
  }
  // an upper rail to lean against and a low sill to stand in
  const rail = new THREE.Mesh(new THREE.BoxGeometry(SPREAD + 0.22 * H, 0.06 * H, 0.06 * H), flat);
  rail.name = 'rail';
  rail.position.y = 0.82 * H;
  g.add(rail);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(SPREAD + 0.22 * H, 0.05 * H, 0.16 * H), flat);
  sill.name = 'sill';
  sill.position.y = 0.06 * H;
  g.add(sill);

  // JOINERY — a small collar block where the rail and the sill each cross a
  // post, the way a real through-tenon reads: the timber doesn't just touch,
  // it is visibly notched together. The first pass had the rail and sill
  // simply overlapping the post cylinders with no seam at all. One merged
  // mesh, four blocks, one draw.
  const collar = 0.11 * H;
  const joineryParts = [];
  for (const sx of [-1, 1]) {
    for (const y of [rail.position.y, sill.position.y]) {
      joineryParts.push(new THREE.BoxGeometry(collar, collar, collar)
        .translate(sx * SPREAD / 2, y, 0));
    }
  }
  const joinery = new THREE.Mesh(mergeSimple(joineryParts), flat);
  joinery.name = 'joinery';
  g.add(joinery);

  // THE STAFF — leaning in the rack, growing up out of the sill when given and
  // sinking back into it when taken. Anchored at its foot so it never floats.
  const STAFF_H = 1.55 * H;
  const staffGeo = new THREE.CylinderGeometry(0.028 * H, 0.034 * H, STAFF_H, 7);
  staffGeo.translate(0, STAFF_H / 2, 0);
  const staff = new THREE.Mesh(staffGeo, washMaterial({ color: staffColor, flat: true }));
  staff.name = 'staff';
  staff.position.set(-0.16 * H, 0, .2*H);
  staff.rotation.z = -0.13;
  staff.rotation.x = -0.16; 
  g.add(staff);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(SPREAD + 0.5 * H, 1.7 * H, 0.6 * H),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'rack-hit';
  hit.position.y = 0.85 * H;
  g.add(hit);

  let clock = 0;
  let has = !!holding;
  let from = has ? 1 : 0;
  let to = from;
  let t0 = -99;

  function pose() {
    const k = clamp01((clock - t0) / SWAP);
    const s = from + (to - from) * easeOut(k);
    staff.visible = s > 0.001;
    if (staff.visible) staff.scale.y = s;
  }
  pose();

  return {
    group: g,
    staff,
    pickTargets() { return [hit]; },

    // given, or taken. Returns whether a staff is now there.
    toggle() {
      from = staff.visible ? staff.scale.y : 0;
      has = !has;
      to = has ? 1 : 0;
      t0 = clock;
      pose();
      return has;
    },
    holding() { return has; },
    // 0..1 — mid-swap while a staff is arriving or leaving
    presence() { return staff.visible ? staff.scale.y : 0; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      pose();
    },
  };
}
