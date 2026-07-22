import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { hash1 } from '../util/noise.js';

// The hundred-foot pole (case 46). One clean tapered mast standing from y=0,
// wearing a shallow drum of a cap at the top — the seat. The koan's whole
// composition is the distance between the ground and that cap, so the pole
// itself stays quiet: no ladder, no rungs, no ornament that would explain how
// anyone got up there. That question is the case's business, not the prop's.
//
// `topY` is the cap's UPPER surface — the exact height a seated figure's hem
// should rest at. Callers seat the sitter at topY rather than re-deriving the
// cap arithmetic, so retuning the drum here never leaves a monk hovering.
//
// The guy-lines are believability, not structure: three hairlines running to
// seeded ground anchors. They are drawn as ink strokes — a 0.012-radius
// cylinder under the house 0.033 outline would be swallowed whole (the case-3
// finger problem), so lines and stakes are painted near-ink and opt out of the
// outline pass entirely.
export function makePole({
  height = 8,
  radius = 0.16,
  color = WASH.dark,
  seed = 1,
  guys = 3,
  capRadius = null,
} = {}) {
  const g = new THREE.Group();
  g.name = 'pole';
  const wood = toonMaterial({ color, flat: true });

  // the mast: slightly tapered, base sitting on the ground plane
  const shaftGeo = new THREE.CylinderGeometry(radius * 0.62, radius, height, 9);
  shaftGeo.translate(0, height / 2, 0);
  const shaft = new THREE.Mesh(shaftGeo, wood);
  shaft.name = 'shaft';
  g.add(shaft);

  // the seat: a modest flat drum, wider than the mast, closed and level.
  // Sized so a seated monk's hem (~0.42 at the case's scale) rests inside it
  // with a visible lip of plank showing — a perch, not a platter.
  const capR = capRadius || Math.max(radius * 2.9, 0.46);
  const capH = 0.09;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR * 0.84, capH, 12), wood);
  cap.name = 'cap';
  cap.position.y = height + capH / 2;
  g.add(cap);

  // guy-lines: from a hook high on the mast down to seeded stakes. Deterministic
  // by seed; anchors are exposed so a case can keep scatter off the stakes.
  const anchors = [];
  const inkline = toonMaterial({ color: WASH.deep, flat: true });
  const hookY = height * 0.8;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < guys; i++) {
    const a = (i / Math.max(1, guys)) * Math.PI * 2 + hash1(i * 3 + 1, seed) * 0.9;
    const r = height * (0.3 + 0.08 * hash1(i * 3 + 2, seed));
    const ax = Math.cos(a) * r, az = Math.sin(a) * r;
    anchors.push({ x: ax, z: az });

    const from = new THREE.Vector3(0, hookY, 0);
    const to = new THREE.Vector3(ax, 0.02, az);
    const dir = to.clone().sub(from);
    const len = dir.length();
    const lineGeo = new THREE.CylinderGeometry(0.012, 0.012, len, 5);
    lineGeo.translate(0, len / 2, 0);
    const line = new THREE.Mesh(lineGeo, inkline);
    line.name = 'guy';
    line.userData.noOutline = true;
    line.position.copy(from);
    line.quaternion.setFromUnitVectors(up, dir.normalize());
    g.add(line);

    // the stake the line ends at, leaning a touch outward as if driven there
    const stakeGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.18, 5);
    stakeGeo.translate(0, 0.09, 0);
    const stake = new THREE.Mesh(stakeGeo, inkline);
    stake.name = 'stake';
    stake.userData.noOutline = true;
    stake.position.set(ax, 0, az);
    stake.quaternion.setFromUnitVectors(up,
      new THREE.Vector3(Math.cos(a) * 0.22, 1, Math.sin(a) * 0.22).normalize());
    g.add(stake);
  }

  g.topY = height + capH;
  g.anchors = anchors;
  return g;
}
