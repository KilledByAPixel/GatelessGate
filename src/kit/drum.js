import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { WASH, wash } from '../palette.js';
import { mergeSimple } from './scatter.js';
import { clamp } from '../util/math.js';

// The dinner drum (case 13) — a barrel drum SITTING on a low saddle stand, the
// companion piece to the bonshō. Tokusan's whole mistake is that this has not
// been beaten yet.
//
// It used to hang: two posts rising past the barrel to a beam overhead, with
// the drum slung under it by a pair of cords. Frank: "it should be sitting on
// kind of a saddle, on a seat — instead of hanging from the middle of it. The
// drum itself should be above the thing it's settled on, and the thing it's on
// should be a lot shorter — the bottom of where the drum currently is." So the
// barrel stays exactly where it was and everything ABOVE it is gone: two short
// hewn legs carry saddle caps that meet the belly, the belly bulges between
// them, and nothing in the piece is taller than the drum any more.
//
// The drum's axis runs along local ±X, so the near skin faces local +X: aim
// that at the camera. Origin on the ground under the frame.
//
// strike() is a closed form like the bell's: a fast decaying pulse that bulges
// the skin and rocks the barrel in its slings, superposed so repeated hits
// stack without a snap.

const PERIOD = 0.42;     // the barrel's rock — light, quick, over in a moment
const OMEGA = (2 * Math.PI) / PERIOD;
const TAU = 0.30;
const A0 = 0.055;        // radians of rock at a full strike
const SKIN0 = 0.18;      // skin bulge, as a fraction of its own depth
const SKIN_TAU = 0.11;   // the head stops moving well before the frame does
const MAX = 0.13;

export function makeDrum({ radius = 0.52, color = WASH.dark, skinColor = wash(0.20), seed = 13 } = {}) {
  const R = radius;
  const g = new THREE.Group();
  g.name = 'drum';

  const timber = washMaterial({ color });
  const flat = washMaterial({ color, flat: true });
  const stone = washMaterial({ color: WASH.stone, flat: true });

  // Where the barrel's middle sits. Unchanged from the slung version — the
  // stand came DOWN to meet it, the drum did not come down to the stand.
  const BARREL_Y = 2.26 * R;
  const DEPTH = 1.34 * R;

  // The barrel is lathed, so its radius varies along its own axis; the legs
  // stand in from the ends and must meet the belly THERE, not at its widest.
  // Read off the profile rather than copied from it, so retuning the barrel's
  // bulge can never leave the drum floating over its own stand.
  const barrelR = (x) => R * (0.80 + 0.20 * Math.sin(Math.PI * ((x + DEPTH / 2) / DEPTH)));
  const LEG_X = 0.45 * R;
  const SEAT_Y = BARREL_Y - barrelR(LEG_X);

  const padH = 0.14 * R;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * R, 1.42 * R, padH, 9), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  // Two short hewn legs UNDER the barrel — four-sided so they read as sawn
  // timber rather than dowel, and SPLAYED: each meets the belly at LEG_X and
  // plants its foot a third of a radius further out. Straight legs under a
  // barrel this wide read as a perch; a splayed pair reads as a stand built to
  // take a beating, which is what this drum is for. They stop at the saddle
  // caps — nothing here rises past the drum.
  const capH = 0.09 * R;
  const legH = SEAT_Y - capH;
  const SPLAY = 0.35 * R;                       // how far the foot steps out
  const legTilt = Math.atan2(SPLAY, legH);
  const legLen = Math.hypot(legH, SPLAY);
  for (const sx of [-1, 1]) {
    const legGeo = new THREE.CylinderGeometry(0.17 * R, 0.25 * R, legLen, 4);
    legGeo.rotateY(Math.PI / 4);          // faces square to the axes
    const post = new THREE.Mesh(legGeo, timber);
    post.name = 'post';
    post.position.set(sx * (LEG_X + SPLAY / 2), legH / 2, 0);
    post.rotation.z = sx * legTilt;       // top inward, foot outward
    g.add(post);
  }

  // THE SADDLE, and the footrail tying the legs together at the ankle — the
  // caps are what the belly actually rests in, and the rail is what stops the
  // pair reading as two sticks the drum happens to balance on. Merged, so the
  // whole joinery costs one draw, not several.
  const capW = 0.40 * R;
  const trimParts = [
    // spans the legs where they actually are at ankle height, splay included
    new THREE.BoxGeometry(2 * (LEG_X + SPLAY * (1 - 0.26 * R / legH)) + 0.1 * R, 0.10 * R, 0.17 * R)
      .translate(0, 0.26 * R, 0),
  ];
  for (const sx of [-1, 1]) {
    trimParts.push(new THREE.BoxGeometry(capW, capH, capW)
      .translate(sx * LEG_X, SEAT_Y - capH / 2, 0));
  }
  const trim = new THREE.Mesh(mergeSimple(trimParts), flat);
  trim.name = 'stand-trim';
  g.add(trim);

  // The barrel rocks in its cradle, so the pivot is the CONTACT — the saddle
  // line it sits on — not a beam overhead it no longer hangs from.
  const rock = new THREE.Group();
  rock.name = 'rock';
  rock.position.y = SEAT_Y;
  g.add(rock);

  const barrel = new THREE.Group();
  barrel.name = 'barrel';
  barrel.position.y = BARREL_Y - SEAT_Y;
  rock.add(barrel);

  // The body: a lathed barrel — widest at the middle, the way a taiko is
  // hollowed — laid on its side so the heads face ±x.
  const prof = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = R * (0.80 + 0.20 * Math.sin(Math.PI * t));
    prof.push(new THREE.Vector2(r, t * DEPTH - DEPTH / 2));
  }
  prof.unshift(new THREE.Vector2(0, -DEPTH / 2));
  prof.push(new THREE.Vector2(0, DEPTH / 2));
  const bodyGeo = new THREE.LatheGeometry(prof, 12);
  bodyGeo.rotateZ(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, washMaterial({ color, flat: true }));
  body.name = 'body';
  barrel.add(body);

  // the two heads — pale hide, the only light thing on it
  const heads = [];
  for (const sx of [-1, 1]) {
    const headGeo = new THREE.CylinderGeometry(0.805 * R, 0.805 * R, 0.06 * R, 12);
    headGeo.rotateZ(Math.PI / 2);
    const head = new THREE.Mesh(headGeo, washMaterial({ color: skinColor, flat: true }));
    head.name = 'head';
    head.position.x = sx * (DEPTH / 2 + 0.01 * R);
    barrel.add(head);
    heads.push(head);
  }

  // BODY HOOPS — the dark rings that bind each skin to the barrel, the taiko's
  // own rim work. The first pass had the pale skin meeting the ink body with
  // no seam at all, which read as a painted circle rather than a stretched
  // hide bound down. Two toruses, merged into one mesh (one draw for both,
  // the same merge trick the kit's other paired pieces use).
  const hoopGeo = [];
  for (const sx of [-1, 1]) {
    const t = new THREE.TorusGeometry(0.805 * R, 0.052 * R, 6, 14);
    t.rotateY(Math.PI / 2);
    t.translate(sx * (DEPTH / 2 + 0.01 * R), 0, 0);
    hoopGeo.push(t);
  }
  const hoops = new THREE.Mesh(mergeSimple(hoopGeo), washMaterial({ color, flat: true }));
  hoops.name = 'hoop';
  barrel.add(hoops);

  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.05, R * 1.05, DEPTH * 1.5, 10),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.geometry.rotateZ(Math.PI / 2);
  hit.name = 'drum-hit';
  hit.position.y = BARREL_Y;
  g.add(hit);

  let clock = 0;
  const struck = [];

  function pose() {
    let a = 0, s = 0;
    for (const t0 of struck) {
      const t = clock - t0;
      if (t < 0) continue;
      a += A0 * Math.exp(-t / TAU) * Math.sin(OMEGA * t);
      s += SKIN0 * Math.exp(-t / SKIN_TAU) * Math.sin(OMEGA * 2.4 * t);
    }
    rock.rotation.z = clamp(a, -MAX, MAX);
    // the near head takes the blow; the far one answers a beat behind it
    const bulge = clamp(s, -0.5, 0.5);
    heads[1].scale.x = 1 + bulge;
    heads[0].scale.x = 1 - bulge * 0.45;
  }

  return {
    group: g,
    pickTargets() { return [hit, body]; },

    strike() {
      struck.push(clock);
      if (struck.length > 6) struck.shift();
      pose();
    },
    // energy still in the head, 0 at rest
    ringing() {
      let e = 0;
      for (const t0 of struck) if (clock >= t0) e += SKIN0 * Math.exp(-(clock - t0) / SKIN_TAU);
      return e;
    },
    angle() { return rock.rotation.z; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (struck.length && clock - struck[0] > 8 * TAU) struck.shift();
      pose();
    },
  };
}
