// A fake AudioContext with enough surface for ensureCtx() to build the WHOLE
// real graph (master, musicGain, the reverb, and the hush pair) and for
// makeSpatialBus() to build a placed one-shot's bus on top of it. Every
// connect() is recorded as a [from, to] edge so a test can ask a real
// structural question — "does this node's output reach that node?" — instead
// of trusting a comment.
//
// Shared between audio.test.js (the hush-pair/hide structural tests) and
// spatial.test.js (the `at` finiteness guard) so there is one fake graph to
// keep in sync with the real one, not two drifting copies.
export function graphAudioContext() {
  const edges = [];
  const gains = [];
  const gainParam = () => ({
    value: 1,
    setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {},
    setTargetAtTime() {}, cancelScheduledValues() {},
  });
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    state: 'running',
    destination: { connect() {} },
    resume() {},
    createGain() {
      const n = { gain: gainParam(), connect(dst) { edges.push([n, dst]); }, disconnect() {} };
      gains.push(n);
      return n;
    },
    createOscillator() {
      const n = { type: 'sine', frequency: gainParam(), connect(dst) { edges.push([n, dst]); }, start() {}, stop() {} };
      return n;
    },
    createBufferSource() {
      const n = { buffer: null, loop: false, connect(dst) { edges.push([n, dst]); }, start() {}, stop() {} };
      return n;
    },
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length), copyToChannel() {} };
    },
    createBiquadFilter() {
      const n = {
        type: 'lowpass', frequency: gainParam(), Q: { value: 0 },
        connect(dst) { edges.push([n, dst]); },
      };
      return n;
    },
    createStereoPanner() {
      const n = { pan: { value: 0 }, connect(dst) { edges.push([n, dst]); } };
      return n;
    },
    createConvolver() {
      const n = { buffer: null, connect(dst) { edges.push([n, dst]); } };
      return n;
    },
    _edges: edges,
    _gains: gains,
  };
  return ctx;
}
