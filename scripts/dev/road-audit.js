// Where does every road actually go? Static parse of each case's makePath
// from/to literals, checked against the same seeded mountain footprints
// composeWorld gives that scene. Three flags:
//   INTO MOUNTAIN    — the far endpoint lies inside a footprint
//   AIMED AT MOUNTAIN — the road's line, extended, runs into a footprint core
//   ENDS IN THE OPEN — the far end stops nearer than r=24, where the fog
//                      (density 0.028-0.030) hasn't begun to swallow it
// Cases with computed from/to print MANUAL CHECK. Run: node scripts/dev/road-audit.js
import { readFileSync, readdirSync } from 'node:fs';
import { mountainFootprints } from '../../src/kit/mountains.js';

const BANDS = [
  { count: 8, distance: 52, arcSpan: 3.6 },
  { count: 5, distance: 33, arcSpan: 2.4, hScale: 0.65 },
];

const files = readdirSync('src/koans').filter((f) => /^k\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

for (const file of files) {
  const src = readFileSync(`src/koans/${file}`, 'utf8');
  const paths = [...src.matchAll(/makePath\(\{([^}]*)\}/g)];
  if (!paths.length) continue;

  // the seed composeWorld actually uses: its own literal, else the case id
  const seedM = src.match(/composeWorld\(scene, \{[\s\S]*?seed: (\w+)/);
  const idM = src.match(/const ID = (\d+)/);
  let seed = null;
  if (seedM && /^\d+$/.test(seedM[1])) seed = Number(seedM[1]);
  else if (seedM && seedM[1] === 'ID' && idM) seed = Number(idM[1]);
  else if (idM) seed = Number(idM[1]);
  if (seed === null) { console.log(`${file}: MANUAL CHECK (no seed found)`); continue; }

  // a case that overrides `mountains:` needs its own eyes
  const custom = /mountains:\s*\[/.test(src) ? ' [custom mountains — verify by eye]' : '';
  const feet = BANDS.flatMap((b, i) => mountainFootprints({ seed: seed * 31 + i * 7, ...b }));

  for (const p of paths) {
    const from = p[1].match(/from:\s*\[([-\d.]+),\s*([-\d.]+)\]/);
    const to = p[1].match(/to:\s*\[([-\d.]+),\s*([-\d.]+)\]/);
    if (!from || !to) { console.log(`${file}: MANUAL CHECK (computed from/to)${custom}`); continue; }
    const fx = Number(from[1]), fz = Number(from[2]);
    const tx = Number(to[1]), tz = Number(to[2]);
    const flags = new Set();
    for (const f of feet) if (Math.hypot(tx - f.x, tz - f.z) < f.r) flags.add('INTO MOUNTAIN');
    const dx = tx - fx, dz = tz - fz, len2 = dx * dx + dz * dz;
    for (const f of feet) {
      const t = ((f.x - fx) * dx + (f.z - fz) * dz) / len2;
      if (t > 1) {
        const px = fx + dx * t, pz = fz + dz * t;
        if (Math.hypot(px - f.x, pz - f.z) < f.r * 0.7) flags.add('AIMED AT MOUNTAIN');
      }
    }
    if (Math.hypot(tx, tz) < 24) flags.add('ENDS IN THE OPEN');
    console.log(`${file}: to [${tx}, ${tz}]  ${flags.size ? [...flags].join(' + ') : 'OK'}${custom}`);
  }
}
