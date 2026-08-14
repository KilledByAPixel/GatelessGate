import { SIT_MINUTES } from './sit_button_state.js';

// THE SIT BUTTON AND ITS DURATIONS. One widget, built in two places — the
// page's own toolbar (scroll.js) and the Contents' title row (menu.js) — the
// same way makeThemeButton holds the one reading light for both. It lived
// inline in scroll.js and the Contents grew a second copy the moment sitting
// stopped being something only a case could offer; a popover with four
// durations is exactly the thing that goes quietly out of step in duplicate.
//
// Stateless apart from the popover being open: the durations come from
// SIT_MINUTES (sit_button_state.js, where they are testable) and nothing here
// remembers a sitting. Whoever owns the timer owns that.
export function makeSitButton({ onSit, label = 'Sit' } = {}) {
  const el = document.createElement('span');
  el.className = 'gg-sit-wrap';

  const btn = document.createElement('button');
  btn.className = 'gg-btn';
  btn.textContent = label;
  btn.title = 'Sit with this scene for a while';

  const pop = document.createElement('span');
  pop.className = 'gg-sit-pop';
  for (const m of SIT_MINUTES) {
    const b = document.createElement('button');
    b.textContent = m + 'm';
    b.setAttribute('aria-label', `Sit for ${m} minutes`);
    // close FIRST, then start: sitting hides the whole panel, and a popover
    // left open under it is still open when the reader comes back out
    b.onclick = () => { close(); onSit && onSit(m); };
    pop.appendChild(b);
  }

  function close() { pop.classList.remove('open'); }
  btn.onclick = () => pop.classList.toggle('open');
  el.append(btn, pop);

  return { el, close, isOpen() { return pop.classList.contains('open'); } };
}
