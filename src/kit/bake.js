import * as THREE from '../../lib/three.module.js';
import { mergeSimple } from './scatter.js';

// BAKING A STILL PROP DOWN TO ITS DRAW CALLS.
//
// Figures and animals are built part by part — a monk is a robe, two sleeves,
// a head, sometimes a hat and a staff; a horse is eleven pieces — and every
// one of those is a draw call. A crowd therefore costs its scene most of the
// budget, and the cases that have crowds used to pay for them by cutting
// bystanders went without arms and three of its five stalls went without
// keepers, for no reason but this. This module is why neither cut is needed
// any more — the bystanders have their arms back and the second keeper is
// restored, because a crowd that bakes down to one mesh can afford them.
//
// Almost none of it needs to be separate. A figure is POSED at build time and
// then never moves a part again — only six cases in the book reach inside one
// afterwards (four take the bow hinge, one takes a staff, k3 lifts a sleeve).
// Baking a transform into vertices preserves a pose exactly; what it destroys
// is the ability to change one LATER.
//
// So this is opt-in, per instance, and the case decides. A prop the case knows
// is still gets merged to one mesh per material; anything that moves simply is
// not passed in.
//
// THE ORDER IS THE CONTRACT: call this after the case has finished posing,
// recolouring and composing — merging a part before its final pose or colour
// bakes in the wrong one, with nothing left afterward to fix it on.
//
// The single-prop form mutates the prop IN PLACE and returns it, rather than
// returning a replacement: cases hold references to what they built (k45
// writes `horse.group.rotation.y` every frame) and tests find props by name,
// and a swap would leave every one of those pointing at a detached group.
//
// THE ADOPTION HAZARD IS BROADER THAN "getObjectByName finds nothing" — that
// covers lookups BY NAME, but anything that finds a part by TRAVERSAL breaks
// too, and more quietly. chimes.js's `collectChimes` finds every hung fūrin
// by sweeping a scene for `userData.hungBy === 'hangChimes'` on a group; bake
// a `makeHut` or `makeGate` prop that hangs one and the group is gone, so the
// chime never rings and nothing in the console says why.

// What makes two meshes the same DRAW. Material equivalence, not object
// identity: every makeMonk mints its own washMaterial, so identity would leave
// nine monks as nine meshes and the whole point would be lost. The userData
// flags are in the key because they change how the mesh is treated downstream
// — keepMaterial whether the workbench's plain-Lambert rebuild does,
// noShadow/noCastShadow whether debug.js's shadow pass touches it (water.js,
// foam.js) — and two meshes that disagree about any of them cannot share one. emissive/emissiveIntensity are
// in the key for the same reason colour is: material.js's seal glow
// (`washMaterial({ glow: false })`) exists precisely so two accent-coloured
// materials CAN differ only by glow, and a merge that ignored it would spread
// one mesh's glow across the other's surface — the case-30 pond bug material.js's
// own comment records, again.
function drawKey(mesh) {
  const m = mesh.material;
  return [
    m.type,
    m.color ? m.color.getHexString() : '-',
    m.side,
    !!m.transparent,
    m.opacity,
    !!m.flatShading,
    m.emissive ? m.emissive.getHexString() : '-',
    m.emissiveIntensity ?? 1,
    !!mesh.userData.keepMaterial,
    !!mesh.userData.noShadow,
    !!mesh.userData.noCastShadow,
  ].join('|');
}

// A material only NEEDS uv if something on it actually samples the surface
// by texel. Every `*Map` slot (`map`, `alphaMap`, `normalMap`, `bumpMap`,
// `emissiveMap`, `roughnessMap`, `aoMap`, `displacementMap`, `specularMap`,
// …) samples by uv, so the refusal has to be the general rule rather than a
// list of the two slots this kit happens to use today — a normal-mapped
// material merged through a narrow list would sample (0,0) everywhere and
// render flat with nothing failing, the exact failure shape material.js's
// plainMaterial comment records happening five separate times.
function usesUV(m) {
  for (const key in m) {
    if (key.endsWith('Map') && m[key]) return true;
  }
  return false;
}

// What this refuses to swallow. Each of these stays where it is, as an
// ordinary child of the baked prop, so nothing ever disappears — the other
// half of that promise, for anything that is not a Mesh or Points at all
// (a Light, a Sprite, a LineSegments), is `walk`'s own `else if` below.
function canMerge(o) {
  if (!o.isMesh) return false;
  if (o.isInstancedMesh || o.isPoints) return false;      // already one draw
  if (o.visible === false) return false;                  // hit proxies
  if (o.userData.foliageWind) return false;               // carries wind attributes
  if (!o.material || !o.geometry) return false;
  if (o.material.isMaterial !== true) return false;        // material arrays: one mesh, several draws
  for (const name of Object.keys(o.geometry.attributes)) {
    // mergeSimple moves position and normal and nothing else; anything richer
    // would be silently dropped, which is how a wind attribute becomes a
    // canopy that stops moving with nothing failing. `uv` is the one
    // exception: THREE mints it on every BufferGeometry whether or not
    // anything reads it, and none of the props this bakes ever do — so it
    // only disqualifies a mesh when its OWN material samples a
    // texture by it (a tuft's alpha-tested map, say), the case dropping it
    // would actually be seen.
    if (name === 'uv' && !usesUV(o.material)) continue;
    if (name !== 'position' && name !== 'normal') return false;
  }
  // mergeSimple reads `normal.array` unconditionally (scatter.js) — a
  // hand-built geometry that never called computeVertexNormals() would pass
  // the attribute-name gate above (it has no attribute mergeSimple doesn't
  // want) and then die inside the merge with "Cannot read properties of
  // undefined (reading 'array')", from a file the case author did not write.
  if (!o.geometry.attributes.position || !o.geometry.attributes.normal) return false;
  return true;
}

export function bakeStatic(target, opts = {}) {
  const single = !Array.isArray(target);
  const targets = single ? [target] : target;
  if (!targets.length) throw new Error('bakeStatic: nothing to bake');
  if (single && target.isMesh) {
    throw new Error('bakeStatic: pass the prop group, not a mesh — a lone mesh is already one draw');
  }

  // Names whose whole subtree stays out of the merge. A prop that is still
  // EXCEPT for one part — case 24's grazing buffalo, twelve static pieces and
  // a tail that swings — would otherwise have to stay unbaked entirely.
  const keep = new Set(opts.keep || []);

  // THE FRAME the geometry is baked into.
  //   single — the prop's own frame, so the prop keeps its position and
  //            rotation and the whole thing still moves.
  //   array  — the shared parent's frame, so the merged group sits at identity
  //            and each prop's placement is carried in the vertices.
  let frame;
  if (single) {
    frame = target;
  } else {
    frame = opts.into || targets[0].parent;
    for (const t of targets) {
      if (!opts.into && t.parent !== frame) {
        throw new Error('bakeStatic: these props do not share a parent — pass { into }');
      }
    }
    if (!frame) throw new Error('bakeStatic: no parent to bake into — pass { into }');
  }
  frame.updateWorldMatrix(true, true);
  // with `into`, the props may live anywhere; their own chains have to be
  // current or the bake reads stale placements
  for (const t of targets) t.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert();

  const buckets = new Map();
  const survivors = [];
  const uses = new Map();          // source geometry -> how many times this bake used it

  const walk = (o) => {
    if (keep.has(o.name)) { survivors.push(o); return; }
    if (o.isMesh || o.isPoints) {
      if (!canMerge(o)) {
        // a survivor keeps its WHOLE SUBTREE: anything parented to a thing
        // that still moves has to move with it
        survivors.push(o);
        return;
      }
      let b = buckets.get(drawKey(o));
      if (!b) {
        b = { material: o.material, geos: [], userData: {} };
        if (o.userData.keepMaterial) b.userData.keepMaterial = true;
        if (o.userData.noShadow) b.userData.noShadow = true;
        if (o.userData.noCastShadow) b.userData.noCastShadow = true;
        buckets.set(drawKey(o), b);
      }
      const g = o.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      b.geos.push(g);
      uses.set(o.geometry, (uses.get(o.geometry) || 0) + 1);
      // and FALL THROUGH to the children: a part can be parented to another
      // part rather than to the prop. A folded arm hangs its forearm off the
      // upper sleeve's own mesh (figure.js: `arm.add(fore)`), so a walk that
      // stopped at a merged mesh would drop both forearms of every seated
      // figure in the book and nothing but the triangle count would say so.
    } else if (o.type !== 'Group' && o.type !== 'Object3D') {
      // Anything that is neither mergeable (handled above) nor a PLAIN
      // container survives whole, subtree and all — a Light, a Sprite, a
      // LineSegments parented inside a still prop (pole.js's guy-lines,
      // rainfall.js's rain) would otherwise fall through to here, be walked
      // for children it doesn't have, and then be silently destroyed by the
      // wholesale child removal below. `type` rather than an `isX` allowlist
      // because every THREE class stamps its own (`'Mesh'`, `'Light'`,
      // `'Sprite'`, `'LineSegments'`, `'PerspectiveCamera'`…) while Group and
      // the bare Object3D — the only containers this kit actually builds —
      // both stay `'Group'`/`'Object3D'`.
      survivors.push(o);
      return;
    }
    for (const c of [...o.children]) walk(c);
  };
  for (const t of targets) {
    if (single) for (const c of [...t.children]) walk(c);
    else walk(t);
  }

  // capture survivor placements before anything is unparented
  const placed = survivors.map((s) => ({
    node: s,
    m: new THREE.Matrix4().multiplyMatrices(inv, s.matrixWorld),
  }));

  const merged = [];
  let i = 0;
  for (const b of buckets.values()) {
    const mesh = new THREE.Mesh(mergeSimple(b.geos), b.material);
    mesh.name = `baked-${i++}`;
    Object.assign(mesh.userData, b.userData);
    merged.push(mesh);
  }

  const host = single ? target : new THREE.Group();
  if (single) {
    for (const c of [...target.children]) target.remove(c);
  } else {
    host.name = opts.name || 'baked';
    for (const t of targets) t.removeFromParent();
  }
  for (const m of merged) host.add(m);
  for (const { node, m } of placed) {
    node.removeFromParent();
    m.decompose(node.position, node.quaternion, node.scale);
    host.add(node);
  }
  if (!single) frame.add(host);

  host.userData.bakedFrom = targets.map((t) => t.name || 'unnamed');

  // Dispose only what this bake alone consumed. A geometry the bake saw twice
  // may be shared with something outside it, and one dispose would empty both
  // — and "outside it" includes a SURVIVOR of this same bake: a `keep`
  // subtree, a foliage mesh, a hit proxy can hold the very geometry object a
  // sibling mesh got merged (and cloned) from. `uses` only counts merge
  // consumption, so without this a survivor-held geometry with exactly one
  // merge-use would be disposed out from under the survivor still using it.
  // THREE re-uploads on the next render, so nothing goes black — which is why
  // this was Minor — but it defeats the one case `keep` exists for.
  const survivorGeos = new Set();
  for (const s of survivors) s.traverse((o) => { if (o.geometry) survivorGeos.add(o.geometry); });
  for (const [geo, n] of uses) if (n === 1 && !survivorGeos.has(geo)) geo.dispose();

  return host;
}
