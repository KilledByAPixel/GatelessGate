import * as THREE from '../../lib/three.module.js';
import { noise1 } from '../util/noise.js';
import { washMaterial } from '../render/material.js';
import { groundHeight } from './ground.js';
import { wash } from '../palette.js';

// The beach: a pale band draped over the shore taper, the path ribbon's idiom
// at right angles — where a path follows its own centerline over plain
// terrain, the sand follows the waterline over the shore. Its upper edge laps
// a little way into the grass with a seeded wobble (a ruler-straight grass
// line reads as a lawn edge, not a coast); its lower edge continues past the
// waterline so the water sheet's own rim hides under it and is never seen.
export function makeSand({
  shore,
  seed = 20,
  groundSeed = 21,
  length = 64,       // along-shore extent; the fog owns everything past it
  inland = 0.8,      // how far the sand laps landward of the beach's top edge
  seaward = 2.5,     // how far past the waterline it runs on under the water
  along = 48,        // segments along the shore
  across = 8,        // segments across the band
  color = wash(0.15),  // paler than the earth (ground is wash(0.22))
} = {}) {
  const { dx = 0, dz = -1, dist = 8, width = 4 } = shore || {};
  const px = -dz, pz = dx;                       // unit along-shore vector

  const positions = new Float32Array((along + 1) * (across + 1) * 3);
  const indices = [];
  for (let i = 0; i <= along; i++) {
    const u = (i / along - 0.5) * length;        // along-shore coordinate
    // the grass line wanders; the wobble fades to nothing at the water so the
    // seaward edge stays put under the sheet
    const wob = (noise1(u * 0.22, seed) - 0.5) * 1.6;
    for (let j = 0; j <= across; j++) {
      const f = j / across;                      // 0 grass line .. 1 under water
      // lerp from the wobbled top edge to the fixed seaward edge
      const sAt = (-width - inland + wob) * (1 - f) + seaward * f;
      const x = px * u + dx * (dist + sAt);
      const z = pz * u + dz * (dist + sAt);
      const y = groundHeight(x, z, { seed: groundSeed, shore }) + 0.025;
      positions.set([x, y, z], (i * (across + 1) + j) * 3);
    }
  }
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < across; j++) {
      const a = i * (across + 1) + j;
      const b = a + 1;
      const c = a + (across + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  // NO POLYGON OFFSET HERE, unlike the path this band borrows its idiom from.
  // The +0.025 lift above is what keeps the sand off the terrain; the offset was
  // belt-and-braces on top, and on the beach it costs more than it buys.
  //
  // It was inert for the whole life of the shipped look — the workbench rebuilt
  // every material as a plain Lambert before it reached the screen and the clone
  // never copied polygonOffset — so nothing z-fought and nobody knew. Retiring
  // that rebuild turned it on, and this was the one surface where it showed:
  // the offset is `factor * the polygon's depth slope`, the path lies flat on
  // gentle terrain while this band is draped over the shore TAPER and read at a
  // grazing angle, so the same factor moved the beach's written depth far
  // further. Polygon offset moves depth WITHOUT moving geometry, the depth-edge
  // ink pass Sobels that buffer, and the seaward edge runs on under the water
  // against un-offset ground — so the buffer carried a step the scene did not
  // and the ink drew a dark line along the waterline, right where the sand
  // tapers into the water.
  const mat = washMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sand';
  return mesh;
}
