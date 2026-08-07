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
