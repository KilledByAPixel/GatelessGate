import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { noise2 } from '../util/noise.js';
import { WASH, INK_LIT } from '../palette.js';

// A hanging bamboo screen — a sudare — on a roller (case 26).
//
// The whole point of the thing is the OPENING it covers, so the model is the
// material, not the picture of it: a run of horizontal slats that winds onto
// the top rail. `setRoll(t)` poses it (t=0 fully down, t=1 fully up); roll() /
// unroll() / toggle() set a target that update() eases toward, so the screen
// never teleports between states.
//
// Geometry, top to bottom, when it is down:
//   2 rail radii of roller, (slats - 0.5) pitches of hanging material, and the
//   bottom rod's own radius resting on the sill. That is where the pitch below
//   comes from — solve it and the screen fills exactly [0, height].

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);

export function makeScreen({
  width = 3.2,
  height = 2.4,
  slats = 12,
  color = WASH.dark,
  cordColor = INK_LIT,
  cordDrop = 0,          // how far the pull cords hang below the rail; 0 = half the drop
  cordZ = 0,             // how far in front of the slats the cords hang; 0 = just clear
  seed = 26,
  speed = 2.2,           // e-folding rate of the roll, per second
  cords = true,
  hit = true,            // an invisible pane so a tap anywhere on the screen lands
} = {}) {
  const group = new THREE.Group();
  group.name = 'screen';

  // A slat is nearly a whole pitch thick on purpose. The gap left over (~8% of
  // the pitch) is narrower than the ink outline each rod carries, so the seams
  // read as brushed lines and the screen shuts the view out instead of leaking
  // daylight between every slat.
  const ROD_K = 0.46;
  const RAIL_K = 0.52;
  const n = Math.max(2, Math.round(slats));
  const pitch = height / (n - 0.5 + 2 * RAIL_K + ROD_K);
  const rodR = pitch * ROD_K;
  const railR = pitch * RAIL_K;
  const railY = height - railR;         // the roller's axis; its top grazes `height`
  const rollR = railR + rodR * 1.6;     // the bundle once the whole screen is up
  const layerT = (rollR - railR) / n;   // each slat sits one layer further out

  const mat = toonMaterial({ color, flat: true });

  // the roller. The screen winds onto this, so it doubles as the top rail.
  const railGeo = new THREE.CylinderGeometry(railR, railR, width * 1.06, 10);
  railGeo.rotateZ(Math.PI / 2);
  const rail = new THREE.Mesh(railGeo, mat);
  rail.name = 'rail';
  rail.position.y = railY;
  group.add(rail);

  // the slats. One shared geometry for the run, a slightly fatter one for the
  // hem — the bottom bar is the edge you actually see when the screen is down.
  const slatGeo = new THREE.CylinderGeometry(rodR, rodR, width, 8);
  slatGeo.rotateZ(Math.PI / 2);
  const hemGeo = new THREE.CylinderGeometry(rodR * 1.1, rodR * 1.1, width, 8);
  hemGeo.rotateZ(Math.PI / 2);

  const rods = [];
  for (let i = 0; i < n; i++) {
    const hem = i === n - 1;
    const rod = new THREE.Mesh(hem ? hemGeo : slatGeo, mat);
    rod.name = hem ? 'hem' : 'slat';
    group.add(rod);
    rods.push(rod);
  }

  // The pull cords, hanging clear in front of the material where a hand can
  // close on them — clear enough that a slat's ink outline does not swallow
  // them. They do not move with the roll: you pull them, they stay put.
  const cordMeshes = [];
  const cordFront = cordZ > 0 ? cordZ : rodR * 2.4;
  if (cords) {
    const len = cordDrop > 0 ? cordDrop : height * 0.5;
    const cordGeo = new THREE.CylinderGeometry(0.024, 0.024, len, 6);
    cordGeo.translate(0, -len / 2, 0);
    const cordMat = toonMaterial({ color: cordColor, flat: true });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cordGeo, cordMat);
      c.name = 'cord';
      c.position.set(sx * width * 0.46, railY, cordFront);
      c.userData.noOutline = true;      // a brushed line, not a rope
      group.add(c);
      cordMeshes.push(c);
    }
  }

  // A tap wants the screen, not a particular rod. This pane covers the whole
  // opening in both states, so the gesture stays forgiving on a phone; it is
  // invisible to the renderer but solid to a raycast.
  const picks = [rail, ...rods];
  if (hit) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.5, height),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    pane.name = 'screen-hit';
    pane.position.set(0, height / 2, 0.03);
    pane.userData.noOutline = true;
    group.add(pane);
    picks.unshift(pane);
  }

  let cur = 0;        // where the screen is right now
  let goal = 0;       // where it has been asked to be
  let clock = 0;      // last simTime, so the sway is a function of time not of frames

  // The hanging run breathes a little in the wind — more at the hem, nothing at
  // the roller. The slat index is sampled SLOWLY so neighbours move together:
  // a screen swings as one sheet, it does not shuffle slat by slat.
  // Deterministic: seeded noise over simTime.
  const sway = (i, depth) => (depth <= 0 ? 0 : (noise2(clock * 0.45, i * 0.22, seed) - 0.5) * 0.09 * depth);

  function place() {
    const taken = cur * n;                       // slats already on the roller
    const bundleR = railR + taken * layerT;
    const tangentY = railY - bundleR;            // where the material leaves the roll
    for (let i = 0; i < n; i++) {
      const w = clamp01(taken - i);              // 0 still hanging, 1 fully wound
      // hanging: the whole run slides up as material is taken onto the roll
      const hy = tangentY - (i + 0.5 - taken) * pitch;
      const hz = sway(i, Math.max(0, tangentY - hy) / height);
      if (w <= 0) { rods[i].position.set(0, hy, hz); continue; }
      // wound: one pitch of arc per slat, one layer further out than the last
      const rl = railR + (i + 0.5) * layerT;
      const a = ((taken - i) * pitch) / rl;
      const k = smooth(w);
      rods[i].position.set(
        0,
        hy + (railY - Math.cos(a) * rl - hy) * k,
        hz + (-Math.sin(a) * rl - hz) * k,
      );
    }
  }
  place();

  return {
    group,
    rail,
    slats: rods,
    cords: cordMeshes,
    // what a tap should be tested against — the pane, the rail and every slat
    pickTargets() { return picks; },

    // pose it outright: staging, and the only way to jump states without easing
    setRoll(t) { goal = clamp01(t); cur = goal; place(); return cur; },
    roll() { goal = 1; return goal; },
    unroll() { goal = 0; return goal; },
    toggle() { goal = goal > 0.5 ? 0 : 1; return goal > 0.5; },

    isUp() { return goal > 0.5; },              // what it has been asked to be
    rolled() { return cur; },                   // where it actually is
    settled() { return Math.abs(goal - cur) < 1e-4; },
    // how much material is still hanging across the opening
    coverHeight() { return Math.max(0, (n - cur * n) * pitch); },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      if (cur !== goal) {
        cur += (goal - cur) * (1 - Math.exp(-speed * Math.max(0, dt || 0)));
        if (Math.abs(goal - cur) < 5e-4) cur = goal;
      }
      place();
    },
  };
}
