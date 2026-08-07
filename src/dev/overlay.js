import * as THREE from '../../lib/three.module.js';
import { groundHeight } from '../kit/ground.js';

// LAYOUT GUIDES — the invisible half of a scene, drawn.
//
// Most of what decides where things end up in a diorama is never rendered: a
// keepout is a circle nothing is drawn at, a mountain footprint is a radius the
// scatter refuses to enter, the tree ring is two numbers. Editing a scene meant
// nudging a prop, reloading, and reading the result off where the grass went
// (Frank: "a way to visualize the keepouts and where things are spawned, so I
// can edit the scenes a bit better").
//
// The workbench's "Layout guides" switch turns these on for whatever page is on
// screen:
//
//   red      prop keepouts — where rocks, bushes and scatter trees may not stand
//   green    grass keepouts, when the case gave the meadow its own mask
//   blue     the scatter's tree ring, inner and outer
//   purple   mountain footprints, which forests and trees also refuse
//   amber    every placed object: a stem from the ground to its origin
//   teal     the camera's own target, the point the orbit turns around
//
// Testable-state pattern: layoutGuides() is pure — a scene in, flat arrays of
// line-segment coordinates out — and tests hold its shape without a browser.
// makeLayoutOverlay() is the THREE half around it.
//
// Everything it builds is LINES, never meshes, and that is load-bearing in
// three places: the ink pass outlines meshes, the shadow map is fed by meshes,
// and the workbench's own apply() traverse swaps materials on meshes. A guide
// drawn as geometry would have joined all three and started appearing in the
// picture it exists to explain.

export const GUIDE_COLORS = {
  keepout: 0xd8402c,
  grass: 0x2e9b4f,
  ring: 0x2b6cd8,
  mountains: 0x8a5cd8,
  markers: 0xd88a00,
  target: 0x00a0b0,
};

// The world grammar's own aggregates: drawn as one object each, covering the
// whole scene, so a marker at their origin says nothing and five markers sit
// piled at 0,0. Everything else in a scene is something somebody placed.
const AGGREGATE = new Set([
  'ground', 'mountains', 'forest', 'grassfield', 'grass', 'rocks', 'bushes',
  'tuftfield', 'water', 'foam', 'sea',
]);

const LIFT = 0.05;          // clear of the terrain, so a circle is not inside it
const RING_SEGMENTS = 48;

// A circle lying ON the terrain rather than on a flat plane at y=0: the ground
// rolls a unit either way past the flat middle, and a keepout drawn level with
// the origin would float over the far side of a rise and read as being
// somewhere it is not.
function circle(out, cx, cz, r, surf) {
  let px = cx + r, pz = cz, py = surf(px, pz) + LIFT;
  for (let i = 1; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = surf(x, z) + LIFT;
    out.push(px, py, pz, x, y, z);
    px = x; py = y; pz = z;
  }
}

function cross(out, x, y, z, half) {
  out.push(x - half, y, z, x + half, y, z);
  out.push(x, y, z - half, x, y, z + half);
}

/**
 * The guides for a scene, as plain data.
 * @param scene   a built koan scene; composeWorld leaves its record on
 *                scene.userData.layout, and a scene without one still yields
 *                markers for whatever it placed by hand.
 * @param target  the rig's orbit target [x, y, z], if the caller has one.
 * @returns [{ name, color, points }] — points is a flat x,y,z list, two
 *          vertices per segment. Empty groups are dropped.
 */
export function layoutGuides(scene, { target = null } = {}) {
  const L = (scene && scene.userData && scene.userData.layout) || {};
  const surf = L.groundFn
    ? (x, z) => L.groundFn(x, z)
    : (x, z) => groundHeight(x, z, { seed: L.groundSeed === undefined ? 21 : L.groundSeed });

  const keepout = [];
  for (const k of L.keepout || []) circle(keepout, k.x, k.z, k.r, surf);

  // Only when the case actually gave grass a different mask. Defaulted, the two
  // lists are the same array and drawing both would put a green circle exactly
  // under every red one, which reads as one muddy colour and says nothing.
  const grass = [];
  if (L.grassKeepout && L.grassKeepout !== L.keepout) {
    for (const k of L.grassKeepout) circle(grass, k.x, k.z, k.r, surf);
  }

  const ring = [];
  if (L.treeRing) for (const r of L.treeRing) circle(ring, 0, 0, r, surf);

  const mountains = [];
  // 0.85 of the radius is the line the scatter actually tests against, not the
  // rock's own edge — the skirt stays plantable on purpose. Drawing the true
  // radius would put the guide where nothing is enforced.
  for (const f of L.footprints || []) circle(mountains, f.x, f.z, f.r * 0.85, surf);

  const markers = [];
  for (const o of (scene && scene.children) || []) {
    // `layout-` skips the guides themselves: rebuilding while one is still
    // attached would put a marker on the overlay, at the origin, every time.
    if (!o.name || AGGREGATE.has(o.name) || o.isLight || o.userData.isOutline
      || o.name.startsWith('layout-')) continue;
    const { x, y, z } = o.position;
    if (![x, y, z].every(Number.isFinite)) continue;
    const g = surf(x, z);
    markers.push(x, g, z, x, Math.max(y, g) + 0.6, z);     // a stem out of the ground
    cross(markers, x, g + LIFT, z, 0.25);                  // and its footprint
  }

  const tgt = [];
  if (target) {
    const [x, y, z] = target;
    cross(tgt, x, y, z, 0.5);
    tgt.push(x, y - 0.5, z, x, y + 0.5, z);
  }

  return [
    { name: 'keepout', color: GUIDE_COLORS.keepout, points: keepout },
    { name: 'grass', color: GUIDE_COLORS.grass, points: grass },
    { name: 'ring', color: GUIDE_COLORS.ring, points: ring },
    { name: 'mountains', color: GUIDE_COLORS.mountains, points: mountains },
    { name: 'markers', color: GUIDE_COLORS.markers, points: markers },
    { name: 'target', color: GUIDE_COLORS.target, points: tgt },
  ].filter((g) => g.points.length > 0);
}

/**
 * The guides as a scene object. One LineSegments per colour, so the whole
 * overlay costs six draws at most rather than one per circle — the workbench's
 * budget readout is sitting right above this switch and should stay readable
 * while it is on.
 */
export function makeLayoutOverlay(scene, opts = {}) {
  const group = new THREE.Group();
  group.name = 'layout-guides';
  group.userData.noShadow = true;
  // Not part of the picture: no depth test, so a keepout under the hut is still
  // visible (which is the point of looking at it), no depth write, so the ink
  // pass and the shadow map never see these lines, and drawn last.
  for (const g of layoutGuides(scene, opts)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.points, 3));
    const mat = new THREE.LineBasicMaterial({
      color: g.color, fog: false, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9,
    });
    const lines = new THREE.LineSegments(geo, mat);
    lines.name = `layout-${g.name}`;
    lines.renderOrder = 999;
    lines.userData.noOutline = true;
    lines.frustumCulled = false;
    group.add(lines);
  }
  group.userData.noOutline = true;

  group.dispose = () => {
    for (const l of group.children) { l.geometry.dispose(); l.material.dispose(); }
    group.clear();
  };
  return group;
}
