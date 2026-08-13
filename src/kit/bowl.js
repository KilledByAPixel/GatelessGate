import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { WASH } from '../palette.js';

// A rice bowl (case 7): a lathed shell (outside up, over the rim, back down the
// inside) on a small foot. Opening upward.
//
// FOOT RING. The old profile's own base sat at the shell's full radius R —
// the same width the body kept for its whole 0.25-unit rise — so the "foot"
// cylinder underneath (already narrower) was hidden behind a flush, straight
// wall and never read as its own step. A real bowl's foot ring is the
// opposite: distinctly narrower than the body, with the body's own base
// visibly overhanging it. The shell's own base point now sits well inside
// the foot's own top radius, so the silhouette shows the step directly
// (not just the separate foot mesh guessing at one), and the body actually
// tapers — belly out, shoulder in, lip flared — instead of running a
// near-constant radius from base to rim, which read as a bucket, not a bowl.
export function makeBowl({ radius = 0.22, color = WASH.mid } = {}) {
  const g = new THREE.Group();
  g.name = 'bowl';
  const mat = washMaterial({ color, side: THREE.DoubleSide });
  const R = radius;
  const FOOT_H = 0.035;
  // profile in world units: up the outside, over the rim, back down the inside
  const prof = [
    [0.14 * R, FOOT_H],          // near-centre, just above the foot's top
    [0.58 * R, FOOT_H],          // out to the body's own base — wider than
                                  // the foot below it, so the ring shows
    [1.00 * R, 0.16],            // the belly, widest point
    [0.95 * R, 0.24],            // shoulder draws in
    [1.05 * R, 0.30],            // the rim's outer, flared edge
    [0.97 * R, 0.285],           // the rim's inner edge — a thin flared lip
    [0.80 * R, 0.10],            // down the inside wall
    [0.16 * R, 0.05],            // and in, closing the interior near the axis
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), mat);
  shell.name = 'shell';
  g.add(shell);

  const foot = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.34, R * 0.40, FOOT_H, 14), mat);
  foot.name = 'foot';
  foot.position.y = FOOT_H / 2;
  g.add(foot);
  return g;
}
