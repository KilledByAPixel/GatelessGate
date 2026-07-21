// What does each staged case actually cost to draw?
//
// Case 14 idled at 17 fps in the browser where earlier cases sat near 48, so
// this builds every registered case headlessly and counts what is in the scene.
// Outline shells are counted separately because addOutlines duplicates geometry:
// they are hidden by default in the debug preset, but they are still built, still
// in the graph, and still traversed every frame.
import { CASES } from '../src/koans/index.js';
import { isStaged, loadKoan } from '../src/koans/registry.js';

const ctx = {
  audio: null,
  input: { onTap() {}, onHover() {}, raycastFirst: () => null, clear() {} },
};

const rows = [];
for (const c of CASES) {
  if (!isStaged(c.slug)) continue;
  const mod = await loadKoan(c.slug);
  const built = mod.build(ctx);

  let meshes = 0, outlines = 0, tris = 0, outlineTris = 0, instances = 0;
  built.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const count = g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
    const n = (o.isInstancedMesh ? o.count : 1);
    if (o.isInstancedMesh) instances += o.count;
    if (o.userData.isOutline) { outlines++; outlineTris += count * n; }
    else { meshes++; tris += count * n; }
  });
  rows.push({ id: c.id, title: c.title.slice(0, 30), meshes, outlines, instances,
    ktris: tris / 1000, koutline: outlineTris / 1000 });
  built.dispose();
}

rows.sort((a, b) => b.ktris - a.ktris);
console.log('id  case                            meshes  outline   instances    ktris  +outline');
for (const r of rows) {
  console.log(
    String(r.id).padStart(2) + '  ' + r.title.padEnd(30) +
    String(r.meshes).padStart(6) + String(r.outlines).padStart(9) +
    String(r.instances).padStart(12) +
    r.ktris.toFixed(0).padStart(9) + r.koutline.toFixed(0).padStart(10));
}
