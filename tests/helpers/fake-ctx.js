import * as THREE from '../../lib/three.module.js';

// The stage-side half of a koan's ctx, for tests: tap/hover registries and a
// raycast that misses by default. ~25 test files each declared their own
// before this one. `audio` defaults to null (build() must survive silence);
// pass a stub to capture calls. Extra fields (accent, ...) ride through.
export function fakeCtx({ audio = null, ...extra } = {}) {
  const taps = [], hovers = [];
  return {
    audio,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    _taps: taps, _hovers: hovers,
    ...extra,
  };
}

// The three raycast stubs the suite actually uses, gathered from ~118
// hand-rolled copies across 42 files (five shapes, four parameter-naming
// dialects, hit payloads that varied for no reason). Install one on a ctx:
//   ctx.input.raycastFirst = hitOnly(meshes);
// The hit carries { object, point, distance } — the superset every case
// reads — with `point` a fresh Vector3 so a handler that clones or mutates
// it cannot leak state between taps.

// hits the first offered target that is in `targets` (an array or a single
// object); every other query misses — the shape for "tap THIS thing"
export const hitOnly = (targets, point = [0, 0, 0]) => {
  const list = Array.isArray(targets) ? targets : [targets];
  return (cam, objs) => {
    const hit = objs && objs.find && objs.find((o) => list.includes(o));
    return hit ? { object: hit, point: new THREE.Vector3(...point), distance: 1 } : null;
  };
};

// hits whatever it is offered first — the staging net's crude-on-purpose
// shape: it exercises probe ORDER and fall-through, which a narrow stub
// never can (see chime-staging.test.js's own argument)
export const hitAll = (point = [0, 0, 0]) => (cam, objs) => (objs && objs.length
  ? { object: objs[0], point: new THREE.Vector3(...point), distance: 1 } : null);

// misses everything — fake-ctx's default, named so a test that switches a
// ctx back to missing says so legibly
export const missAll = () => null;
