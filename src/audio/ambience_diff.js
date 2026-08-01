// The ambience page-turn, as data. Pure and deterministic — no Web Audio, no
// Math.random — so the whole thing tests in plain Node beside the other param
// tables. The engine's transition() consumes the diff; this module never
// touches a node.
//
// A recipe is the koan module's ambience field: ['wind:0.12', 'water:0.35',
// 'music', 'furin']. Only three tokens name voices the ENGINE itself keeps
// running — wind, water, music (the AUDIBLE set). Every other token (furin,
// bell, gavel…) is a kit object that makes its own noise when struck; in a
// recipe it exists only to feed emitterCount's density rule, so it has no
// layer of its own to keep or stop.
//
// Mood is deliberately absent here: mood changes PITCH, not level — the music
// scheduler reads it through a closure (`pitch: (d) => hz(d, mood)`) and
// retunes from the very next note, and drips pitch at strike time. No gain or
// filter parameter of any layer depends on it, so a mood change rides across
// a page turn for free and the diff has nothing to say about it.

export function parseRecipe(str) {
  const [type, arg] = str.split(':');
  return { type, level: arg !== undefined ? parseFloat(arg) : 1 };
}

// Beds are not emitters: wind is atmosphere rather than an event source, and
// music is the thing being thinned. Everything else in a recipe is an object
// that makes noise, and each one buys the drift layer more silence.
const BEDS = new Set(['wind', 'music']);
export function emitterCount(recipe = []) {
  return recipe.filter((s) => !BEDS.has(parseRecipe(s).type)).length;
}

// The voices the engine itself sustains, in the order the diff reports them.
export const AUDIBLE = ['wind', 'water', 'music'];

// A recipe reduced to its sustained layers: { wind: 0.12, water: 0.35,
// music: 1 }. Presence is meaningful even at level 0 — 'water:0' is a real
// layer (case 7 runs the basin bed silent and keeps its drips), so it must
// read as PRESENT here, never as absent. First occurrence wins, matching
// startAmbience's `!wind` / `!water` creation guards.
//
// Music carries the recipe's emitterCount as its level rather than its own
// token's (always-1) level: density is the one audible parameter the music
// layer has, so the diff hands the engine the number it actually needs.
export function recipeLayers(recipe = []) {
  const out = {};
  for (const item of recipe) {
    const { type, level } = parseRecipe(item);
    if (!AUDIBLE.includes(type) || type in out) continue;
    out[type] = type === 'music' ? emitterCount(recipe) : level;
  }
  return out;
}

// The page turn: which layers survive it (keep, with both levels so the
// engine can ramp from → to), which are new on the next page (start), and
// which the last page takes with it (stop). Identical recipes come back as
// all-keep; an empty `to` is all-stop; an empty `from` is all-start.
export function diffAmbience(from = [], to = []) {
  const a = recipeLayers(from);
  const b = recipeLayers(to);
  const keep = [], start = [], stop = [];
  for (const layer of AUDIBLE) {
    const inA = layer in a, inB = layer in b;
    if (inA && inB) keep.push({ layer, from: a[layer], to: b[layer] });
    else if (inB) start.push({ layer, level: b[layer] });
    else if (inA) stop.push(layer);
  }
  return { keep, start, stop };
}
