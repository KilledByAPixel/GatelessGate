import * as THREE from '../../lib/three.module.js';

// The stage-side half of a koan's ctx, for tests: tap/hover registries and a
// raycast that misses by default. ~25 test files each declared their own
// before this one. `audio` defaults to null (build() must survive silence);
// pass a stub to capture calls. Extra fields (accent, ...) ride through.
export function fakeCtx({ audio = null, ...extra } = {}) {
  const taps = [], hovers = [];
  // `_touched` counts the case reporting that its touch landed — main.js hands
  // the real one to save.markTouched, which is what puts the red mark on the
  // row in the Contents. Counted rather than flagged so a test can also assert
  // that a touch the case REFUSED (a throttle, a gesture already running)
  // reported nothing.
  const state = { touched: 0 };
  return {
    audio,
    input: {
      onTap: (cb) => taps.push(cb),
      onHover: (cb) => hovers.push(cb),
      raycastFirst: () => null,
      pointer: () => ({ x: 0, y: 0 }),
    },
    touched: () => { state.touched += 1; },
    get _touched() { return state.touched; },
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

// HITS THE Nth PROBE OF A TAP AND NOTHING ELSE. hitAll can only ever reach a
// case's FIRST probe, because every handler returns on its first hit — which is
// fine for "does anything answer at all" and useless for a page whose find is
// not the thing it probes first. And that is most of them on purpose: a hung
// chime is probed ahead of the case's own subject precisely so a tap aimed at
// the chime is never swallowed by a bigger hit box behind it.
//
// So this counts raycastFirst calls within one tap and hits only on the k-th,
// letting a sweep ask "is there ANY probe that earns the mark" without knowing
// which one it should be. Build a fresh one per tap — the counter is the state.
export const hitNth = (k, point = [0, 0, 0]) => {
  let i = 0;
  return (cam, objs) => ((i++ === k && objs && objs.length)
    ? { object: objs[0], point: new THREE.Vector3(...point), distance: 1 } : null);
};
