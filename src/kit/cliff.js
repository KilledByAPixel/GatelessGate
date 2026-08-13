import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK, PAPER, WASH, wash, mixHex, hexToRgb } from '../palette.js';
import { hash1, noise1 } from '../util/noise.js';
import { groundHeight } from './ground.js';
import { mergeSimple } from './scatter.js';
import { smoothstep as SS } from '../util/math.js';

// A precipice for case 5: the local ground breaking off into empty fogged
// space. Faceted lumps in the cave.js manner — a raised, broken LIP the meadow
// runs right up to, a craggy FACE falling away below it, and a field of MIST
// lying in the void beyond.
//
// THE MIST IS THE DROP. The world's ground is one continuous noise field at
// y ≈ 0, and it keeps existing on the far side of the lip — so a face modelled
// below y = 0 is behind that ground from every angle the rig allows, and a
// "hole" cannot be cut without owning the ground mesh. What sells the
// precipice instead is what an ink painter uses: the meadow stops at a broken
// rock line, and past it there is only blank paper. The mist banks are soft
// unlit near-paper sprites laid OVER the far ground, so beyond the lip the
// eye finds nothing to stand on. The sub-zero face is still built — its upper
// crags poke through the mist seam at the lip, and it fades toward paper on
// the way down so whatever shows of it is already dissolving.
//
// Local frame: the lip runs along +x (length `width`), safe ground lies on the
// +z side, the drop falls on the -z side. Stands from y ≈ ground; the caller
// positions/rotates the group and passes the SAME placement in `origin`/`yaw`
// so the lip can sample the rolling ground it has to blend into.

// one soft radial sprite, near-paper, shared by every bank of every cliff
let mistTex = null;
function mistTexture() {
  if (mistTex) return mistTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const [r, g, b] = hexToRgb(wash(0.05));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const ny = ((y + 0.5) / size) * 2 - 1;
      const d = Math.hypot(nx, ny);
      // solid core, feathered rim: the middle of a bank must actually hide the
      // meadow behind it; only the margins thin out
      let a = Math.max(0, Math.min(1, (1 - d) * 2.1));
      a = a * a * (3 - 2 * a);
      const i = (y * size + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
      data[i + 3] = Math.round(a * 255);
    }
  }
  mistTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  mistTex.colorSpace = THREE.SRGBColorSpace;
  mistTex.needsUpdate = true;
  mistTex.userData = { shared: true };
  return mistTex;
}

export function makeCliff({
  width = 10,
  drop = 5,
  depth = 2.2,
  color = WASH.stone,
  seed = 5,
  origin = [0, 0],
  yaw = 0,
  groundSeed = 21,
  // Where the fog fill's surface lies. The default hides everything below a
  // shallow shelf — most of "the drop" is mist. A case that wants the fall
  // to read DEEP passes this lower and more of the face shows before the
  // paper takes over (k5, Frank: "can we make the cliff deeper?").
  fogTop = -1.15,
} = {}) {
  const g = new THREE.Group();
  g.name = 'cliff';
  const rnd = (i) => hash1(i, seed);
  const rock = [];    // plan-view circles of the solid rock, local space
  const void_ = [];   // plan-view circles of the mist field, local space

  // where a local point lands in the world, for sampling the rolling ground
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const groundAt = (lx, lz) =>
    groundHeight(origin[0] + lx * cy + lz * sy, origin[1] - lx * sy + lz * cy, { seed: groundSeed });

  // one faceted lump with its TOP at a stated height — the only measurement
  // that matters for blending into turf
  function lump(out, j, lx, lz, r, sx, syc, sz, top) {
    const d = new THREE.DodecahedronGeometry(r, 0);
    d.rotateY(rnd(j) * Math.PI * 2);
    d.rotateZ((rnd(j + 1) - 0.5) * 0.5);
    d.scale(sx, syc, sz);
    d.translate(lx, top - r * syc * 0.92, lz);
    out.push(d);
    return { x: lx, z: lz, r: r * Math.max(sx, sz) };
  }

  // ---- the lip: a broken rock line the meadow runs up to -------------------
  // Two staggered courses, the outboard one lower — a stepped edge, not a wall.
  const lipGeos = [];
  const N = Math.max(6, Math.round(width / 1.05));
  for (let i = 0; i < N; i++) {
    const j = i * 13;
    const lx = -width / 2 + ((i + 0.5) / N) * width + (rnd(j + 1) - 0.5) * 0.55;
    const lz = -0.10 + (rnd(j + 2) - 0.5) * 0.45;
    const r = 0.34 + rnd(j + 3) * 0.30;
    const gy = groundAt(lx, lz);
    rock.push(lump(lipGeos, j + 4, lx, lz, r,
      1.35 + rnd(j + 6) * 0.5, 0.62 + rnd(j + 7) * 0.30, 0.95 + rnd(j + 8) * 0.30,
      gy + 0.26 + rnd(j + 9) * 0.28));
    // the lower outboard course, already leaning into the drop
    if (rnd(j + 10) > 0.35) {
      rock.push(lump(lipGeos, j + 11, lx + (rnd(j + 12) - 0.5) * 0.7, lz - 0.55, r * 0.8,
        1.2, 0.55, 0.9, gy + 0.06 + rnd(j + 5) * 0.12));
    }
  }
  const lip = new THREE.Mesh(mergeSimple(lipGeos),
    washMaterial({ color: mixHex(color, INK, 0.14), flat: true }));
  lip.name = 'lip';
  g.add(lip);

  // ---- the face: crags falling away, dissolving toward paper ---------------
  // Row tones run dark -> pale with depth; the deepest row is already half paper.
  const ROWS = [
    { y: -0.16, z: -0.40, tone: mixHex(color, INK, 0.26) },
    { y: -0.46, z: -0.66, tone: mixHex(color, PAPER, 0.32) },
    { y: -0.78, z: -0.92, tone: mixHex(color, PAPER, 0.62) },
  ];
  ROWS.forEach((row, k) => {
    const geos = [];
    const M = N - 1 - k;
    for (let i = 0; i < M; i++) {
      const j = 1000 + k * 500 + i * 11;
      const lx = -width / 2 + ((i + 0.5) / M) * width * 0.98 + (rnd(j + 1) - 0.5) * 0.6;
      const lz = row.z * depth * 0.5 - rnd(j + 2) * 0.35;
      const r = (0.46 + rnd(j + 3) * 0.38 + k * 0.10) * (drop / 5 + 0.5);
      const c = lump(geos, j + 4, lx, lz, r,
        1.25 + rnd(j + 6) * 0.4, 1.35 + rnd(j + 7) * 0.55, 0.9 + rnd(j + 8) * 0.3,
        row.y * drop + rnd(j + 9) * drop * 0.10);
      if (k === 0) rock.push(c);   // deeper rows share the same plan as row 0
    }
    const m = new THREE.Mesh(mergeSimple(geos), washMaterial({ color: row.tone, flat: true }));
    m.name = k === ROWS.length - 1 ? 'skirt' : 'face';
    g.add(m);
  });

  // ---- the mist: the void itself -------------------------------------------
  // Unlit soft sprites laid over the far ground, sunk under the lip stones and
  // rising slightly with distance. The nearest bank tucks its feathered edge in
  // UNDER the lip so no strip of meadow ever shows beyond the rock line.
  // NO PAPER OVER THE DROP. There was a fog fill here: an unlit near-paper
  // solid that filled the gorge from just under the crags downward, so
  // everything past the fog line was paper rather than landscape. It existed
  // because the mist sprites below are horizontal, go edge-on as the camera
  // drops toward the horizon, and let a low shot see straight onto the gorge
  // floor — and a solid cannot go edge-on.
  //
  // It answered "the floor is visible" with "then let nothing be visible",
  // which was the right trade while these drops were shallow shelves and the
  // floor showing through was an artifact. Both cases that use this builder
  // now carve real gorges — meandering lips, tapered side walls, a far wall
  // climbing back out — and what the fill was hiding had become scenery. It
  // read as a lid laid across the chasm, which is how Frank found it at all:
  // "it looks like there might be another piece of geo on top of the cliff
  // bottom." Off in case 5 first, then case 12 ("it also looks bad in k12...
  // it's just a cliff, you know?"), and with no third caller it is gone
  // rather than left as a flag nothing sets.
  //
  // If a future cliff wants a bottomless drop again, the shape to build is
  // not a box: a box has a ruler-straight top face and that face IS the lid.
  // A surface banked up against the side walls and toward the back is what
  // reads as mist piled in a narrowing gorge.
  const FOG_TOP = fogTop;

  const tex = mistTexture();
  const BANKS = [
    { z: -(depth * 0.5 + 1.4), y: FOG_TOP + 0.10, sx: width * 1.55, sz: 6.5, op: 0.95 },
    { z: -(depth * 0.5 + 4.2), y: FOG_TOP + 0.28, sx: width * 1.70, sz: 8.0, op: 0.90 },
    { z: -(depth * 0.5 + 7.4), y: FOG_TOP + 0.50, sx: width * 1.80, sz: 8.5, op: 0.84 },
    { z: -(depth * 0.5 + 11.0), y: FOG_TOP + 0.85, sx: width * 1.85, sz: 9.0, op: 0.78 },
  ];
  BANKS.forEach((bank, k) => {
    const j = 4000 + k * 17;
    const jx = (rnd(j + 1) - 0.5) * 1.4;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: bank.op, depthWrite: false,
      }));
    mesh.name = 'mist';
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = (rnd(j + 2) - 0.5) * 0.4;
    mesh.scale.set(bank.sx, bank.sz, 1);
    mesh.position.set(jx, Math.max(0, groundAt(jx, bank.z)) + bank.y, bank.z);
    g.add(mesh);
    // three circles per bank so the keepout has no seams for a tree to grow
    // through and stand in the mist
    for (const dx of [-0.33, 0, 0.33]) {
      void_.push({ x: jx + dx * bank.sx, z: bank.z, r: bank.sz * 0.55 });
    }
  });

  // world-space circles, cave.js style: computed from wherever the group has
  // been put by the time they are asked for.
  const toWorld = ({ x, z, r }, pad) => {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    return { x: g.position.x + x * c + z * s, z: g.position.z - x * s + z * c, r: r + pad };
  };
  // the solid rock — keeps props off the lip and the crags
  g.footprint = (pad = 0.5) => rock.map((c) => toWorld(c, pad));
  // the open-air side — keeps scatter and grass from floating over the drop
  g.voidFootprint = (pad = 0.5) => void_.map((c) => toWorld(c, pad));
  return g;
}
