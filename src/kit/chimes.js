import { makeFurin, FURIN_REACH } from './furin.js';
import { hash1 } from '../util/noise.js';

// HANGING CHIMES UNDER SOMETHING, in one line.
//
// A fūrin under an eave is one of the cheapest bits of life a scene can have —
// it moves, it sounds, and it says the air is moving — but hanging one meant
// six decisions every time: where the soffit actually is, how far the thing can
// drop before it fouls the tie beam under it, what size, what kind, an
// independent phase so two never swing in lockstep, and the onStrike line into
// the audio engine. Case 29 worked all of that out by hand and wrote three
// paragraphs about it; nobody was going to do that again for a hut in the
// background (Frank: "an easier way to hang different types of chimes from the
// huts and gates... this way I can add some chimes easily").
//
// So makeHut and makeGate take `chimes: <seed>`. Zero — the default — hangs
// nothing at all, so every scene in the book is untouched. Any other number
// hangs one or two, of a seeded kind and size, from the side the door is on.
// The seed is the whole interface: change the number until you like what you
// get, and it will be that every time the page is built.

// The book's chime sizes, the range case 29 arrived at by ear: 0.09 rings
// bright and small, 0.18 is the deepest that still reads as a fūrin rather
// than a bell. Anything a beam's clearance forces below this gets clamped up
// and takes a shorter cord instead — a tiny chime on a long string reads as
// debris, where a normal one hung tight reads as hung tight.
const SIZE = [0.10, 0.185];
// Ring or single. A ring of three or five tubes is the classic; the single
// body is the plainer temple version. Both are shipped variants of makeFurin
// (its own comment: "five or three tubes around a visible" ring, or one body).
const KINDS = [1, 3, 5];
const MIN_CORD = 0.05;      // below this the cap is tied to the beam, not hung from it

// THE ENGINE, ONCE, so a hung chime makes sound without being asked (Frank:
// "chimes should make sound by default"). Every other kit piece takes its
// wiring from the case — makeFurin has onStrike, so does the cylinder chime —
// and that is right for anything the case is composing deliberately. This
// builder is the opposite: its whole point is that `chimes: 7` is the entire
// instruction, and a second word you have to remember or get silence is not
// that. There is exactly one audio engine in the app; main.js hands it over at
// startup, the same way outlines.js takes its ink scale and scenery.js its
// grass style.
//
// Resolved AT STRIKE TIME, not at build: a scene built before startup finished
// would otherwise capture a null and stay mute for its whole life. An explicit
// `audio` still wins, which is how tests capture strikes on their own stub.
let sharedAudio = null;
export function setChimeAudio(engine) { sharedAudio = engine || null; }

/**
 * Hang one or two chimes under something.
 *
 * @param parent   the object they hang from — they are added to it, so they
 *                 move with it and the case never repeats its coordinates.
 * @param seed     non-zero picks the arrangement; 0 or absent hangs nothing.
 *                 May also be `{ seed, wind, count }` to dial the strike rate
 *                 or pin how many hang.
 * @param audio    an engine to use INSTEAD of the shared one (above). Cases do
 *                 not need it; tests pass a stub here to capture strikes. With
 *                 neither, they swing in silence rather than throwing, because
 *                 build() must survive a scene with no audio engine at all.
 * @param y        the soffit: the height, in parent-local space, they hang from.
 * @param z        which side. The door's side, for the callers here.
 * @param span     half the x they may hang within, measured from x = 0.
 * @param maxDrop  how far anything may reach below `y` before it fouls what is
 *                 under it — a gate's tie beam, a hut's door head. Size and
 *                 cord are both solved against this rather than hoping.
 * @returns the fūrin objects, [] when seed is 0.
 */
export function hangChimes(parent, {
  seed = 0, audio = null, y = 0, z = 0, span = 0.8, maxDrop = 0.5,
  wind = 1, count = null,
} = {}) {
  // `chimes: 29` is the common case and stays a bare number. The object form —
  // `chimes: { seed: 29, wind: 0.45 }` — is for when the strike rate is wrong
  // for the scene: at wind 1 a pair rings about every two seconds, at 0.45
  // about every three, at 0.2 about every five and a half. The book's rule is
  // that audio is minimal and chill, and how chatty a corner should be is a
  // decision about that corner, not a constant.
  if (seed && typeof seed === 'object') {
    ({ seed = 0, wind = 1, count = null } = seed);
  }
  if (!seed) return [];
  const rnd = (i) => hash1(i, seed * 7919 + 13);

  // One or two. Three under one eave starts to read as a shop rather than a
  // house, and case 29's row of three is a composition, not a decoration.
  const howMany = count === null ? (rnd(0) < 0.45 ? 1 : 2) : count;
  const out = [];

  for (let i = 0; i < howMany; i++) {
    const k = i * 6;                       // its own slice of the stream
    const tubes = KINDS[Math.floor(rnd(k + 1) * KINDS.length)];

    // SIZE AND CORD ARE SOLVED TOGETHER against the clearance, because they
    // share it: total reach is cord + FURIN_REACH x size, and a size chosen
    // first can leave no room for a cord at all. Take the wanted size, shrink
    // it if it alone would foul, and give the cord whatever is left.
    const want = SIZE[0] + rnd(k + 2) * (SIZE[1] - SIZE[0]);
    const size = Math.min(want, (maxDrop - MIN_CORD) / FURIN_REACH);
    // Absolute, never size-relative — case 29's lesson, from Frank watching
    // three sizes hang in a row: "the small ones are not hanging low enough."
    // A cord measured in units of size gives the smallest chime the shortest
    // string, so the one that most needs to reach down is pinned tightest.
    const room = Math.max(MIN_CORD, maxDrop - FURIN_REACH * size);
    const cordLength = MIN_CORD + rnd(k + 3) * (room - MIN_CORD);

    // Two chimes go one either side of centre; a lone one sits off-centre,
    // because dead centre under an eave reads as a fixture rather than
    // something somebody hung there.
    const off = 0.3 + rnd(k + 4) * 0.7;
    const x = howMany === 1 ? span * off * (rnd(k + 5) < 0.5 ? -1 : 1)
      : span * off * (i === 0 ? -1 : 1);

    const f = makeFurin({
      tubes,
      size,
      cordLength,
      seed: seed * 31 + i,
      // Its own clock. Without this two chimes on one beam swing and strike in
      // perfect lockstep, which is the one thing that says "these came out of
      // the same function" (case 29 hit it first).
      phase: 1.3 + 2.4 * i + rnd(k + 6) * 1.7,
      onStrike: (tube, force, pos) => {
        const engine = audio || sharedAudio;
        engine && engine.chimeStrike({ tube, force, at: pos });
      },
    });
    f.setWindLevel(wind);
    f.group.position.set(x, y, z);
    // The chime object itself rides on its group, because a scene is the only
    // thing main.js has a handle on and everything that makes a fūrin a fūrin —
    // update(), pick(), ring() — lives on the object, not the Object3D.
    f.group.userData.hungBy = 'hangChimes';
    f.group.userData.furin = f;
    parent.add(f.group);
    out.push(f);
  }
  return out;
}

// EVERY CHIME HUNG IN A SCENE, found by sweeping it once.
//
// A hung chime has to be DRIVEN or it is a bronze ornament: makeFurin only
// swings inside its own update(), and without one the thing hangs dead still,
// never reaches its clapper and never makes a sound. The first cut of this
// feature left that to the case — and every case promptly did not do it, which
// is the same friction the seed exists to remove (Frank: "they're not moving or
// anything, they're not making sound... these are kind of like solid").
//
// So main.js drives them, the way it already owns ambience for every case. It
// sweeps a scene once when the scene becomes active and keeps the list; the
// list dies with the scene, so there is no registry to leak and nothing to
// unregister on a page turn.
export function collectChimes(root) {
  const out = [];
  if (!root) return out;
  root.traverse((o) => {
    if (o.userData.hungBy === 'hangChimes' && o.userData.furin) out.push(o.userData.furin);
  });
  return out;
}

// The tap. Returns true when one was struck, so the caller knows the touch was
// spent. Two-stage picking is the fūrin's own (kit reuse rule): its pick()
// probes the tubes first, where a hit is unambiguous, then the forgiving
// whole-chime targets.
export function ringChimeAt(chimes, camera, input) {
  for (const c of chimes) {
    const hit = c.pick(camera, input);
    if (hit) { c.ring(0.75, hit.tube); return true; }
  }
  return false;
}

// What a builder hands back so the case can drive them: the list, and one
// update to call. Attached to the built group rather than changing what these
// builders return, because makeHut and makeGate have always returned a plain
// Object3D and forty cases add them straight to a scene.
export function attachChimes(group, chimes) {
  group.chimes = chimes;
  // Safe to call unconditionally, so a case's update() never has to ask whether
  // this particular hut happens to have chimes on it today — and safe to call
  // ALONGSIDE main.js's own driving, because makeFurin integrates the elapsed
  // simTime since its last call: a second call at the same simTime advances it
  // by zero. A case that wants to drive its own chimes can; it just no longer
  // has to.
  group.updateChimes = (dt, simTime) => { for (const c of chimes) c.update(dt, simTime); };
  return group;
}
