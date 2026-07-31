import * as THREE from '../../lib/three.module.js';
import { toonMaterial } from '../render/toon.js';
import { mergeSimple } from './scatter.js';
import { WASH, INK, mixHex } from '../palette.js';

// A stone lantern (tōrō): five parts, base to jewel, carved from one stone —
// base (kiso), post (sao), a windowed firebox (hibukuro, on its own platform
// collar), a roof cap (kasa) with an upturned eave, and the jewel finial
// (hōju). Reused everywhere — temple gates, paths, and later the menu's
// progress marks — and it is case 28's own light: k28.js builds its flame
// and hit-target as separate meshes at a fixed world height, so nothing here
// may rename the group or drift its rough silhouette/scale out from under it.
//
// One material colours the whole thing (a real tōrō is one stone), so the
// five parts separate by SHADE, not hue: base/post/jewel keep round toon
// shading (a soft light-to-dark band across the curve), the firebox and roof
// are flat-shaded (a crisp, single value per face) — the same round-vs-flat
// rhythm gate.js's posts/kasagi and hut.js's posts/walls use to step value
// without adding a second colour. The one genuine colour step is the
// firebox's windows: a real darker void, same idea as hut's recessed
// doorway, so a case's own flame (k28) has something dark to sit against
// rather than the same stone tone as the wall around it.
//
// Mesh count held at six — the same as before this pass (base, post,
// platform, firebox, roof, jewel were already six unmerged meshes): the
// platform now merges onto the firebox box (one 'firebox' mesh), which buys
// back the mesh the four windows spend (merged into one 'window' mesh).
export function makeLantern({ height = 1.15, color = WASH.stone } = {}) {
  const H = height;
  const g = new THREE.Group();
  g.name = 'lantern';
  const mat = toonMaterial({ color });
  const flat = toonMaterial({ color, flat: true });
  const windowMat = toonMaterial({ color: mixHex(color, INK, 0.62), flat: true });

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

  // FIREBOX (hibukuro) — a square stone box, and the tallest single stone
  // here (real tōrō carry their height in this piece, not the shaft).
  // Windows are cut in as their own dark mesh below, not a real hole (a void
  // reads by colour here, the same reason hut.js's doorway is a solid
  // recessed panel rather than an actual gap — an open box invites the
  // outline pass to ink an edge that is not there and risks a see-through
  // blowout against the sky). Sized so its window band actually reaches
  // case 28's own flame: k28.js hangs its flame at a fixed world y=0.78 on a
  // height:1.15 lantern (flame spans 0.68–0.88 there), independent of
  // anything in this file — this box and its window are tall enough that
  // the window covers 0.553–0.838 at that same height, catching ~80% of the
  // flame's own span instead of ceding it to the roof above.
  const FBOX_BOT = PLAT_BOT + PLAT_H;
  const FBOX_HW = 0.125 * H;
  const FBOX_H = 0.40 * H;
  const fboxGeo = new THREE.BoxGeometry(FBOX_HW * 2, FBOX_H, FBOX_HW * 2);
  fboxGeo.translate(0, PLAT_H + FBOX_H / 2, 0);
  const firebox = new THREE.Mesh(mergeSimple([platGeo, fboxGeo]), flat);
  firebox.name = 'firebox';
  firebox.position.y = PLAT_BOT;
  g.add(firebox);

  // WINDOWS (hi-guchi) — one dark panel per face, standing PROUD of the
  // firebox wall (not recessed into it: the firebox is a single solid box,
  // so a panel set back behind that face would sit buried inside the stone
  // and never be seen — the same "proud, not a token 0.02" logic hut.js's
  // own doorway/beam comment argues for, just applied outward instead of in
  // a reveal). Built directly at their own thickness/width rather than
  // rotated, so there is no rotation-order surprise between the ±x/±z pairs.
  const winW = 1.24 * FBOX_HW;
  const winH = 0.62 * FBOX_H;
  const winT = 0.03 * H;
  const winInset = FBOX_HW + winT / 2 - 0.004 * H;
  const winGeos = [];
  for (const s of [-1, 1]) {
    const wx = new THREE.BoxGeometry(winT, winH, winW);
    wx.translate(s * winInset, 0, 0);
    winGeos.push(wx);
    const wz = new THREE.BoxGeometry(winW, winH, winT);
    wz.translate(0, 0, s * winInset);
    winGeos.push(wz);
  }
  const windowMesh = new THREE.Mesh(mergeSimple(winGeos), windowMat);
  windowMesh.name = 'window';
  windowMesh.position.y = FBOX_BOT + FBOX_H / 2;
  g.add(windowMesh);

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
