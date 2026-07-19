// The kit facade: one import surface for koan modules (ctx.kit).
export { makeIsland } from './island.js';
export { makeGround, groundHeight } from './ground.js';
export { makeMountains } from './mountains.js';
export { makeForest } from './forest.js';
export { makeRocks, makeBushes, makeGrass, scatterPoints } from './scatter.js';
export { makeLantern } from './lantern.js';
export { makePath } from './path.js';
export { composeWorld } from './scenery.js';
export { makeMonk } from './monk.js';
export { makeTree } from './tree.js';
export { makeGate } from './gate.js';
export { makeFlag } from './flag.js';
export { makeBlobShadow } from '../render/blobshadow.js';
export { makeLights, toonMaterial } from '../render/toon.js';
export { addOutlines } from '../render/outlines.js';
