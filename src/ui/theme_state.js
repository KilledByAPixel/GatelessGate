// The page's two skins — the reading light, which is why the switch lives
// beside Sit rather than up in the stage toolbar.
//
// It used to stop at the text panel: the diorama kept its paper light in both,
// on the argument that a sumi-e painting does not have a night mode. That now
// holds for everything in the painting EXCEPT the paper it is painted on. Turn
// the light down and the sky goes dark with it (render/nightsky.js); the key
// and the fill do not move, so every lit surface keeps the value it had and
// only what it stands against changes.

export const THEMES = ['light', 'dark'];

export function isTheme(t) { return THEMES.indexOf(t) !== -1; }
export function readTheme(t) { return isTheme(t) ? t : 'light'; }
export function nextTheme(t) { return readTheme(t) === 'dark' ? 'light' : 'dark'; }

// The button shows what a press would DO, the way a moon on a reading app means
// "turn the light off" and never "the light is off". Both glyphs are text-
// presentation characters — ☀ U+2600 renders as a colour emoji on half the
// platforms this ships to, and ☼ U+263C never does.
export function themeGlyph(t) { return readTheme(t) === 'dark' ? '☼' : '☾'; }
export function themeTitle(t) { return readTheme(t) === 'dark' ? 'Light page' : 'Dark page'; }
