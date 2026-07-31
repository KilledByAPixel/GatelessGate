import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { mergeSimple } from './scatter.js';

// THE sumi-e pine: horizontal cloud-pads floating on a crooked line.
//
// Not a fir. The old build was a stack of concentric cones on a stub of trunk —
// a Christmas tree, symmetric about its own axis, which is the one silhouette
// an ink painter never draws. What they draw is a bole that visibly changes its
// mind twice on the way up, with flat pads of needles hung off it to
// alternating sides, so the profile ZIGZAGS. The trunk is the subject; the pads
// are what hangs from it.
//
// Three things carry that read here:
//   1. an elbowed trunk — three segments meeting at two knuckles, the last one
//      turning back over the root so the crown balances above the base;
//   2. pads that are FLAT (a shallow six-sided cone, far wider than it is
//      thick), elliptical rather than round, and tilted so their outer edge
//      dips;
//   3. pad centres kicked off the trunk to alternating sides, and spaced with
//      widening gaps toward the crown — sparse at the top, heavy at the bottom.
//
// The flat pad tops matter beyond the silhouette: case 41 stands under falling
// snow, and a broad up-facing facet is what reads as a bough carrying snow
// under the toon ramp's high key. Nothing in snowfall.js knows about this.
//
// pineGeometry() returns ONE merged BufferGeometry so a whole stand can be
// drawn as a single InstancedMesh (see makeForest); makePine() wraps it in a
// mesh for the hero pine placed by hand (cases 12, 36, 41).
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const SEGS = 3;                      // three segments => two elbows
const FRAC = [0.40, 0.34, 0.26];     // their share of the trunk's path length

export function pineGeometry({ height = 4, tiers = 5, seed = 3 } = {}) {
  const parts = [];
  // One deterministic stream for the whole tree, drawn in build order: trunk
  // first, then pads bottom-to-top. Adding or removing a draw reshapes every
  // pine downstream of it — deliberate here (the whole model changed), but the
  // order stays stable from now on.
  let draw = 0;
  const rnd = () => hash1(draw++, seed);

  // ---- the crooked line ---------------------------------------------------
  const az = rnd() * Math.PI * 2;                  // which way this one leans
  const pathLen = height * 0.95;
  // A short vertical root stub before the first crook. Without it the leaning
  // first segment presents a TILTED end cap at y=0 and one side of it hangs
  // below the ground; the stub keeps the base flush whichever way the tree
  // walks off it, and flares like an old trunk while it's there.
  const rootH = height * 0.055;
  const rootStart = rootH * 0.72;                  // the crook starts inside the stub
  const nodes = [new THREE.Vector3(0, 0, 0)];
  let side = rnd() < 0.5 ? 1 : -1;
  for (let k = 0; k < SEGS; k++) {
    let tilt, a;
    if (k < SEGS - 1) {
      // the two lower segments lean to opposite sides — this is the elbow.
      // It has to be a real angle: at 0.15 rad the bole just read as a
      // slightly wonky post, not as a tree that changed its mind.
      tilt = 0.22 + 0.20 * rnd();
      a = az + (rnd() - 0.5) * 0.7 + (side > 0 ? 0 : Math.PI);
      side = -side;
    } else {
      // the crown segment turns back over the root, so a tree that walked out
      // to one side arrives back above where it started
      const p = nodes[k];
      tilt = 0.14 + 0.16 * rnd();
      a = Math.atan2(-p.z, -p.x) + (rnd() - 0.5) * 0.5;
    }
    const d = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    nodes.push(nodes[k].clone().addScaledVector(d, pathLen * FRAC[k]));
  }
  // the leaning cost some height back; stretch the line so the crown lands at
  // the same fraction of `height` whatever the seed did
  const kY = (height * 0.86 - rootStart) / nodes[SEGS].y;
  for (const n of nodes) n.y = n.y * kY + rootStart;

  // The bole has to survive being twenty metres away in fog: at 0.032 it
  // vanished at scene scale and left the pads floating as separate parasols.
  const rBase = height * 0.038;
  const rTip = height * 0.011;
  const root = new THREE.CylinderGeometry(rBase, rBase * 1.35, rootH, 5);
  root.translate(0, rootH / 2, 0);
  parts.push(root);
  for (let k = 0; k < SEGS; k++) {
    const a = nodes[k];
    const b = nodes[k + 1];
    const len = a.distanceTo(b);
    const r0 = rBase + (rTip - rBase) * (k / SEGS);
    const r1 = rBase + (rTip - rBase) * ((k + 1) / SEGS);
    const seg = new THREE.CylinderGeometry(r1, r0, len, 5);
    seg.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, b.clone().sub(a).normalize());
    seg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
    seg.translate(a.x, a.y, a.z);
    parts.push(seg);
    // a swollen knuckle at each elbow: closes the mitre gap where two segments
    // meet at an angle, and reads as the crook itself
    if (k < SEGS - 1) {
      const knuckle = new THREE.OctahedronGeometry(r1 * 1.35, 0);
      knuckle.scale(1, 0.6, 1);
      knuckle.translate(b.x, b.y, b.z);
      parts.push(knuckle);
    }
  }

  // where the trunk is at a given height, so pads hang off the line and not
  // off the y axis
  const trunkAt = (y) => {
    for (let k = 0; k < SEGS; k++) {
      const a = nodes[k];
      const b = nodes[k + 1];
      if (y <= b.y || k === SEGS - 1) {
        const t = Math.max(0, Math.min(1, (y - a.y) / Math.max(1e-6, b.y - a.y)));
        return new THREE.Vector3().lerpVectors(a, b, t);
      }
    }
    return nodes[SEGS].clone();
  };

  // ---- the pads -----------------------------------------------------------
  // A pad is a shallow six-sided TRUNCATED cone — a wedge of ink wider at the
  // bottom than the top. A true cone put a point at the centre of every pad and
  // the whole tree read as a stack of spiky pyramids; cutting the apex off
  // leaves a broad flat plateau, which is both the sumi-e read and the surface
  // case 41's snow appears to be sitting on.
  const addPad = (c, rad, thick, dipAz, dip, squash, spin, taper) => {
    const g = new THREE.CylinderGeometry(rad * taper, rad, thick, 6, 1);
    g.scale(1, 1, squash);          // elliptical — no pad is a disc
    g.rotateY(spin);                // break the shared hexagon seam
    g.rotateZ(-dip);                // the outer edge droops...
    g.rotateY(-dipAz);              // ...on the side it hangs from
    g.translate(c.x, c.y, c.z);
    parts.push(g);
  };

  for (let i = 0; i < tiers; i++) {
    const f = tiers === 1 ? 0 : i / (tiers - 1);   // 0 at the lowest pad, 1 at the crown
    // gaps widen as they climb: the top of a painted pine is sparse, the
    // bottom is where the ink pools
    // Spacing accelerates: the bottom three pads OVERLAP into one mass and
    // only the top two stand clear. Even gaps looked right in the workbench
    // and fell apart in-case — at thirty pixels tall a stack of separated
    // pads stops being a tree and becomes a pile of hats. The dense base is
    // what keeps the silhouette whole at distance; the clear crown is what
    // keeps it a pine and not a fir up close.
    const y = height * (0.31 + 0.55 * Math.pow(f, 1.15));
    const rad = height * (0.285 - 0.165 * f) * (0.86 + 0.28 * rnd());
    // A pad is a MASS of needles, not a plate. At a diameter:thickness of 9:1
    // it read as sheet metal nailed to a post; ~3.3:1 reads as ink.
    const thick = height * (0.175 - 0.078 * f) * (0.85 + 0.30 * rnd());
    // flat plateaus low down, a more peaked cap at the crown, so the tree
    // finishes on a point rather than a lampshade
    const taper = 0.52 - 0.24 * f;
    // pads swap sides as they climb — the alternation IS the zigzag. The kick
    // eases off toward the crown so the top stays over the trunk.
    const kickAz = az + (i % 2 ? Math.PI : 0) + (rnd() - 0.5) * 0.9;
    const kick = rad * (0.30 + 0.32 * rnd()) * (1 - 0.5 * f);
    const at = trunkAt(y);
    const c = new THREE.Vector3(at.x + Math.cos(kickAz) * kick, y, at.z + Math.sin(kickAz) * kick);
    const dip = (0.10 + 0.16 * rnd()) * (1.25 - 0.45 * f);   // the low boughs sag hardest
    addPad(c, rad, thick, kickAz, dip, 0.74 + 0.24 * rnd(), rnd() * Math.PI, taper);

    // the heavy lower pads are two overlapping lobes, not one hexagon — this
    // is what stops a pad reading as a machined disc at scene scale
    if (f < 0.55) {
      const la = kickAz + (rnd() - 0.5) * 2.4;
      const lr = rad * (0.40 + 0.20 * rnd());
      const lc = new THREE.Vector3(
        c.x + Math.cos(la) * rad * 0.50,
        y - thick * 0.18,
        c.z + Math.sin(la) * rad * 0.50,
      );
      addPad(lc, lr, thick * 0.85, la, dip * 1.2, 0.80 + 0.18 * rnd(), rnd() * Math.PI, taper);
    }
  }

  return mergeSimple(parts);
}

export function makePine({ height = 4, tiers = 5, seed = 3, color = WASH.dark } = {}) {
  const mesh = new THREE.Mesh(pineGeometry({ height, tiers, seed }), toonMaterial({ color, flat: true }));
  mesh.name = 'pine';
  return mesh;
}
