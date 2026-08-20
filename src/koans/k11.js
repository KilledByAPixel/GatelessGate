import * as THREE from '../../lib/three.module.js';
import TEXT from './text/mumonkan.js';
import { PAPER, ACCENT, INK_LIT, WASH, wash } from '../palette.js';
import {
  composeWorld, makePath, makeHut, makeMonk, faceMonk, wrapPi, bearing,
  makeLights, washMaterial, groundHeight,
  makeWater, makeSand, makeFoam, makeBoat,
} from '../kit/index.js';

const ID = 11;

// Joshu comes to a hermit's hut and asks "Anything? Anything?" The hermit
// raises his fist. Joshu says "ships cannot remain where the water is too
// shallow", and goes on. He comes to a SECOND hermit, asks the same question,
// gets the same fist, and says "Well given, well taken, well killed, well
// saved" — and bows.
//
// Two hermits, not one man visited twice: the Chinese is 又到一庵主處 and Mumon's
// comment counts 二庵主. The 1934 English merged them, and the verification pass
// unmerged them. This scene still stages ONE figure answering twice, because the
// koan's mechanism is the identical fist drawing opposite verdicts and one figure
// delivers that in a single frame — the same knowing split as case 18's weighing,
// where the diorama keeps a staging the text no longer claims.
//
// The fist is identical both times, and the interaction is Joshu's verdict:
// touch it and he turns away; touch it again and he bows to it. Nothing about
// the fist changes. The case is entirely in the man who is looking at it, which
// is Mumon's question: where is the fault?
//
// THE SEAL IS THE SHIP, not the fist. The fist held the red first, on the
// reasoning that the one identical thing should be the one warm thing — but
// that put the accent on the object the case says is NOT where the fault lies.
// The ship is Joshu's actual sentence: "ships cannot remain where the water is
// too shallow." It stands off beyond the shallows doing the one thing it cannot
// stop doing, which is not coming in. Painting it is the case's own line said
// in colour, and it leaves the fist ink — identical to every other ink thing,
// which is exactly what the fist is supposed to be.
//
// THE COAST stages the verdict itself, as an ocean scene. The hermit's rise now
// stands above a shallow bay: a long bar of nearly transparent ink over pale
// sand, the sea only gathering weight far out where the fog takes it — water
// too shallow for ships, made literal. And one ship IS here: a small junk
// standing off beyond the shallows, riding the swell, because Joshu's line is
// what it cannot do — come in and remain. The sea stays ink; the red sea
// belongs to case 20, where the ocean is the seal. Here the seal is the ship ON
// that sea.

const TURN_RATE = 2.4;
const BOW = 0.20;
// bearing/wrapPi are the kit's now (faceMonk's convention). The local copy
// here was once aimMonk's atan2(-dz, dx) — for the pointing +x sleeve — which
// left Joshu turned a quarter circle off the monk he is deciding about.

// The coast, k20's grammar: sea to the -z, waterline 10.5 out, a 4-metre
// beach, the bed settling shallow — 1.2 under the surface, a bay not a deep.
// ONE object shared by ground, sand and the water's resting height. The rise's
// base foot reaches z = -6.2; the beach taper starts at -6.5, so the hill
// stands wholly on land.
// exported for tests/k11.test.js, which checks the meadow against the same
// surface the case plants it on rather than a copied set of numbers
export const SHORE = { dx: 0, dz: -1, dist: 10.5, width: 4, sea: -0.35, depth: 1.2 };
// keep scatter, grass and trees out of the sea and off the beach (k20's three
// staggered rows, pulled to this coast's waterline)
const SEA_KEEP = [
  ...[-24, -16, -8, 0, 8, 16, 24].map((x) => ({ x, z: -12.5, r: 6 })),
  ...[-24, -12, 0, 12, 24].map((x) => ({ x, z: -22, r: 14 })),
  ...[-18, -6, 6, 18].map((x) => ({ x, z: -36, r: 16 })),
];

// The framing, named so composeWorld can have it too: `view` lets the
// scatter refuse spots no reachable heading can see (kit/scenery.js).
const CAM = { distance: 10.8, target: [-0.4, 1.3, -0.6], heading: 25, pitch: 18.4 };
  export default {
  id: ID,
  slug: 'joshu-tests-two-hermits',
  title: TEXT[ID].title,
  accent: ACCENT,
  tier: 2,
  text: { case: TEXT[ID].case, comment: TEXT[ID].comment, verse: TEXT[ID].verse },
  // the surf bed under the case whose verdict is about water — quieter than
  // k20's open ocean (0.55): a shallow bay laps, it does not break
  ambience: ['wind:0.22', 'water:0.35', 'fist', 'music'],
  camera: CAM,
  
  build(ctx) {
  const { audio, input, touched } = ctx;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);
  scene.fog = new THREE.FogExp2(PAPER, 0.030);
  scene.add(makeLights({ sun: { heading: -21, pitch: 48 } }));
  
  // the path Joshu came up, twice — a coast road now, running with the
  // shoreline behind the hermit's rise. It used to run to (-3.4, -17),
  // which the bay would drown: a road aimed at the water is a dead end into
  // the ocean (k20's own lesson, k20.js).
  const path = makePath({ from: [8.0, 1.6], to: [-15, 2.0], width: 1, seed: ID, groundSeed: 21, wander: 4.6 });
  scene.add(path);
  
  // the hut he retired to, on its rise — set OFF to the side of the road,
  // because the hill was blocking it. Sited nearer the centre, the path's
  // closest approach fell well INSIDE the rise's base and the road ran straight
  // into the slope and vanished; from here the centerline clears the base at
  // every sample.
  const RISE = { x: -2.8, z: -2.6, rTop: 3.0, rBase: 3.6, h: 0.45, sides: 10 };
  const RISE_TOP_Y = 0.22 + RISE.h / 2;          // the plateau's world height
  const rise = new THREE.Mesh(
  new THREE.CylinderGeometry(RISE.rTop, RISE.rBase, RISE.h, RISE.sides),
  washMaterial({ color: WASH.ground, flat: true }));
  rise.name = 'rise';
  rise.position.set(RISE.x, 0.22, RISE.z);
  scene.add(rise);
  
  // Height of the rise's SURFACE at (x, z) — the grass plants on this (via
  // composeWorld's groundFn below), so it must match the mesh, not an ideal
  // cone: CylinderGeometry is a ten-sided frustum, and treating it as round
  // floats blades mid-air off the flats and buries them at the corners. A
  // regular polygon's radius toward angle a is apothem / cos(offset from the
  // nearest face's midline); along any ray from the axis the slope face is a
  // straight line from base edge to top edge, so the lerp between the two
  // polygon radii IS the facet, exactly.
  const SLICE = (Math.PI * 2) / RISE.sides;
  const riseHeight = (x, z) => {
  const dx = x - RISE.x, dz = z - RISE.z;
  const d = Math.hypot(dx, dz);
  if (d >= RISE.rBase) return 0;               // cheap out past any corner
  const a = Math.atan2(dx, dz);                // CylinderGeometry runs sin/cos
  const off = ((a % SLICE) + SLICE) % SLICE - SLICE / 2;
  const poly = Math.cos(SLICE / 2) / Math.cos(off);   // polygon radius / circumradius
  const top = RISE.rTop * poly, base = RISE.rBase * poly;
  if (d >= base) return 0;
  if (d <= top) return RISE_TOP_Y;
  return RISE_TOP_Y * ((base - d) / (base - top));
};

    const hut = makeHut({ width: 2.4, height: 2.0, depth: 2.0 });
    hut.position.set(RISE.x - 0.6, 0.44, RISE.z - 1.0);
    hut.rotation.y = 0.62;
    scene.add(hut);

    // THE MONK, seated before his door with the fist up. He used to STAND to
    // raise it, which reads as a man interrupted at the door; a hermit who
    // answers from his cushion without getting up is the same gesture given
    // with much more indifference, which is the hermit these two are. The
    // seated half of the pose is the stance and the raised half is the arms —
    // his other hand still folds into his lap (kit/monk.js, 'sit-raise'). The
    // raise itself is unchanged: nearly vertical, offered to the air rather
    // than aimed at anyone.
    const monk = makeMonk({ height: 1.56, pose: 'sit-raise', hat: false });
    monk.position.set(RISE.x + 0.9, 0.44, RISE.z + 0.7);
    scene.add(monk);
    // he is looking at his visitor, both times — a fist raised at nobody in
    // particular would read as a man alone rather than as an answer given

    // THE FIST — ink now, not the seal; the ship carries the red (see the
    // header). It is still its own mesh and still the tap target, because the
    // whole interaction hangs off it: what changed is only that it no longer
    // announces itself. A fist the same tone as the arm it ends is the point —
    // Joshu is shown the identical ordinary thing twice.
    const raised = monk.children
      .filter((c) => c.name === 'arm')
      .find((c) => Math.abs(c.rotation.z) > 1);
    // Parented to the sleeve at its far end rather than positioned by eye in
    // the monk's frame: the sleeve geometry runs from 0 to -sleeveL in its own
    // local y, so this lands on the hand wherever the pose puts it. The length
    // is READ OFF THE GEOMETRY (k3's sleeveHem idiom) rather than restated from
    // the standing stance's fraction — that copy was already a second
    // definition, and sitting him down made it wrong: the seated sleeve is
    // shorter, and the fist would have hung a hand's width past the cuff.
    const fist = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 9, 7),
      washMaterial({ color: INK_LIT, flat: true }));
    fist.name = 'fist';
    if (raised) {
      if (!raised.geometry.boundingBox) raised.geometry.computeBoundingBox();
      fist.position.y = raised.geometry.boundingBox.min.y;
    }
    (raised || monk).add(fist);

    // JOSHU, down on the path, who will make up his mind about it — beside
    // the coast road (it passes z ≈ 4 at his x now), a step toward the rise
    const JOSHU = new THREE.Vector3(2.0, .07, 1.9);
    faceMonk(monk, JOSHU);
    // `bow: true` hinges him at the sash without changing his arms: makeFigure
    // hands back a group named 'waist' carrying the torso, head and sleeves,
    // and turning THAT forward is the bow. He used to bow by rolling the whole
    // figure on z, which lists a body sideways rather than bending it — the
    // fault cases 32 and 15 both had.
    const joshu = makeMonk({ height: 1.64, elder: true, bow: true });
    const joshuWaist = joshu.getObjectByName('waist');
    joshu.position.copy(JOSHU);
    const AT_MONK = bearing(JOSHU, monk.position);
    const AWAY = bearing(JOSHU, { x: 8.0, z: 4.8 });      // back down the road
    joshu.rotation.y = AT_MONK;
    scene.add(joshu);

    // ---- the shallow bay --------------------------------------------------
    // The sheet's local waterline sits at z = +43 (the group is at world
    // -(dist + 43), k20's own placement), so seaward distance is s = 43 - z.
    // THE SHALLOWS ARE THE VERDICT: the ink stays nearly clear for a long run
    // — pale sand showing through a film of water — and only reaches its full
    // weight ~20 out, twice the reach k20's red needs. A gentler swell than
    // the open ocean's, too: a bay laps.
    const water = makeWater({
      shape: 'square', size: 150, color: INK_LIT, seed: ID,
      opacity: 1, segments: 64,
      // half the default idle swell: holds the amplitude this shoreline was
      // tuned around when the ponds' breathing was turned up (see IA in water.js)
      swell: 0.5,
      alphaRamp: (x, z) => {
        const s = 43 - z;
        const t = Math.max(0, Math.min(1, s / 20));
        return 0.10 + 0.72 * t * t * (3 - 2 * t);
      },
      drift: [
        { dx: 0, dz: 1, amp: 0.032, wavelength: 7, period: 6 },
        { dx: 0.2764, dz: 0.9611, amp: 0.016, wavelength: 4.6, period: 4.6 },
        { dx: -0.3429, dz: 0.9394, amp: 0.012, wavelength: 3.2, period: 3.5 },
      ],
    });
    water.group.position.set(0, SHORE.sea, -(SHORE.dist + 43));
    scene.add(water.group);

    // wet sand a step darker than the earth — k20's lesson: foam only reads
    // against sand darker than itself
    const sand = makeSand({ shore: SHORE, seed: ID, groundSeed: 21, color: wash(0.30) });
    scene.add(sand);

    // WORLD y of the sea surface at world (x, z) — the one closure the foam
    // and the boat both ride, so nothing floats on a sea of its own invention
    const seaSurface = (x, z, t) => SHORE.sea + water.heightAt(x, z + (SHORE.dist + 43), t);

    const foam = makeFoam({
      shore: SHORE, seed: ID, groundSeed: 21, count: 7,
      surfaceAt: seaSurface,
    });
    foam.mesh.renderOrder = 1;
    scene.add(foam.mesh);

    // THE SHIP — standing off past the shallows, riding the swell, broadside
    // to the shore. It is the case's own verdict at anchor: "ships cannot
    // remain where the water is too shallow", so it keeps its distance where
    // the ink is finally deep, half dissolved in the fog, and does not come in.
    // THE SHIP, and the case's one warm thing. `color` paints hull and mast;
    // the sail deliberately stays cloth-pale, so the red reads as a painted
    // hull under a plain sail rather than as one vermillion blob — and the
    // pale sail is what keeps the silhouette legible at this distance, where
    // the fog has taken better than half of everything.
    const boat = makeBoat({ seed: ID, surfaceAt: seaSurface, color: ACCENT, sailColor: ACCENT });
    boat.group.position.set(-6.5, SHORE.sea, -25);
    boat.group.rotation.y = Math.PI / 2 + 0.22;   // bow up the coast, quartering
    scene.add(boat.group);

    const world = composeWorld(scene, {
      view: CAM,
      seed: ID+1,
      groundSeed: 21,
      shore: SHORE,
      trees: 7,
      // the coast at the staging's back: both mountain bands re-aimed behind
      // and beside — nothing stands in the sea (k20's arrangement)
      mountains: [
        { count: 7, distance: 52, arcCenter: Math.PI, arcSpan: 3.6, color: wash(0.16) },
        { count: 4, distance: 33, arcCenter: -2.2, arcSpan: 1.3, color: wash(0.28), hScale: 0.65 },
      ],
      forests: [
        { center: [-22, 0, 9], spread: 12, count: 45 },
        { center: [18, 0, 11], spread: 12, count: 35, color: wash(0.55) },
      ],
      keepout: [
        ...path.keepout(24, 1.1),
        { x: RISE.x, z: RISE.z, r: 3.8 },
        { x: JOSHU.x, z: JOSHU.z, r: 1.2 },
        ...SEA_KEEP,
      ],
      grassKeepout: [
        ...path.keepout(24, 0.6),
        { x: hut.position.x+1, z: hut.position.z+1, r: 2. },
        ...SEA_KEEP,
      ],
      // the grass stands on the rise where the rise is, and on the SHORED
      // terrain everywhere else — the same surface the ground mesh itself is
      // displaced by, so the meadow rides the hill AND follows the land down
      // toward the sand instead of hovering on the unshored height (k20's
      // groundFn note). Off the hill riseHeight is 0, and taking a max of 0
      // against the shore's dip would flatten the seabed — hence the guard.
      groundFn: (x, z) => {
        const g = groundHeight(x, z, { seed: 21, shore: SHORE });
        const r = riseHeight(x, z);
        return r > 0 ? Math.max(g, r) : g;
      },
    });

    // THE SHIP IS WHAT YOU TOUCH — the bow, specifically. It used to be the
    // meditating monk's raised fist, a 0.34-radius cylinder at chest height:
    // the koan's own gesture, and the smallest, most easily-missed thing on the
    // page. The ship is the red mark in the picture, and the red mark is what a
    // reader reaches for — the pattern half this book already runs on.
    //
    // Parented TO THE BOAT, so the box rides the swell with it. A hit proxy
    // pinned at the boat's launch position would drift off the hull every time
    // the sea lifted it. Generous by design: it is twenty-five units out and a
    // few dozen pixels tall, so the box is most of a hull-length across and
    // takes in the mast, which is the part that actually reads at that range.
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 3.4, 2.2),
      new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = 'boat-hit';
    hit.position.set(0, 1.2, 0);        // local to the boat: hull through masthead
    boat.group.add(hit);

    // ---- the moment: the same verdict, twice -----------------------------
    // THE TAP ROCKS THE HULL. The verdict plays out on shore, in Joshu, so the
    // thing actually touched needed feedback of its own. A
    // decaying roll on top of the swell's, at the tap and gone in a few
    // seconds. Elapsed-since-tap only, never absolute time.
    //
    // The amplitude is set by how far away the ship is, not by what looks like
    // a plausible roll up close: it stands off twenty-five units in fog, a few
    // dozen pixels tall, so a roll that would be a real lurch alongside was not
    // visible at all from shore. It is a fair way past the swell's own trim now
    // — a deliberate knock, the one thing that answers a touch out there.
    const ROCK = { amp: 0.30, hz: 1.1, tau: 1.2, span: 4.0 };
    let camera = null;
    let clock = 0;
    let visits = 0;             // odd = dismissed, even = approved
    let bowAt = -99;
    let rockedAt = -99;

    input.onTap(() => {
      if (!camera) return;
      const tap = input.raycastFirst(camera, [hit]);
      if (!tap) return;
      touched && touched();
      rockedAt = clock;
      visits++;
      // BOTH verdicts chime now — the odd-tap knock alone read as a door
      // somewhere rather than as the ship answering. Two notes, so the two
      // verdicts stay two sounds: the dismissal higher and lighter, the
      // approval its settled tube 1.
      if (visits % 2 === 0) {
        bowAt = clock;
        audio && audio.chimeStrike({ tube: 1, force: 0.55, at: tap.point });   // well given, well taken
      } else {
        audio && audio.chimeStrike({ tube: 4, force: 0.5, at: tap.point });    // and he walks off
      }
    });

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        clock = Number.isFinite(simTime) ? simTime : clock + (dt || 0);
        world.update(dt, simTime);
        water.update(dt, simTime);
        foam.update(dt, simTime);
        boat.update(dt, simTime);
        // added AFTER boat.update on purpose: the kit owns rotation from the
        // swell and reassigns it every frame, so the tap's roll rides on top
        // rather than fighting it
        const r = clock - rockedAt;
        if (r >= 0 && r < ROCK.span) {
          boat.group.rotation.z -=
            ROCK.amp * Math.sin(r * ROCK.hz * Math.PI * 2) * Math.exp(-r / ROCK.tau);
        }
        // the lapping breathes with the sea it belongs to (k20's idiom):
        // the TRUE surface at the waterline, handed to the bed as 0..1
        if (audio && audio.setWaterSwell) {
          const h = water.heightAt(0, 43, clock);
          audio.setWaterSwell(Math.max(0, Math.min(1, 0.5 + h / 0.17)));
        }
        const step = Math.max(0, dt || 0);

        // he turns away on the odd verdicts and back on the even ones
        const want = (visits > 0 && visits % 2 === 1) ? AWAY : AT_MONK;
        joshu.rotation.y += wrapPi(want - joshu.rotation.y) * (1 - Math.exp(-TURN_RATE * step));

        // and on the even ones he bows to it
        const u = bowAt > -99 ? (clock - bowAt) : -1;
        let lean = 0;
        if (u >= 0 && u < 2.6) {
          lean = Math.min(1, u / 0.7, (2.6 - u) / 0.9);
          lean = lean * lean * (3 - 2 * lean);
        }
        // forward, at the waist — bodies front local +z, so a positive turn
        // about x carries the chest that way whatever his yaw is doing
        joshuWaist.rotation.x = BOW * lean;
      },
      fragment() {
        return {
          visits,
          approved: visits > 0 && visits % 2 === 0,
          bow: +Math.abs(joshuWaist.rotation.x).toFixed(4),
          // the ship rides but never arrives — its distance offshore is fixed
          shipY: +boat.group.position.y.toFixed(4),
        };
      },
      dispose() { water.dispose(); foam.dispose(); },
    };
  },
};
