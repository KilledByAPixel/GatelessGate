import { themeGlyph, themeTitle } from './theme_state.js';

// One reading-light switch. Two of them exist at once — one on the contents,
// one in every page's toolbar — so each keeps a refresh() and whoever owns the
// setting repaints them all after a toggle. They are otherwise stateless: the
// glyph is derived from the theme every time it is asked for, never remembered.
export function makeThemeButton({ getTheme, onToggle } = {}) {
  const el = document.createElement('button');
  el.className = 'gg-theme';
  function refresh() {
    const t = getTheme ? getTheme() : 'light';
    el.textContent = themeGlyph(t);
    el.title = themeTitle(t);
    el.setAttribute('aria-label', themeTitle(t));
  }
  el.onclick = () => { onToggle && onToggle(); refresh(); };
  refresh();
  return { el, refresh };
}
