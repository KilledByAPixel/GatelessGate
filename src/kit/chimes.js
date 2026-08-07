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

/**
 * Hang one or two chimes under something.
 *
 * @param parent   the object they hang from — they are added to it, so they
 *                 move with it and the case never repeats its coordinates.
 * @param seed     non-zero picks the arrangement; 0 or absent hangs nothing.
 * @param audio    ctx.audio, wired straight to onStrike. Omitted, they swing
 *                 in silence rather than throwing — build() must survive a
 *                 scene with no audio engine at all (the staging net builds
 *                 every case that way).
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
} = {}) {
  if (!seed) return [];
  const rnd = (i) => hash1(i, seed * 7919 + 13);

  // One or two. Three under one eave starts to read as a shop rather than a
  // house, and case 29's row of three is a composition, not a decoration.
  const count = rnd(0) < 0.45 ? 1 : 2;
  const out = [];

  for (let i = 0; i < count; i++) {
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
    const x = count === 1 ? span * off * (rnd(k + 5) < 0.5 ? -1 : 1)
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
      onStrike: (tube, force, pos) => audio && audio.chimeStrike({ tube, force, at: pos }),
    });
    f.group.position.set(x, y, z);
    parent.add(f.group);
    out.push(f);
  }
  return out;
}

// What a builder hands back so the case can drive them: the list, and one
// update to call. Attached to the built group rather than changing what these
// builders return, because makeHut and makeGate have always returned a plain
// Object3D and forty cases add them straight to a scene.
export function attachChimes(group, chimes) {
  group.chimes = chimes;
  // Safe to call unconditionally, so a case's update() never has to ask
  // whether this particular hut happens to have chimes on it today.
  group.updateChimes = (dt, simTime) => { for (const c of chimes) c.update(dt, simTime); };
  return group;
}
