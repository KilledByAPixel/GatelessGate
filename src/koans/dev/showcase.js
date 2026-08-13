import * as THREE from '../../../lib/three.module.js';
import { PAPER, INK, ACCENT, ACCENT_DEEP } from '../../palette.js';
import { makeLights } from '../../render/lights.js';
import {
  makeAssembly, makeBasin, makeBell, makeBird, makeBirds, makeBowl,
  makeBuddha, makeBuffalo, makeBundle, makeCat, makeDog, makeDrum, makeFlag,
  makeFlower, makeForest, makeFox, makeFurin, makeGate,
  makeGround, makeHangingMonk, makeHorse, makeHut, makeKoi, makeLantern,
  makeLattice, makeMonk, makeMoon, makeOak, makeOdoshi, makePen, makePine,
  makePole, makeQuadruped, makeRack, makeScale,
  makeScreen, makeStall, makeTree, makeTuftField, makeVase, makeVeranda,
  makeWater, makeWheel, makeWildflowers,
} from '../../kit/index.js';

// THE SHOWCASE — every model in the kit, in one room.
//
// A developer page, not a page of the book: no number, no seal, not in the
// spine, not in the contents. It exists so a change to a shared builder can be
// judged against every OTHER builder at once — the thing `dev/kit-preview.html`
// does on a bare plane, but inside the real pipeline. Same Lambert shading, same
// fog-to-paper, same post spine, same ink dissolve on the way in. A model
// that looks right on the workbench and wrong here is wrong; this is the
// room that says which.
//
// THE DRAW BUDGET DOES NOT APPLY HERE, and that is deliberate: forty-odd models
// at once is several times a case's allowance and always will be. Nothing had to
// be carved out of tests/staging.test.js to allow it — the showcase lives in its
// own loader table (registry.js's DEV_LOADERS) and the staging net walks CASES,
// so it is never in that walk to begin with. tests/showcase.test.js pins exactly
// that, and gives this scene the rest of the smoke treatment a case gets.
//
// Everything is seeded, like everywhere else in the book: two builds are the
// same room, down to the last blade.

// The families, front to back. Rows recede in -z with the camera looking down
// the length of the room, so the reader reads them the way the kit is grouped:
// what lives, who watches, what grows, what is built, what is used.
const ROWS = {
  animals: -4,
  people: -13,
  vegetation: -23,
  architecture: -32,
  props: -39,
};

// Rows get WIDER the further back they stand, and that is not decoration: the
// camera sits over the near edge of the room, so at the front row only about
// eleven units either side of the centre line are in frame and at the back row
// twenty-one are. A uniform grid would have pushed the first and last animal
// clean off both edges — which is exactly what the first take of this scene
// did. Each row's models are spaced to its own allowance.

// The captions stand in the aisle IN FRONT of their row, on the TRUE centre
// line (x = 0) — the one column that stays clear at every depth, zoom and
// heading this camera reaches, because every row's own tall outlier (the
// vegetation oak, the gallows oak in the people row, the architecture pole)
// is placed off to one side precisely so the middle of the room is empty.
//
// This used to read x = 0 in the comment but -6.5 in the constant — "a
// quieter column than dead centre" — and that quieter column is almost
// exactly under the vegetation row's own oak (x = -8): from an angled near
// shot the ARCHITECTURE caption standing behind it lined up with the oak's
// crown on screen and read as ink lost in ink. Dead centre does not have
// that neighbour. A caption can still fail to read against paper-coloured
// ground or a light sky, which is what the stroke halo below is for — this
// column just keeps it off the room's one consistently dark shape.
//
// Height is ONE constant, deliberately not tuned per row: a first pass raised
// the back rows well above their own tallest piece (up to 7 units, to clear
// the pole) and that broke the wide shot instead of fixing it — ARCHITECTURE
// and PROPS sit close together in depth, and lifting one far more than the
// other collapsed the gap perspective had been giving them, so the two
// captions crowded together on screen. A single modest height keeps every
// caption's screen position governed by its row's OWN depth, the way the
// five read cleanly apart in the first place; nothing at x = 0 in any row is
// taller than this clears, and the halo carries the rest.
const LABEL_AISLE = 3.4;
const LABEL_X = 0;
const LABEL_Y = 0.85;
const LABEL_CAP = 0.92;      // world height of the drawn line, at LABEL_REF
// The distance the caption sizes were tuned at — the camera's own home. update()
// scales each label by its distance over this, so a caption is the same size on
// screen from the survey shot as it is with your nose against one model.
const LABEL_REF = 56;

// An ink caption, drawn on a canvas and hung as a sprite so it faces the reader
// from any orbit angle. The canvas is measured to the word rather than fixed, so
// the sprite is exactly as wide as its text and "ARCHITECTURE" cannot run off
// the end of its own texture. Sprites are outside the mesh graph, but not
// outside the depth-edge ink pass — see depthWrite/depthTest below, which is
// what actually keeps a caption out of it. Sprites ARE outside the scene
// manager's disposeRoot, though, which is why this module frees them by hand.
// Returns null with no DOM (the Node tests), so nothing in the scene may
// depend on a label existing.
function makeRowLabel(text) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  const font = '600 72px Georgia, serif';
  const word = text.toUpperCase();
  ctx.font = font;
  const w = Math.max(8, Math.ceil(ctx.measureText(word).width));
  canvas.width = w + 16; canvas.height = 112;
  // resizing the canvas resets the context, so the font has to be set again
  const c2 = canvas.getContext('2d');
  c2.font = font;
  c2.textAlign = 'center';
  c2.textBaseline = 'middle';
  // A paper-coloured halo behind the ink, not just a flat fill: a caption is
  // read against whatever the room puts behind it — sky, ground, or the one
  // dark canopy in frame — and a flat fill at low alpha vanished into that
  // last one. The stroke reads as a caption on any of them; the fill on top
  // is what still says "ink" rather than "sticker".
  c2.lineJoin = 'round';
  c2.lineWidth = 14;
  c2.strokeStyle = PAPER;
  c2.globalAlpha = 0.9;
  c2.strokeText(word, canvas.width / 2, 60);
  c2.fillStyle = INK;
  c2.globalAlpha = 0.92;
  c2.fillText(word, canvas.width / 2, 60);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  // depthWrite: false is not a nicety. A sprite that writes depth hands the
  // post spine's depth-edge ink pass a rectangle, and every caption shipped
  // inside a drawn box — the ink was correctly outlining the quad it could see.
  // Not writing depth makes the caption what it looks like: text on the page.
  // depthTest goes with it: a caption that a pine tree can hide is a caption
  // you cannot read from half the angles this camera can reach, and a heading
  // is not part of the picture it labels. Drawn last, over everything.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, fog: false, depthWrite: false, depthTest: false,
  }));
  sprite.renderOrder = 10;
  sprite.name = `label-${text}`;
  const h = LABEL_CAP * (canvas.height / 72);
  sprite.scale.set(h * (canvas.width / canvas.height), h, 1);
  // Held so update() can hold the caption at a constant SIZE ON SCREEN — see
  // LABEL_REF. A world-sized caption is tuned for exactly one zoom level, and
  // at the close end of this camera's range "ARCHITECTURE" filled the frame.
  sprite.userData.base = sprite.scale.clone();
  return sprite;
}

export default {
  id: null,                 // no number: no seal, and nothing that counts cases sees it
  slug: 'showcase',
  title: 'Showcase',
  // The flag main.js reads to keep a tool out of the reader's progress: opening
  // the showcase must not mark a page read or move "Continue".
  dev: true,
  accent: ACCENT,
  sections: ['note'],
  labels: { note: 'The Kit' },
  text: {
    note: [
      'Every model the kit builds, in one room, through the book\'s own renderer — '
      + 'the same shading, the same ink edges, the same fog into paper.',
      'Front to back: the animals, the people, what grows, what is built, what is used. '
      + 'Anything with a behaviour is running — the fox breathes, the wheel turns, '
      + 'the water swells, the flag takes the wind.',
      'This page is not part of the book. It has no number, it is not in the contents, '
      + 'and it appears only while Developer mode is on.',
    ].join('\n\n'),
  },
  ambience: ['wind:0.10'],   // a quiet room; no drift, nothing to be moved by
  mood: 'in',

  // A survey shot, and clamps wide enough to be useful: all the way out to hold
  // the whole room in frame, all the way in to put your nose on one model, and
  // most of a half-turn of orbit either way. A case would never want this — a
  // case is a photograph — which is why it is stated here rather than loosened
  // for everyone.
  //
  // 56 is what holds all five rows WITH the text panel open, which eats about a
  // third of the window: the stage is nearer square than wide, so the room has
  // to be framed for the narrow case. maxDist stops at 70 rather than going
  // further because the app's camera far plane is 100 and the moon stands out
  // past the back row — a deeper pull-out would clip it out of existence.
  camera: {
    distance: 56, target: [0, 1.0, -22], heading: 0, pitch: 31.6,
    minDist: 3, maxDist: 70, minPitch: 5.2, maxPitch: 67.1, headingRange: 85.9,
  },

  build() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    // Thin: the room is forty units deep and the back row still has to be
    // legible. Fog is present because nothing in this book meets a horizon —
    // the far ground still has to wash out into the paper.
    scene.fog = new THREE.FogExp2(PAPER, 0.0075);
    // LIT LIKE A PAGE, which is the whole job of this room: a model judged here
    // has to predict how it will read in a case. It did not, on two counts.
    //
    // The key stood at the book's default heading against a camera at 0, which
    // is a far harder side-rake than any real page — every case is framed from
    // somewhere around the same quarter as its key, so the reader sees a mild
    // three-quarter light, and the gallery was showing every model a good deal
    // more raked than that. The aim below is that same relationship, measured
    // off THIS room's camera heading rather than a case's.
    //
    // And the shadow map has to grow with the frustum. This room is forty units
    // deep, so it needs a much wider shadow camera than a diorama's staging —
    // at the stock map that was barely half the book's texel density, and the
    // contact shadows read chunky next to the ones on a real page.
    scene.add(makeLights({ focus: [0, 0, -16], radius: 26, mapSize: 4096, sun: { heading: 20, pitch: 52 } }));

    // Dead flat, on purpose. Every field in the kit places its blades with
    // groundHeight() in its OWN local space, which is level inside the default
    // flat radius — so a flat floor is the one that agrees with them wherever
    // the field is set down. roll: 0 makes the whole plane that surface.
    const ground = makeGround({ size: 200, roll: 0, flatRadius: 60 });
    scene.add(ground);

    const animated = [];
    const labels = [];

    // Place a piece at (x, z) in a family row. Takes a Group/Mesh or a
    // {group}/{mesh} handle — the kit returns both shapes — and collects
    // anything with an update() so its behaviour runs here too. A dead model in
    // a room full of live ones reads as a bug in the model, which is the whole
    // point of looking at them together.
    function place(thing, x, row, ry = 0, y = 0) {
      const obj = thing.isObject3D ? thing : (thing.group || thing.mesh);
      obj.position.set(x, y, ROWS[row]);
      obj.rotation.y = ry;
      scene.add(obj);
      if (typeof thing.update === 'function') animated.push(thing);
      return thing;
    }

    // ---- animals (±10.5) ---------------------------------------------------
    // The plain quadruped first: the table every species is a departure from.
    place(makeQuadruped({ height: 1 }), -10.5, 'animals', 0.5);
    place(makeBuffalo({}), -7.8, 'animals', 0.5);
    place(makeHorse({}), -4.8, 'animals', 0.4);
    place(makeDog({}), -2.2, 'animals', 0.6);
    place(makeFox({}), -0.3, 'animals', 0.5);
    place(makeCat({}), 1.4, 'animals', -0.4);

    // The koi need somewhere to be. A basin with water in it is the pairing the
    // kit is actually used in, so it is the pairing shown: fish just under a
    // surface that swells, inside a rim they never slop over.
    const POND_X = 4.2, POND_Y = 0.22;
    place(makeBasin({ inner: 1.05, outer: 1.25, rim: 0.4 }), POND_X, 'animals');
    const pond = place(makeWater({ shape: 'round', size: 2.0, opacity: 0.55, strike: 0.06 }),
      POND_X, 'animals', 0, POND_Y);
    place(makeKoi({ count: 3, radius: 0.62, length: 0.66, depth: 0.10, surfaceAt: pond.swellAt }),
      POND_X, 'animals', 0, POND_Y);

    // A single bird is modelled flat — it is meant to be seen from below, in a
    // flock. Held here at eye height and flapped off simTime so the pose it is
    // usually driven into is the pose on show.
    const bird = place(makeBird({ size: 0.5 }), 7.2, 'animals', 0, 1.5);
    place(makeBirds({ count: 6, seed: 24, center: [0, 0], height: 6.0, spread: 4 }), 10, 'animals');

    // ---- people (±13.5) ----------------------------------------------------
    // The four poses side by side, then the elder, so a change to the robe or
    // the stance can be read across all of them at once.
    place(makeMonk({ pose: 'stand' }), -13.5, 'people', -0.3);
    place(makeMonk({ pose: 'sit' }), -11.8, 'people', -0.3);
    place(makeMonk({ pose: 'point' }), -10.1, 'people', -0.3);
    place(makeMonk({ pose: 'raise' }), -8.4, 'people', -0.3);
    place(makeMonk({ pose: 'stand', elder: true }), -6.7, 'people', -0.3);
    place(makeBuddha({}), -3.6, 'people');
    // The assembly reads its own centre in world space, so it is added where it
    // stands rather than moved afterwards. Set off the centre line so it does
    // not sit on top of the row's caption in the aisle ahead of it.
    scene.add(makeAssembly({ count: 8, radius: 2.2, center: [1.0, ROWS.people], facing: [1.0, ROWS.people + 4] }));
    place(makeFlag({}), 7.6, 'people', -0.4);

    // The hanging monk needs a branch, so he gets one: a real canopy anchor on
    // a real oak, the way case 5 hangs him, rather than a hand-picked point in
    // the air that would show him in an attitude he never actually takes.
    const gallows = place(makeOak({ height: 4.8, seed: 5 }), 11.2, 'people', 0.3);
    gallows.updateMatrixWorld(true);
    const branch = gallows.localToWorld(gallows.canopyPoints[0].clone());
    // ACCENT_DEEP, as case 5 uses: plain ink would vanish into the crown.
    const dangler = makeHangingMonk({ height: 1.6, color: ACCENT_DEEP });
    dangler.group.position.copy(branch);
    scene.add(dangler.group);
    animated.push(dangler);

    // ---- vegetation (±16.5) ------------------------------------------------
    place(makeTree({ height: 3.2 }), -16, 'vegetation');
    place(makePine({ height: 4 }), -12.5, 'vegetation');
    place(makeOak({ height: 5.0, seed: 38 }), -8, 'vegetation', 0.4);
    // Modest footprints: a stand at production density would reach into the
    // rows either side, which is the collision dev/kit-preview.html already
    // learned the hard way.
    place(makeForest({ center: [0, 0, 0], spread: 3, count: 20, treeH: 2.2 }), -2.5, 'vegetation');
    // one grass row, not two: the geometric blade field was cut and the cards
    // are the meadow now
    place(makeTuftField({ radius: 2.6, count: 700, seed: 9 }), 5.5, 'vegetation');
    place(makeWildflowers({ radius: 2.2, count: 70, seed: 71 }), 13, 'vegetation');
    place(makeFlower({}), 16, 'vegetation');

    // ---- architecture (±23) -------------------------------------------------
    place(makeGate({}), -17.5, 'architecture');
    place(makeHut({}), -12, 'architecture', 0.2);
    place(makeVeranda({}), -5.5, 'architecture', 0.15);
    place(makeStall({}), 1, 'architecture', 0.1);
    place(makeScreen({}), 6.5, 'architecture');
    place(makeLattice({}), 11.5, 'architecture', 0.15);
    place(makePole({ height: 6 }), 16, 'architecture');
    // Case 37's enclosure. Its own footprint is a 5.4-unit square (walls to
    // either side of centre), so it needs more clearance than any other single
    // piece in this row — set past the pole with a gap wide enough that neither
    // its walls nor the pole's guy-line footprint touch.
    place(makePen({}), 21.5, 'architecture');

    // ---- props (±20) -------------------------------------------------------
    place(makeLantern({}), -18, 'props');
    place(makeBell({}), -15, 'props');
    place(makeDrum({}), -12, 'props');
    place(makeRack({}), -9.2, 'props');
    place(makeBasin({}), -6.6, 'props');
    place(makeVase({}), -4.2, 'props');
    place(makeBowl({}), -2.5, 'props');
    place(makeWheel({}), -0.3, 'props');
    // Sized up from its own default the way the workbench does: the real chime
    // is a few centimetres across and would be invisible from a survey camera.
    place(makeFurin({ size: 0.5 }), 3.2, 'props', 0, 1.9);
    place(makeBundle({}), 5.6, 'props');
    place(makeScale({}), 8.2, 'props');
    place(makeOdoshi({}), 11.5, 'props');

    // The moon, out past everything, because it is a model too — and the one
    // thing in the kit that has to be judged against sky rather than ground.
    // 44 units, not the 62 it defaults to: the app's far plane is 100 and this
    // camera can pull back to 70, so a moon set at its usual remove clips out of
    // existence at full zoom. Case 19 hit the same wall from the other side.
    scene.add(makeMoon({ radius: 2.6, distance: 44, height: 10.5, azimuth: 0.3 }));

    // Captions go on last because they are not part of the picture — they
    // are the contact sheet's handwriting in the margin.
    for (const [name, z] of Object.entries(ROWS)) {
      const label = makeRowLabel(name);
      if (!label) continue;
      label.position.set(LABEL_X, LABEL_Y, z + LABEL_AISLE);
      scene.add(label);
      labels.push(label);
    }

    let camera = null;
    let elapsed = 0;

    return {
      scene,
      setCamera(c) { camera = c; },
      update(dt, simTime) {
        elapsed += dt;
        const t = simTime === undefined ? elapsed : simTime;
        for (const a of animated) a.update(dt, t);
        // The lone bird is a static model with a pose() rather than an update();
        // driving it off the clock is what shows the pose the flock uses.
        bird.pose({ flap: Math.sin(t * 2.4) * 0.5, pitch: -0.05, roll: 0 });
        // Captions hold their size on screen. Skipped entirely with no camera
        // (the Node tests), which is why the base scale has to be the one the
        // wide shot wants rather than something update() must run to fix.
        if (!camera) return;
        for (const l of labels) {
          const k = camera.position.distanceTo(l.position) / LABEL_REF;
          l.scale.set(l.userData.base.x * k, l.userData.base.y * k, 1);
        }
      },
      fragment() {
        let meshes = 0;
        scene.traverse((o) => { if (o.isMesh) meshes++; });
        return { models: animated.length, meshes, labels: labels.length, camera: !!camera };
      },
      dispose() {
        // Sprites are not meshes, so the scene manager's disposeRoot walks
        // straight past them and their canvas textures would leak on every
        // visit. Nothing else here needs freeing by hand.
        for (const l of labels) {
          if (l.material) {
            if (l.material.map) l.material.map.dispose();
            l.material.dispose();
          }
        }
        labels.length = 0;
      },
    };
  },
};

// Kept out on purpose, and not by oversight: makeGround/makeMountains/
// makeCliff/makeCave/makePath/makeSnow/makeRocks/makeBushes are terrain
// and weather, not models — they have no footprint that sits in a row, and each
// one would swallow the neighbours it is meant to be compared against. The
// ground here IS makeGround; the rest are judged in the cases that use them.
//
// Also excluded, for a different reason — these are component and helper
// builders, never placed on their own: makeFigure is the lathe-and-limbs rig
// makeMonk (and so every monk in the people row) is built from, not a model in
// its own right; makeTail is the same for every quadruped's tail (buffalo,
// horse, dog, fox, cat all carry one, already visible on each of them).
