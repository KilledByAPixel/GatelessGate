import * as THREE from '../../lib/three.module.js';
import { hash1 } from '../util/noise.js';
import { toonMaterial } from '../render/toon.js';
import { WASH } from '../palette.js';
import { pineGeometry } from './pine.js';
import { groundHeight } from './ground.js';
import { makeTree } from './tree.js';
import { makeOak } from './oak.js';
import { mergeSimple } from './scatter.js';

// A distant stand of trees as ONE merged mesh (a single draw call), read as a
// dark mass at the edge of the fog rather than individual trees. Species mix
// — pine, sapling (makeTree), and oak silhouettes, at a seeded ratio — is
// what turns that mass from a field of identical cones into something that
// reads as a real wood: a tiered-pine zigzag broken up by rounder broadleaf
// clumps. Kept to a small pool of pre-built shape TEMPLATES per species
// (rather than growing a fresh tree per instance, which would make the stand's
// build cost scale with `count`) — each instance picks a species and a
// template by seeded draw, then stamps a positioned copy of it into the merge
// list, so cost stays bounded regardless of how many trees are asked for.
// Every instance is baked straight into ONE static geometry rather than drawn
// via InstancedMesh, so the draw-call cost is exactly what it was when the
// stand held one species: one mesh, however many trees or species it mixes.
// Trunk/canopy hue (oak/tree normally keep those separate — see oak.js,
// tree.js) is deliberately NOT preserved here: at forest distance, under fog,
// through the toon ramp's flat shading, bark barely reads apart from foliage
// anyway, and folding both into the forest's one flat `color` is what keeps
// the whole stand a single draw call no matter how many species it mixes.
const PINE_TEMPLATES = 3;
const TREE_TEMPLATES = 3;
const OAK_TEMPLATES = 2;
// seeded species ratio: pine-heavy (conifer country), broadleaf the minority
// — enough tree/oak silhouettes breaking the pine zigzag that the stand reads
// as mixed wood, not a fir plantation. Remainder (1 - PINE - TREE) is oak.
const PINE_SHARE = 0.55;
const TREE_SHARE = 0.25;

function buildTemplates(kind, n, baseSeed, treeH) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const tplSeed = baseSeed * 977 + k * 131 + 7;
    if (kind === 'pine') {
      out.push(pineGeometry({ height: treeH, tiers: 5, seed: tplSeed }));
    } else if (kind === 'tree') {
      // depth 2, not makeTree's own default 3: a forest member is a small
      // silhouette in the fog, not a hero placement, and the shallower
      // recursion keeps a whole pool of these cheap to build. Height matches
      // `treeH` exactly, same as pine — a taller broadleaf envelope was tried
      // and pushed real geometry into k19's moon sightline (its own hard
      // occlusion test caught it); species mix must not change the stand's
      // silhouette ENVELOPE, only what's inside it.
      const t = makeTree({ height: treeH, seed: tplSeed, depth: 2 });
      out.push(mergeSimple([
        t.getObjectByName('trunk').geometry,
        t.getObjectByName('canopy').geometry,
      ]));
    } else {
      // fewer crown lobes than makeOak's own default 16, for the same reason;
      // height matches `treeH` too, for the same reason as tree above
      out.push((() => {
        const o = makeOak({ height: treeH, seed: tplSeed, lobes: 8 });
        return mergeSimple([
          o.getObjectByName('trunk').geometry,
          o.getObjectByName('canopy').geometry,
        ]);
      })());
    }
  }
  return out;
}

function pickTemplate(templates, u) {
  const i = Math.min(templates.length - 1, Math.floor(u * templates.length));
  return templates[i];
}

export function makeForest({
  count = 50, center = [0, 0, -28], spread = 16, seed = 41,
  color = WASH.mid, treeH = 2.8,
  // Circles ({x, z, r}) no tree may stand in — composeWorld passes the
  // mountains' footprints. Instances that land inside are SKIPPED, not
  // re-rolled: every surviving tree keeps the exact position it always
  // had, and the stand just thins where the rock eats its disc. (Frank:
  // "clearly, obviously, trees that are inside the mountain.")
  avoid = [],
  // The stand's species: 'mixed' is the classic conifer-heavy blend below;
  // 'pine' and 'tree' (broadleaf — sapling and oak silhouettes) follow a
  // case's treeKind so the fog line agrees with the midground (Frank found
  // a broadleaf standing in his all-pine scene — it was a forest member,
  // which used to ignore the scatter's species entirely).
  kind = 'mixed',
  // The terrain the bases stand on. They used to sit at a flat y = -0.45 and
  // trust the roll to meet them — near the flat middle it does, but a stand
  // out at 25+ units can sit where the ground rises a full unit or falls
  // away, and Frank watched background trees bury to the canopy. Each base
  // now samples the same terrain the ground mesh is built from, sunk a
  // little so no trunk ever hovers on a downslope edge.
  groundSeed = 21,
} = {}) {
  const pineTpl = buildTemplates('pine', PINE_TEMPLATES, seed, treeH);
  const treeTpl = buildTemplates('tree', TREE_TEMPLATES, seed, treeH);
  const oakTpl = buildTemplates('oak', OAK_TEMPLATES, seed, treeH);

  const parts = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const kept = [];
  for (let i = 0; i < count; i++) {
    const a = hash1(i * 3 + 1, seed) * Math.PI * 2;
    const r = Math.sqrt(hash1(i * 3 + 2, seed)) * spread;
    const sc = 0.7 + 0.9 * hash1(i * 3 + 3, seed);
    const ix = center[0] + Math.cos(a) * r, iz = center[2] + Math.sin(a) * r;
    if (avoid.some((c) => Math.hypot(ix - c.x, iz - c.z) < c.r * 0.85)) continue;
    kept.push({ x: ix, z: iz });
    p.set(ix, groundHeight(ix, iz, { seed: groundSeed }) - 0.18, iz);
    e.set(0, hash1(i * 5 + 4, seed) * Math.PI, 0);
    q.setFromEuler(e);
    s.set(sc, sc, sc);
    m4.compose(p, q, s);

    const pick = hash1(i * 7 + 5, seed);
    const variant = hash1(i * 7 + 6, seed);
    let tpl;
    if (kind === 'pine') tpl = pickTemplate(pineTpl, variant);
    else if (kind === 'tree') {
      // broadleaf country: the sapling/oak blend at their old relative shares
      tpl = pick < TREE_SHARE / (1 - PINE_SHARE)
        ? pickTemplate(treeTpl, variant) : pickTemplate(oakTpl, variant);
    } else if (pick < PINE_SHARE) tpl = pickTemplate(pineTpl, variant);
    else if (pick < PINE_SHARE + TREE_SHARE) tpl = pickTemplate(treeTpl, variant);
    else tpl = pickTemplate(oakTpl, variant);

    parts.push(tpl.clone().applyMatrix4(m4));
  }

  // THE STAND DOES NOT MOVE IN THE WIND, deliberately. The templates carry the
  // foliage-wind attributes (their builders bake them — kit/foliage.js), and
  // this merge drops them, because `mergeSimple` without `extras` copies
  // position and normal only. That is the intended outcome, not an oversight:
  // a forest is a background mass in fog at the far end of the scene, and
  // rustling several hundred merged trees would spend the whole effect where
  // nobody can see it while a hand-placed tree ten metres away is the thing
  // being looked at. If this ever should move, the missing piece is passing the
  // templates' own aSway/aPhase/aLeaf through the merge with a per-tree phase
  // offset — the attributes exist upstream, they just stop here.
  const merged = mergeSimple(parts);
  const mat = toonMaterial({ color, flat: true });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'forest';
  mesh.userData.instances = kept;  // self-describing, for the scene nets (positions are LOCAL to this mesh)
  return mesh;
}
