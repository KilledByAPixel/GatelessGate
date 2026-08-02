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
// same gesture), 'sit' (seated proportions, elbowed arms folded, hands
// together in the lap), 'fold' (standing, the same folded arms held at the
// belly — a monk waiting, hands in his sleeves).
// `arms: false` drops the sleeves for a cheap crowd figure — a robe and a
// head, which is all a person in the background needs.
const POSES = {
  stand: { stance: 'stand', arms: 'rest' },
  sit: { stance: 'sit', arms: 'fold' },
  point: { stance: 'stand', arms: 'point' },
  raise: { stance: 'stand', arms: 'raise' },
  fold: { stance: 'stand', arms: 'fold' },
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

// Two different verbs, two different axes — mixing them up is the book's
// oldest staging bug (the k42 girl sat a quarter turn away from the Buddha
// she was supposed to be absorbed in, and a dozen cases hand-compensated).
//
// aimMonk = aim the POINTING ARM. The 'point' pose extends its sleeve along
// local +x, so this turns local +x onto a target {x,z} in the monk's parent
// space: rotation.y = atan2(-dz, dx) maps local +x → the world direction
// (cos y, 0, -sin y). Correct ONLY when the raised/pointing sleeve is the
// thing being laid on the target; it leaves the BODY facing 90° away.
export function aimMonk(monk, target) {
  const dx = target.x - monk.position.x;
  const dz = target.z - monk.position.z;
  monk.rotation.y = Math.atan2(-dz, dx);
  return monk;
}

// faceMonk = face the BODY. The figure kit's bodies front local +z — the
// seated fold, the folded hands, the collar step all live on +z (proved
// empirically in walk.js's walkHeading, the same convention). rotation.y =
// atan2(dx, dz) maps local +z → the world direction (sin y, 0, cos y), so
// the figure looks AT the target. This is what every non-pointing figure
// wants; use aimMonk only for a 'point'/'raise' sleeve laid on its object.
export function faceMonk(monk, target) {
  const dx = target.x - monk.position.x;
  const dz = target.z - monk.position.z;
  monk.rotation.y = Math.atan2(dx, dz);
  return monk;
}
