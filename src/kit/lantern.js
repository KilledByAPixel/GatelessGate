import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
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
// THE FIREBOX IS A REAL OPENING NOW (Frank, on case 28: "I want it to be open
// — I wanna see the red candle inside"). The previous pass built it as a solid
// box with dark panels painted on, which read as a closed crate from the
// case's own camera and buried the one flame the book has. It is now a sill
// band, four corner pillars, and a header band — a chamber you can genuinely
// see into from every side, the way a real hibukuro takes its hi-guchi.
//
// The old "open box = see-through blowout against the sky" worry is answered
// by the `window` mesh: no longer panels standing proud of a wall, it is the
// chamber's own dark INTERIOR — a slightly-inset box rendered BackSide, so
// through any opening you see its far wall, ceiling and floor in near-ink and
// never the sky behind the lantern. Same dark-void idea as hut.js's recessed
// doorway, turned inside out. It is marked noOutline (an inverted hull of an
// inward-facing box would ink the cavity shut).
//
// And since the chamber is visible, it holds a CANDLE — a stub of pale wax on
// the sill floor, sized so its tip meets the flame k28 hangs at world y=0.78
// on its height:1.15 lantern (candle top lands at 0.59*H = 0.678 there, the
// flame cone's own base). Every other case just gets an unlit candle in an
// open lantern, which is what a tōrō by a path looks like in daylight; it and
// the interior are the two genuine colour steps on the one-stone rule.
//
// One material still colours all the stone, so the parts separate by SHADE,
// not hue: base/post/jewel keep round toon shading, the firebox stonework and
// roof are flat-shaded — the same round-vs-flat rhythm gate.js and hut.js use.
// Mesh count: seven (base, post, firebox, window, candle, roof, jewel) — the
// platform, sill, header and four pillars all merge into the one 'firebox'
// mesh, so opening the chamber costs exactly one mesh (the candle) over the
// closed version.
export function makeLantern({ height = 1.15, color = WASH.stone } = {}) {
  const H = height;
  const g = new THREE.Group();
  g.name = 'lantern';
  const mat = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });
  // the chamber's interior — a true dark void, deeper than the old painted
  // panels (0.78 vs 0.62 toward ink) so a flame has real night to sit against
  const voidMat = toonMaterial({ color: mixHex(color, INK, 0.78), flat: true, side: THREE.BackSide });
  // wax — barely off the paper, the palest thing on the lantern
  const waxMat = toonMaterial({ color: mixHex(PAPER, INK, 0.05) });

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

  // WINDOW — the name survives from the closed version (k28 and the tests key
  // off it), but it is now the dark interior itself: an inset box drawn
  // BackSide, so every opening looks into a near-ink cavity instead of
  // through to whatever stands behind the lantern.
  const IN_HW = 0.115 * H;
  const IN_H = FBOX_H - 0.03 * H;
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(IN_HW * 2, IN_H, IN_HW * 2), voidMat);
  windowMesh.name = 'window';
  windowMesh.position.y = FBOX_BOT + FBOX_H / 2;
  windowMesh.userData.noOutline = true;
  g.add(windowMesh);

  // CANDLE — pale wax standing on the sill floor, sunk a hair so it reads as
  // set into the chamber rather than balanced on the lip. noOutline: at this
  // size the inverted hull would swallow it whole.
  const CAND_R = 0.027 * H;
  const CAND_H = 0.14 * H;
  const candle = new THREE.Mesh(new THREE.CylinderGeometry(CAND_R * 0.92, CAND_R, CAND_H, 7), waxMat);
  candle.name = 'candle';
  candle.userData.noOutline = true;
  candle.position.y = FBOX_BOT + SILL_H - 0.01 * H + CAND_H / 2;
  g.add(candle);

  // ROOF (kasa) — a hex lathe (segments: 6 gives the facets a real tōrō roof
  // has). The profile carries the same idea as the hut's own eave: steep off
  // the crown, a low point just inboard of the rim, then the rim itself
  // kicked back UP past that low point — the upturned tip.
  const roofY = FBOX_BOT + FBOX_H;
  const ROOF_R = 0.21 * H;
  const RISE = 0.13 * H;
  const LIP = 0.016 * H;
  const DIP = 0.010 * H;
  const roofP = [
    [0, RISE],
    [0.16 * ROOF_R, RISE * 0.55],
    [0.85 * ROOF_R, -DIP],
    [ROOF_R, LIP],
    [0.62 * ROOF_R, -DIP * 0.5],
    [0, -DIP * 0.5 - 0.02 * H],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(roofP, 6), roofY, flat, 'roof');

  // JEWEL (hōju) — round-shaded, a small polished cap.
  const JEWEL_R = 0.04 * H;
  add(new THREE.SphereGeometry(JEWEL_R, 8, 6), roofY + RISE + JEWEL_R + 0.012 * H, mat, 'jewel');

  return g;
}
