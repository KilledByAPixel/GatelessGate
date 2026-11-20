import * as THREE from '../../lib/three.module.js';

// HOW WELL AN INVISIBLE TAP VOLUME SITS ON THE THING IT STANDS FOR. A proxy
// placed by copied coordinates or sized by hand is fitted to the model as it
// was on the day it was typed; reshape the model and the touch that earns the
// page its mark lands where the model used to be, with nothing failing. The
// staging net cannot check this generically — it cannot tell which object a
// volume stands for — so each case that owns one names the pair and asks here.
//
// Measured in world space, off the vertices that DRAW (invisible meshes,
// including the proxy itself, are skipped), so a later re-shaping of the model
// is what gets measured, not its group origin.
const V = new THREE.Vector3();

export function drawnBox(objects, skip = []) {
  const skipped = new Set(skip);
  const box = new THREE.Box3();
  for (const root of [].concat(objects)) {
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (!o.isMesh || skipped.has(o) || !o.material || o.material.visible === false) return;
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) box.expandByPoint(V.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    });
  }
  return box;
}

// { uncovered, offCentre }: the worst share, over the three axes, of the
// model's extent that sticks out past the proxy's world box; and the worst
// distance between the two boxes' centres as a share of the model's extent on
// that axis — a padded volume is generous on purpose, but it is generous
// AROUND the model, not beside it.
export function tapFit(proxy, objects) {
  proxy.updateWorldMatrix(true, false);
  const P = new THREE.Box3().setFromObject(proxy, true);
  const O = drawnBox(objects, [proxy]);
  const pc = P.getCenter(new THREE.Vector3()), oc = O.getCenter(new THREE.Vector3());
  let uncovered = 0, offCentre = 0;
  for (const a of ['x', 'y', 'z']) {
    const ext = O.max[a] - O.min[a];
    if (!(ext > 1e-6)) continue;
    uncovered = Math.max(uncovered,
      (Math.max(0, P.min[a] - O.min[a]) + Math.max(0, O.max[a] - P.max[a])) / ext);
    offCentre = Math.max(offCentre, Math.abs(pc[a] - oc[a]) / ext);
  }
  return { uncovered, offCentre, proxyBox: P, modelBox: O };
}
