// The tappable meshes under a root: every real mesh, skipping the inverted-
// hull outline shells. Eleven case files hand-rolled this exact traverse
// before it was gathered here; kit components with their own pick logic
// (makeFurin.pick, makeCat.meshes, ...) keep it — this is for raw groups.
export function tapMeshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) out.push(o); });
  return out;
}
