import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { hash1 } from '../util/noise.js';
import { ACCENT, WASH } from '../palette.js';
import { clamp } from '../util/math.js';

// A temple bell (bonshō) hung from its own two-post frame, the way they stand
// in temple yards: a stone pad, two posts carrying a beam, a small roof over
// the beam, and the bell on a short link under it (case 16's seal).
//
// The bell is the accent, so its material glows on its own — see SEAL_GLOW in
// render/material.js — and nothing here adds an emissive of its own.
//
// strike() sets it swinging: a pendulum rotation about the hanging point that
// dies back over about four seconds. A bonshō is massive, so the swing is slow
// (a ~1.9s period — a plausible pendulum for a bell this size) and SMALL: a few
// degrees at the strike, not a church-tower toll. Each strike is superposed as
// its own decaying impulse, so a second strike while it is still moving adds
// energy without any snap in the pose — the new term contributes nothing at the
// instant it lands and pushes from there. Everything is a closed form over the
// simTime fed to update(), so the motion is deterministic: same seed, same
// history of calls, same pose.

// THE SWING, live and tunable — the same mutable-export pattern SWING and
// CLAP_FORCE (kit/furin.js) and CYL_SWING and CYL_FORCE (kit/cylinder.js)
// already use: the binding stays const, its fields don't, so
// dev/hanging-audition.html writes straight into it and the very next strike
// moves differently with no reload. Read inside pose() and swinging() rather
// than captured at construction, so a slider reaches a bell that is already
// standing in the scene, not just the next one built.
//
// This bell was the last hanging thing in the kit still holding its numbers as
// private consts, which is exactly why there was nowhere to tune it from: the
// harness had a section for the fūrin and one for the bronze cylinder and none
// for the bonshō.
//
//   throw  — radians of tilt a single strike lands. Started at 0.055 (3.2
//            degrees), which read as a still object with a sound attached on
//            a mass of bronze that size.
//   max    — the ceiling stacked strikes saturate at. It must stay WELL
//            clear of `throw` or it stops being a safety net and becomes the
//            thing you are actually tuning against: at throw 0.21 a single
//            strike already peaks at 0.148, so a 0.22 ceiling would clip the
//            second strike of any pair and the bell would stop responding to
//            being rung twice.
//   period — seconds per swing. A bonshō is massive and unhurried.
//   settle — envelope e-folding time; about 5% is left after 3 of these.
export const BELL_SWING = {
  throw: 0.30,
  max: 0.55,
  period: 1.9,
  settle: 1.35,
};

export function makeBell({ height = 1.1, color = ACCENT, frameColor = WASH.dark, seed = 16 } = {}) {
  const g = new THREE.Group();
  g.name = 'bell';
  const H = height;

  const timber = washMaterial({ color: frameColor });
  const flat = washMaterial({ color: frameColor, flat: true });
  const stone = washMaterial({ color: WASH.stone, flat: true });

  // the stone pad the frame stands on — also what the grass keeps out of
  const padH = 0.065 * H;
  const padR = 0.75 * H;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(padR, padR * 1.07, padH, 10), stone);
  pad.name = 'pad';
  pad.position.y = padH / 2;
  g.add(pad);

  // two posts carrying the beam the bell hangs from
  const spread = 1.16 * H;              // post-to-post
  const pivotY = 1.47 * H;              // the hanging point, under the beam
  const beamY = pivotY + 0.065 * H;     // beam centre; its underside is the pivot
  const postH = beamY - padH;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * H, 0.07 * H, postH, 8), timber);
    post.name = 'post';
    post.position.set(sx * spread / 2, padH + postH / 2, 0);
    g.add(post);
  }

  // There is no striking log, and that is a finding rather than an omission.
  // A two-post frame has no room for one in its own plane — the bell fills the
  // gap between the posts — so the log can only hang outside a post, and there
  // it reads as a trapeze beside the bell rather than as the thing that rings
  // it. It would also be a striker that stands still while the bell is struck.
  const beam = new THREE.Mesh(new THREE.BoxGeometry(spread + 0.5 * H, 0.13 * H, 0.13 * H), flat);
  beam.name = 'beam';
  beam.position.y = beamY;
  g.add(beam);

  // a small roof over the beam: the hut's pyramid, squared to the posts and
  // squashed front-to-back so it reads as a beam cap rather than a building.
  // It sits on an eave board of its own footprint, merged into the same mesh:
  // a bare pyramid has no edge, and seen level it is a sheet of paper balanced
  // on the ridge beam.
  const roofR = 1.31 * H, roofH = 0.34 * H, roofDepth = 0.55, eaveH = 0.05 * H;
  const roofGeo = new THREE.ConeGeometry(roofR, roofH, 4);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1, 1, roofDepth);
  roofGeo.translate(0, eaveH / 2, 0);
  const eaveSide = roofR * Math.SQRT2;
  const eaveGeo = new THREE.BoxGeometry(eaveSide, eaveH, eaveSide * roofDepth);
  eaveGeo.translate(0, -roofH / 2, 0);
  const roof = new THREE.Mesh(mergeSimple([roofGeo, eaveGeo]), flat);
  roof.name = 'roof';
  roof.position.y = beamY + 0.065 * H + eaveH / 2 + roofH / 2;
  g.add(roof);

  // Everything below the pivot swings as one piece about it.
  const swing = new THREE.Group();
  swing.name = 'swing';
  swing.position.y = pivotY;
  g.add(swing);

  // The suspension loop (ryuzu) — a real bonshō hangs from a dragon-shaped
  // handle, not a bare rod. Built as a short mounting stub (the boss the
  // handle roots in) with a half-torus arch merged on top of it: the arch's
  // two feet plant on the stub, and its crown reaches up to just shy of the
  // pivot — close enough to read as "this is what carries the weight"
  // without pretending to model a beam threaded through it.
  const linkLen = 0.14 * H;
  const STUB_R = 0.150 * H, STUB_H = 0.070 * H;
  const LOOP_R = 0.085 * H, TUBE_R = 0.024 * H;
  const stubGeo = new THREE.CylinderGeometry(STUB_R * 0.85, STUB_R, STUB_H, 7);
  stubGeo.translate(0, -linkLen + STUB_H / 2, 0);
  const loopGeo = new THREE.TorusGeometry(LOOP_R, TUBE_R, 6, 10, Math.PI);
  loopGeo.translate(0, -linkLen + STUB_H, 0);   // feet on the stub's top face
  const link = new THREE.Mesh(mergeSimple([stubGeo, loopGeo]), flat);
  link.name = 'link';
  swing.add(link);

  // The bell itself, and the whole of it is the outline: a bonshō is a
  // barrel, not a handbell. The wall rises from the mouth almost straight,
  // closing only slightly, turns over a rounded shoulder and finishes as a low
  // dome. The one step in it is the lip — the thickened rim at the mouth,
  // proud of the wall by a thickness and square-edged, so it reads as a band
  // of metal rather than a skirt.
  //
  // Three things this profile must never grow back, because together they are
  // a fire hydrant at case distance: a waist (any ring wider than the ring
  // under it), a mouth that flares, and a crown that runs to a point. The
  // shoulder bands went with the waist — they were only legible as the bulge
  // above it.
  //
  // The barrel is as wide as the frame allows and no wider: the bell swings
  // front-to-back, but its off-axis wobble carries the mouth toward the posts.
  // The profile runs mouth to crown with a shallow recessed underside, so
  // nothing is open from below.
  const P = [
    [0.000, 0.050],                                    // recessed underside
    [0.345, 0.000],                                    // MOUTH — the lip's lower edge, the widest ring
    [0.345, 0.060],                                    // the lip's upper edge: square, not a skirt
    [0.322, 0.078],                                    // step in to the wall
    [0.300, 0.700],                                    // the barrel's long straight run ends: SHOULDER
    [0.270, 0.840],
    [0.200, 0.930],                                    // the dome
    [0.100, 0.985],
    [0.000, 1.000],                                    // crown
  ].map(([r, y]) => new THREE.Vector2(r * H, y * H));
  const body = new THREE.Mesh(new THREE.LatheGeometry(P, 12), washMaterial({ color, flat: true }));
  body.name = 'body';
  body.position.y = -linkLen - H;       // crown at the link's foot; mouth at 0.33·H
  swing.add(body);

  // A tap wants the bell, not a particular facet: an invisible drum around the
  // body keeps the gesture forgiving on a phone. Solid to a raycast only.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48 * H, 0.48 * H, 1.25 * H, 8),
    new THREE.MeshBasicMaterial({ visible: false }));
  hit.name = 'bell-hit';
  hit.position.y = -linkLen - 0.5 * H;
  swing.add(hit);

  // ---- the swing --------------------------------------------------------
  // All four numbers live in BELL_SWING at the top of this file now, and are
  // read on every frame rather than captured here — see its comment. This is
  // still the older superposed-impulse model rather than the real pendulum
  // the fūrin and the bronze cylinder run on (src/kit/pendulum.js), which is
  // why its knobs are amplitudes and not a kick and a damping. Moving it
  // across is its own task.
  //
  // The off-axis wobble keeps the swing from reading machine-planar: its rate
  // and depth are per-seed, and it starts from zero at each strike like the
  // main term. It rides the live period, so retuning that keeps the two in
  // proportion.
  const wobFreq = ((2 * Math.PI) / BELL_SWING.period) * (0.78 + 0.10 * hash1(7, seed));
  const wobAmp = 0.20 + 0.15 * hash1(8, seed);

  let clock = 0;
  const struck = [];                      // simTimes of strikes still sounding

  function pose() {
    const { throw: A0, max: MAX, period, settle: TAU } = BELL_SWING;
    const OMEGA = (2 * Math.PI) / period;
    let x = 0, z = 0;
    for (const t0 of struck) {
      const t = clock - t0;
      if (t < 0) continue;
      const env = A0 * Math.exp(-t / TAU);
      x += env * Math.sin(OMEGA * t);
      z += env * wobAmp * Math.sin(wobFreq * t);
    }
    swing.rotation.x = clamp(x, -MAX, MAX);
    swing.rotation.z = clamp(z, -MAX, MAX);
  }

  return {
    group: g,
    body,
    // what a tap should be tested against — the drum, the bronze, the link
    pickTargets() { return [hit, body, link]; },

    strike() {
      struck.push(clock);
      if (struck.length > 8) struck.shift();
      pose();
    },
    // total envelope still in the bell: 0 at rest, ~A0 just after one strike
    swinging() {
      let e = 0;
      const { throw: A0, settle: TAU } = BELL_SWING;
      for (const t0 of struck) if (clock >= t0) e += A0 * Math.exp(-(clock - t0) / TAU);
      return e;
    },
    angle() { return swing.rotation.x; },

    update(dt, simTime) {
      clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
      while (struck.length && clock - struck[0] > 6 * BELL_SWING.settle) struck.shift();
      pose();
    },
  };
}
