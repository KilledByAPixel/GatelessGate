import { makeFigure } from './figure.js';
import { INK } from '../palette.js';

// The monk: the book's default person, and the one nearly every case stages.
//
// Everything he is made of now lives in `figure.js` — the shared human
// vocabulary (lathed robe, sleeves with the hands hidden inside, sphere head,
// wide sedge hat), which is to people what makeQuadruped is to animals. This
// file is the naming layer over it: it keeps the vocabulary the 44 cases
// already speak, and maps it onto the figure's own.
//
// Poses: 'stand' (sleeves hang), 'point' (one sleeve raised toward +x, for
// indicating a thing across the scene), 'raise' (one sleeve held nearly
// vertical, offered to the air — see figure.js for why those two are not the
// same gesture), 'sit' (seated proportions, sleeves folded into the lap).
// `arms: false` drops the sleeves for a cheap crowd figure — a robe and a
// head, which is all a person in the background needs.
const POSES = {
  stand: { stance: 'stand', arms: 'rest' },
  sit: { stance: 'sit', arms: 'fold' },
  point: { stance: 'stand', arms: 'point' },
  raise: { stance: 'stand', arms: 'raise' },
};

export function makeMonk({
  height = 1.6, stout = 1, color = INK, hat = true, pose = 'stand', elder = false, arms = true,
  staffAng,   // optional plant-bearing override, passed through to the figure
} = {}) {
  const p = POSES[pose] || POSES.stand;
  const g = makeFigure({
    height, stout, color, hat, elder, staffAng,
    stance: p.stance,
    arms: arms ? p.arms : null,
  });
  g.name = 'monk';
  return g;
}

// Turn a monk so its pointing sleeve (local +x, raised by pose:'point') aims at
// a target {x,z} in the monk's parent space. rotation.y = atan2(-dz, dx) maps
// local +x → the world direction (cos, 0, -sin) onto the target bearing.
export function aimMonk(monk, target) {
  const dx = target.x - monk.position.x;
  const dz = target.z - monk.position.z;
  monk.rotation.y = Math.atan2(-dz, dx);
  return monk;
}
