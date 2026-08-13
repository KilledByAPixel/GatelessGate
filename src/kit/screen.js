import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { noise2 } from '../util/noise.js';
import { WASH, INK_LIT } from '../palette.js';
import { clamp01 } from '../util/math.js';

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

const smooth = (t) => t * t * (3 - 2 * t);

// THE CLATTER. A sudare is slats winding onto a rail, so the sound is one
// quiet bamboo knock per slat that crosses onto (or off) the roller —
// update()'s ease has its biggest step the instant a pull starts and shrinks
// toward zero as `cur` nears `goal` (see below), so slat-boundary crossings
// come fast through the early roll and thin out through the settle for free:
// the click RATE follows the roll's own speed without a separate curve to
// author or keep in step with `speed`. `onClack(force, worldPos)` reports it
// the same way makeFurin (kit/furin.js) reports a tube strike via onStrike —
// behaviour lives in the component, not in the case that hangs it.
//
// force is fixed and, on purpose, on the QUIET side of the book's knocks:
// eleven of these across a full roll (the book's one screen, case 26, is built
// with slats: 11 — see k26.js) are a texture the ear should register as "the
// screen is moving," not eleven individual events like k13's dinner drum. The
// first cut undershot that goal into silence — it sat UNDER k28's 0.22, the
// quietest of the book's other 20 audio.knock() call sites (a typical knock
// runs ~0.9), and it was inaudible: the clatter fired correctly and nobody
// could hear it. Erring quiet the first time erred past audible. Raised well
// clear of 0.22 (see CLATTER's own comment for the exact starting number) —
// still a texture, not a drum roll, but one that is actually there.
//
// Exported as a mutable object, not a bare const, so
// dev/hanging-audition.html can write straight into it (SPATIAL's own
// pattern, src/audio/spatial.js) and hear the very next roll change, no
// reload; onClack reads CLATTER.force fresh on every clack rather than
// capturing it once, so a slider reaches a roll already in progress.
export const CLATTER = {
  // STARTING POINT, not a final value — settled by ear through the harness. It
  // sits comfortably above the book's quietest knock while staying well under a
  // typical one: audible as a quiet run, not an event-sized bang.
  force: 0.35,
};
// guards a stalled or otherwise huge dt from firing a whole roll's worth of
// knocks in a single call — the app itself never hands update() one:
// main.js clamps dt and steps it at a fixed 1/60 regardless of how fast a
// toggle fires, so this cap answers a caller other than the app, not "a
// fast toggle" (which never enlarges dt in the first place).
const MAX_CLACKS_PER_UPDATE = 2;

// world-position scratch, shared the way furin.js's WORLD is: onClack calls
// straight into audio.knock(), which reads x/y/z synchronously before
// returning, so one vector serves every screen instance without allocating.
const CLACK_POS = new THREE.Vector3();

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
  // A FIXED SCREEN INSTEAD OF A HANGING ONE. A sudare is a blind: a roller with
  // material winding onto it and two pull cords. That needs a lintel to hang
  // from, and case 25's dream hall has no wall behind the deck — so it read as
  // slats and cords floating in the air with nothing holding them up. Fixed
  // swaps the roller for a plain head rail and adds two stiles down the ends,
  // so the same slats are visibly HELD by something. It does not roll:
  // roll/unroll/toggle become no-ops and there is no clatter, because nothing
  // moves.
  fixed = false,
  // Fixed screens get end stiles by default, because slats alone read as rods
  // floating in a row. A screen filling a post-and-beam bay does NOT want them:
  // the posts are already the frame, and a stile inside each one is a doubled
  // line. Case 25 sets this false for exactly that reason.
  stiles: wantStiles = true,
  onClack = null,        // the roll's own clatter — see THE CLATTER, above
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

  const mat = washMaterial({ color, flat: true });

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

  // THE STILES, on a fixed screen: one down each end, running the full height
  // and standing a little proud of the slats so they read as the frame the
  // slats are set into rather than two more rods. This is the whole difference
  // between a screen that is part of the room and a screen that is hovering
  // in it.
  const stiles = [];
  if (fixed && wantStiles) {
    const stileGeo = new THREE.CylinderGeometry(rodR * 1.25, rodR * 1.25, height, 7);
    for (const sx of [-1, 1]) {
      const stile = new THREE.Mesh(stileGeo, mat);
      stile.name = 'stile';
      stile.position.set(sx * width * 0.5, height / 2, rodR * 0.5);
      group.add(stile);
      stiles.push(stile);
    }
  }
  // The sill lands the bottom whether or not the ends are framed: without it a
  // fixed screen's lowest slat floats a pitch above whatever it stands on.
  if (fixed) {
    const sillGeo = new THREE.CylinderGeometry(rodR * 1.15, rodR * 1.15, width * 1.06, 8);
    sillGeo.rotateZ(Math.PI / 2);
    const sill = new THREE.Mesh(sillGeo, mat);
    sill.name = 'sill';
    sill.position.y = rodR * 1.15;
    group.add(sill);
    stiles.push(sill);
  }

  // The pull cords, hanging clear in front of the material where a hand can
  // close on them — clear enough that a slat's ink outline does not swallow
  // them. They do not move with the roll: you pull them, they stay put.
  const cordMeshes = [];
  const cordFront = cordZ > 0 ? cordZ : rodR * 2.4;
  if (cords && !fixed) {
    const len = cordDrop > 0 ? cordDrop : height * 0.5;
    const cordGeo = new THREE.CylinderGeometry(0.024, 0.024, len, 6);
    cordGeo.translate(0, -len / 2, 0);
    const cordMat = washMaterial({ color: cordColor, flat: true });
    for (const sx of [-1, 1]) {
      const c = new THREE.Mesh(cordGeo, cordMat);
      c.name = 'cord';
      c.position.set(sx * width * 0.46, railY, cordFront);
      group.add(c);
      cordMeshes.push(c);
    }
  }

  // A tap wants the screen, not a particular rod. This pane covers the whole
  // opening in both states, so the gesture stays forgiving on a phone; it is
  // invisible to the renderer but solid to a raycast.
  const picks = [rail, ...rods, ...stiles];
  if (hit) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.5, height),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    pane.name = 'screen-hit';
    pane.position.set(0, height / 2, 0.03);
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
    // A fixed screen stays where it is. These keep their signatures so a caller
    // never has to ask which kind it was handed, and answer honestly: it is
    // down, and it is staying down.
    setRoll(t) { if (fixed) return 0; goal = clamp01(t); cur = goal; place(); return cur; },
    roll() { if (fixed) return 0; goal = 1; return goal; },
    unroll() { goal = 0; return goal; },
    toggle() { if (fixed) return false; goal = goal > 0.5 ? 0 : 1; return goal > 0.5; },
    fixed,

    isUp() { return goal > 0.5; },              // what it has been asked to be
    rolled() { return cur; },                   // where it actually is
    settled() { return Math.abs(goal - cur) < 1e-4; },
    // how much material is still hanging across the opening
    coverHeight() { return Math.max(0, (n - cur * n) * pitch); },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      const prevCur = cur;
      if (cur !== goal) {
        cur += (goal - cur) * (1 - Math.exp(-speed * Math.max(0, dt || 0)));
        if (Math.abs(goal - cur) < 5e-4) cur = goal;
      }
      place();

      // One clack per slat boundary `cur*n` crosses this step (n = slats on
      // the roller at cur=1). Comparing floors telescopes exactly to `n`
      // clacks over a full 0->1 or 1->0 roll, whatever the frame timing,
      // since cur only ever moves toward goal (see the "never runs
      // backwards" property update() already keeps) — no separate counter to
      // drift out of sync if a roll is interrupted and re-started. setRoll()
      // moves `cur` outright, not through this path, so a staging pose is
      // silent, as it should be: it poses the screen, it doesn't roll it.
      if (onClack && cur !== prevCur) {
        const before = Math.floor(prevCur * n + 1e-9);
        const after = Math.floor(cur * n + 1e-9);
        const crossed = Math.min(Math.abs(after - before), MAX_CLACKS_PER_UPDATE);
        if (crossed > 0) {
          // the rail doesn't move within this loop, so its world position is
          // the same for every clack this call reports — read it once
          rail.getWorldPosition(CLACK_POS);
          // read live, not captured — see CLATTER's own comment
          for (let k = 0; k < crossed; k++) onClack(CLATTER.force, CLACK_POS);
        }
      }
    },
  };
}
