import * as THREE from '../../lib/three.module.js';
import { noise1, hash1 } from '../util/noise.js';
import { groundHeight } from './ground.js';
import { SNOW } from '../palette.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

// The wave-end's whole life as a closed form over simTime — sweep in fast,
// ease out at full reach, then fade while receding a little, the way the last
// of a wave soaks into sand. No state, no integration: the same t is always
// the same foam.
//
// The shape in fractions of one cycle: the sweep runs 0 → 0.6 (easing out),
// then recedes about a third of the way back over the rest. Opacity leads:
// up fast over the first fifth, holding, then a long fade from 0.55 — the
// bright edge is the arriving water, the fade is the sand drinking it.
export function foamCycle(t, { period = 6, phase = 0, run = 1.8 } = {}) {
  const f = (((t / period + phase) % 1) + 1) % 1;
  const sweep = f < 0.6
    ? smooth(f / 0.6)
    : 1 - 0.33 * smooth((f - 0.6) / 0.4);
  const opacity = f < 0.2
    ? smooth(f / 0.2)
    : f < 0.55 ? 1
      : 1 - smooth((f - 0.55) / 0.45);
  return { advance: run * sweep, opacity: clamp01(opacity) };
}
