// The page's two skins. Only the PAGE: the diorama keeps its paper light in
// both, because the scene is a sumi-e painting and a painting does not have a
// night mode. This is the reading light over the text, nothing more — which is
// also why the switch lives beside Sit rather than up in the stage toolbar.

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
