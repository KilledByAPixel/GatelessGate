import * as THREE from '../../lib/three.module.js';
import { washMaterial } from '../render/material.js';
import { INK_LIT } from '../palette.js';
import { mergeSimple } from './scatter.js';
import { hangChimes, attachChimes } from './chimes.js';

// A freestanding gate with no door: a torii. Two tapered posts (hashira)
// rooted in base collars (nemaki), a tie beam (nuki) that reads proud of the
// posts rather than flush with them, and a top lintel (kasagi) built as a
// flat centre span with two upswept wing ends — the roofline curve every
// torii reads by, done here as three straight segments merged into one mesh
// (a box doesn't bend, but three of them hinged at shallow angles read as a
// sweep at both the workbench close-up and real scene scale). Mesh count is
// held at four (2 posts, 1 kasagi, 1 nuki) exactly as before this pass —
// the nemaki rings merge onto their own post's geometry rather than adding
// draw calls, and the kasagi's three segments merge into one mesh the same
// way.
//
// k47.js hardcodes this file's `height + 0.09` (kasagi) and `height * 0.78`
// (nuki) anchor heights for its own invisible tap slabs — those two mesh
// positions are load-bearing for a file this task cannot touch and must not
// move.
export function makeGate({
  width = 2.4, height = 2.6, color = INK_LIT,
  // Chimes under the lintel. A gate has no door to take a side from, so they
  // hang under the kasagi's flat centre span, which is the only stretch of it
  // with a level underside. 0 hangs nothing; any other number hangs one or two,
  // and they sound without being wired. See src/kit/chimes.js.
  chimes = 0, audio = null,
} = {}) {
  const g = new THREE.Group();
  g.name = 'gate';
  const mat = washMaterial({ color });
  const flatMat = washMaterial({ color, flat: true });

  // POSTS + NEMAKI — a tapered post (already narrower at the top than the
  // base) with a flared collar merged on at the very foot, where a torii's
  // post actually meets the ground.
  const POST_TOP_R = 0.09, POST_BOTTOM_R = 0.12;
  const NEMAKI_H = 0.14, NEMAKI_TOP_R = 0.15, NEMAKI_BOTTOM_R = 0.165;
  // THE BURIED TOP. The posts stand at ±width/2, and the kasagi's flat centre
  // span only reaches ±0.364·width — so the posts always sit under the tilted
  // WINGS, whose undersides lift off y = height as they sweep up. A post cut
  // to exactly `height` therefore leaves a sliver of daylight between its top
  // and the lintel (≈0.06–0.08 across the widths in use; Frank's redo-round
  // note). Run the post up INTO the kasagi instead: 0.12 extra always lands
  // inside the lintel's own box (max gap ~0.08, box depth 0.18), so the join
  // is buried and nothing pokes out the top.
  const POST_BURY = 0.12;
  for (const sx of [-1, 1]) {
    const postGeo = new THREE.CylinderGeometry(POST_TOP_R, POST_BOTTOM_R, height + POST_BURY, 10);
    postGeo.translate(0, (height + POST_BURY) / 2, 0);  // base at local y=0, matching the old mesh.position placement
    const ringGeo = new THREE.CylinderGeometry(NEMAKI_TOP_R, NEMAKI_BOTTOM_R, NEMAKI_H, 10);
    ringGeo.translate(0, NEMAKI_H / 2, 0);    // sits right at the foot, wider than the post it wraps
    const post = new THREE.Mesh(mergeSimple([postGeo, ringGeo]), mat);
    post.name = 'post';
    post.position.set(sx * width / 2, 0, 0);
    g.add(post);
  }

  // KASAGI — flat centre span, two tilted end wings pivoting flush off its
  // corners. Overall horizontal footprint matches the old flat lintel
  // (width * 1.4) so k47's tap slab, sized off that same formula, still
  // covers it.
  const KASAGI_LEN = width * 1.4, KASAGI_H = 0.18, KASAGI_D = 0.34;
  const WING_LEN = KASAGI_LEN * 0.24, WING_TILT = 0.18;
  const CENTER_LEN = KASAGI_LEN - 2 * WING_LEN;
  const kasagiWing = (sx) => {
    const wg = new THREE.BoxGeometry(WING_LEN, KASAGI_H, KASAGI_D);
    wg.translate(sx * WING_LEN / 2, 0, 0);    // inner (attaching) edge at local x=0
    wg.rotateZ(sx * WING_TILT);               // lifts the outer tip, pivoting on that inner edge
    wg.translate(sx * CENTER_LEN / 2, 0, 0);  // flush against the centre span's own end
    return wg;
  };
  const gapFix = .03  // the wings' inner edges are slightly wider than the centre span, so the join is buried
  const kasagiGeo = mergeSimple([
    new THREE.BoxGeometry(gapFix+CENTER_LEN, KASAGI_H, KASAGI_D),
    kasagiWing(-1), kasagiWing(1),
  ]);
  const top = new THREE.Mesh(kasagiGeo, flatMat);
  top.name = 'lintel';
  top.position.y = height + 0.09;

  // NUKI — widened from the old width * 1.08 so it visibly overhangs the
  // posts rather than nearly meeting them.
  const second = new THREE.Mesh(new THREE.BoxGeometry(width * 1.16, 0.14, 0.26), flatMat);
  second.name = 'tie';
  second.position.y = height * 0.78;
  g.add(top, second);

  // ---- chimes under the lintel --------------------------------------------
  // The kasagi's box is centred at height + 0.09 and is KASAGI_H (0.18) deep,
  // so its underside is exactly `height`. Only the flat centre span has a level
  // one — the wings tilt away from it — and |x| < width * 0.364 is how far that
  // span reaches (cases 22 and 29 both derived that fraction before this existed).
  //
  // THE DROP IS BOUNDED BY THE NUKI, which crosses at height * 0.78 and is 0.14
  // deep. Anything longer than the gap swings THROUGH the tie beam, which is
  // exactly the trap case 29 had to work out by hand for its row of three; here
  // the clearance is computed from the beam that causes it, so a gate of any
  // height gets it right.
  const nukiTop = height * 0.78 + 0.07;
  attachChimes(g, hangChimes(g, {
    seed: chimes, audio, y: height, z: 0, span: width * 0.30,
    maxDrop: Math.max(0.12, height - nukiTop - 0.03),
  }));

  return g;
}
