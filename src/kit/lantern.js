import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { mergeSimple } from './scatter.js';
import { WASH, PAPER, INK, mixHex } from '../palette.js';

// A stone lantern (tōrō): base to jewel, carved from one stone — base (kiso),
// post (sao), an OPEN firebox (hibukuro, on its own platform collar), a roof
// cap (kasa) with an upturned eave, and the jewel finial (hōju). Reused
// everywhere — temple gates, paths, and later the menu's progress marks — and
// it is case 28's own light: k28.js builds its flame and hit-target as
// separate meshes at a fixed world height, so nothing here may rename the
// group or drift its rough silhouette/scale out from under it.
//
// THE FIREBOX IS TRULY OPEN NOW. The half-open version read as glass in the
// lantern walls and hid the flame. Round 1 opened the chamber into
// a sill band, four corner pillars, and a header band, but lined the cavity
// with a dark BackSide interior box so nothing showed through — and that
// lining read as smoked-glass panes from the case camera. It is deleted
// entirely: through any face you now see the candle, the flame, and clean
// out the far side between the pillars, the way a real hibukuro takes its
// hi-guchi. The flame reads against whatever the scene puts behind it, which
// in case 28 is the night itself — darker than any painted void was.
//
// The visible chamber holds a CANDLE — a stub of pale wax on the sill floor,
// sized so its tip meets the flame k28 hangs at world y=0.78 on its
// height:1.15 lantern (candle top lands at 0.59*H = 0.678 there, the flame's
// own base). Every other case just gets an unlit candle in an open lantern,
// which is what a tōrō by a path looks like in daylight; the wax is the one
// genuine colour step on the one-stone rule.
//
// One material still colours all the stone, so the parts separate by SHADE,
// not hue: base/post/jewel keep round (smooth-normal) shading, the firebox
// stonework and roof are flat-shaded — the same round-vs-flat rhythm gate.js
// and hut.js use.
// Mesh count: six (base, post, firebox, candle, roof, jewel) — the platform,
// sill, header and four pillars all merge into the one 'firebox' mesh.
export function makeLantern({ height = 1.15, color = WASH.stone } = {}) {
  const H = height;
  const g = new THREE.Group();
  g.name = 'lantern';
  const mat = washMaterial({ color });
  const flat = washMaterial({ color, flat: true });
  // wax — barely off the paper, the palest thing on the lantern
  const waxMat = washMaterial({ color: mixHex(PAPER, INK, 0.05) });

  const add = (geo, y, m, name) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = name;
    mesh.position.y = y;
    g.add(mesh);
    return mesh;
  };

  // BASE (kiso) — round-shaded, the footing everything else stands on.
  const BASE_H = 0.09 * H;
  add(new THREE.CylinderGeometry(0.148 * H, 0.174 * H, BASE_H, 8), BASE_H / 2, mat, 'base');

  // POST (sao) — round-shaded, the shaft.
  const POST_BOT = BASE_H;
  const POST_H = 0.27 * H;
  add(new THREE.CylinderGeometry(0.048 * H, 0.061 * H, POST_H, 7), POST_BOT + POST_H / 2, mat, 'post');

  // PLATFORM (chudai) — the collar the firebox sits on, merged onto it below.
  const PLAT_BOT = POST_BOT + POST_H;
  const PLAT_H = 0.045 * H;
  const platGeo = new THREE.CylinderGeometry(0.085 * H, 0.10 * H, PLAT_H, 8);
  platGeo.translate(0, PLAT_H / 2, 0);

  // FIREBOX (hibukuro) — the open chamber: a solid sill band, four square
  // corner pillars, and a header band under the roof. The pillars are kept
  // slim (0.042*H against the 0.125*H half-width) so each face's opening is
  // most of the face — from k28's own camera the sight-line to the flame
  // passes well inside a pillar's edge once the case turns the chamber to
  // face the reader. Footprint, height and band positions keep the closed
  // version's silhouette exactly, so no consumer's framing moves.
  const FBOX_BOT = PLAT_BOT + PLAT_H;
  const FBOX_HW = 0.125 * H;
  const FBOX_H = 0.40 * H;
  const SILL_H = 0.055 * H;
  const HEAD_H = 0.05 * H;
  const PILLAR_W = 0.042 * H;
  const OPEN_H = FBOX_H - SILL_H - HEAD_H;
  const stones = [platGeo];
  const sill = new THREE.BoxGeometry(FBOX_HW * 2, SILL_H, FBOX_HW * 2);
  sill.translate(0, PLAT_H + SILL_H / 2, 0);
  stones.push(sill);
  const head = new THREE.BoxGeometry(FBOX_HW * 2, HEAD_H, FBOX_HW * 2);
  head.translate(0, PLAT_H + FBOX_H - HEAD_H / 2, 0);
  stones.push(head);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.BoxGeometry(PILLAR_W, OPEN_H, PILLAR_W);
      pillar.translate(
        sx * (FBOX_HW - PILLAR_W / 2),
        PLAT_H + SILL_H + OPEN_H / 2,
        sz * (FBOX_HW - PILLAR_W / 2));
      stones.push(pillar);
    }
  }
  const firebox = new THREE.Mesh(mergeSimple(stones), flat);
  firebox.name = 'firebox';
  firebox.position.y = PLAT_BOT;
  g.add(firebox);

  // CANDLE — pale wax standing on the sill floor, sunk a hair so it reads as
  // set into the chamber rather than balanced on the lip.
  const CAND_R = 0.027 * H;
  const CAND_H = 0.14 * H;
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(CAND_R * 0.92, CAND_R, CAND_H, 7), waxMat);
  candle.name = 'candle';
  candle.position.y = FBOX_BOT + SILL_H - 0.01 * H + CAND_H / 2;
  g.add(candle);

  // ROOF (kasa) — a hex lathe (segments: 6 gives the facets a real tōrō roof
  // has). The profile carries the same idea as the hut's own eave: steep off
  // the crown, a low point just inboard of the rim, then the rim itself
  // kicked back UP past that low point — the upturned tip.
  const ROOF_R = 0.25 * H;
  const RISE = 0.13 * H;
  const LIP = 0.01 * H;
  const DIP = 0.00 * H;
  const roofY = FBOX_BOT + FBOX_H + DIP;
  const roofP = [
    [0, RISE],
    [0.16 * ROOF_R, RISE * 0.55],
    [0.85 * ROOF_R, -DIP],
    [ROOF_R, LIP],
    [0.62 * ROOF_R, -DIP * 0.5],
    [0, -DIP * 0.5 - 0.02 * H],
  ].reverse().map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(roofP, 6), roofY, flat, 'roof');

  // JEWEL (hōju) — round-shaded, a small polished cap.
  const JEWEL_R = 0.04 * H;
  add(new THREE.SphereGeometry(JEWEL_R, 8, 6), roofY + RISE + JEWEL_R - 0.03 * H, mat, 'jewel');

  return g;
}
