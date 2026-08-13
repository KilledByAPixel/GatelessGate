import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { WASH } from '../palette.js';

// A signboard on a post. Deliberately the plainest object in the kit: a
// rectangular board on a rectangular post, nothing written on it, nothing
// hanging off it (Frank: "no writing or special object, just like a rectangular
// sign with a rectangular post").
//
// THE WHOLE SILHOUETTE IS TWO RECTANGLES — an upright bar with a wider slab
// near the top. That reading is what makes it a sign rather than a marker or a
// stump, so the board must stay clearly wider than the post and must sit up
// near the post's head; a board hung low, or barely wider than what carries it,
// reads as a fence rail. There is nothing else to look at here and nothing else
// should be added: at the distance a case actually stands this thing at, a cap,
// a chamfer or a pair of braces are all invisible, and the detail floor says
// invisible detail does not exist.
//
// NOT TAPERED AND NOT LEANING. The kit's other upright — makePole — tapers, and
// scenery's waymarkers lean, because those are worn things standing alone in
// open country. This is a made board outside a building, and it was asked for
// square; a seeded lean was tried and cut, because it read as neglect in a yard
// that is being kept.
//
// ONE MESH, ONE DRAW. Post and board are merged (mergeSimple, the same move the
// gate's nemaki and the tree's knots make) rather than parented as two meshes:
// they share a tone, so a second mesh would buy nothing but a second draw call
// for a join the silhouette already carries.
//
// The origin is the post's FOOT, on y = 0, so a case places it by where it
// stands. The board faces local +z.
export function makeSign({
  height = 1.9,        // the post's own height — the board rides just under its head
  width = 0.78,        // the board, across
  boardH = 0.54,       // and down
  thickness = 0.07,    // the board's own depth
  postW = 0.13,        // the post, across
  postD = 0.11,        // and front to back: a plank on edge, not a square dowel
  color = WASH.dark,
} = {}) {
  const g = new THREE.Group();
  g.name = 'sign';
  g.userData.sign = { height, width, boardH };

  const post = new THREE.BoxGeometry(postW, height, postD);
  post.translate(0, height / 2, 0);

  // The board's head sits a little below the post's, so a stub of post shows
  // above it — that gap is what stops the pair reading as one T-shaped lump.
  const HEAD = 0.11;
  const boardY = height - HEAD - boardH / 2;
  const board = new THREE.BoxGeometry(width, boardH, thickness);
  // Buried 0.03 into the post's front face rather than butted against it: flush
  // faces z-fight and a gap reads as floating (the kit's standing join rule).
  board.translate(0, boardY, postD / 2 + thickness / 2 - 0.03);

  const mesh = new THREE.Mesh(mergeSimple([post, board]), washMaterial({ color, flat: true }));
  mesh.name = 'board';
  g.add(mesh);

  return g;
}
