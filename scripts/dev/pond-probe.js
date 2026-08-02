// Case 39's pond, measured: where each stepping stone stands relative to the
// shore, and how deep the carved basin is under it. The basin is cut from the
// water's OWN outline (water.shoreDistance), so this is how you check a stone
// still has water under it after moving one.
//
//   node scripts/dev/pond-probe.js
import { makeWater } from '../../src/kit/water.js';

const ID = 39, STONES = 7;
const C = { x: 0.4, z: -1.6 };
const water = makeWater({ shape: 'blob', size: 12.5, color: '#888888', seed: ID, strike: 0.085 });

const SS = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const BASIN = 1.25, BANK = 1.4;
const floorAt = (d) => -BASIN * SS(0, BANK, d);

console.log('stone  world            shore   basin floor   water below stone');
for (let i = 0; i < STONES; i++) {
  const t = i / (STONES - 1);
  const x = 3.6 - t * 6.6;
  const z = 1.9 - t * 5.2 + Math.sin(t * Math.PI) * 0.9;
  const d = water.shoreDistance(x - C.x, z - C.z);
  console.log(
    `  ${i}    (${x.toFixed(2)}, ${z.toFixed(2)})`.padEnd(24),
    d.toFixed(2).padStart(6),
    floorAt(d).toFixed(2).padStart(12),
    (0 - floorAt(d)).toFixed(2).padStart(18),
  );
}
console.log('\nmiddle of the pond, floor at', floorAt(9).toFixed(2));
