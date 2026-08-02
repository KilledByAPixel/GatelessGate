import { ACCENT } from '../palette.js';
import { pageShape, narrationQueue } from './scroll_state.js';

// The koan text panel (left column). Solid, always shown — no close/tuck control.
// A quiet toolbar carries "Contents" (back) and "Sit"; the case seal appears once.
export function makeScroll({
  id, title, text, sections, labels, accent = ACCENT, onSpeak, onSpeakAll, onBack, onSit,
  onPrev, onNext, hasPrev = true, hasNext = true, themeEl = null,
} = {}) {
  const shape = pageShape({ id, sections, labels, text });
  const el = document.createElement('div');
  el.className = 'gg-view gg-scroll';
  el.style.setProperty('--accent', accent);

  const bar = document.createElement('div');
  bar.className = 'gg-scroll-bar';
  const back = document.createElement('button');
  back.className = 'gg-back';
  back.textContent = '‹ Contents';
  back.onclick = () => onBack && onBack();

  // page one case at a time, without going back to the table of contents —
  // the Mumonkan read cover to cover (Frank). Disabled at the two ends.
  const nav = document.createElement('span');
  nav.className = 'gg-page-nav';
  const prev = document.createElement('button');
  prev.className = 'gg-page';
  prev.textContent = '‹';
  prev.title = 'Previous page';
  prev.setAttribute('aria-label', 'Previous page');
  prev.disabled = !hasPrev;
  prev.onclick = () => onPrev && onPrev();
  const next = document.createElement('button');
  next.className = 'gg-page';
  next.textContent = '›';
  next.title = 'Next page';
  next.setAttribute('aria-label', 'Next page');
  next.disabled = !hasNext;
  next.onclick = () => onNext && onNext();
  nav.append(prev, next);

  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const sitWrap = document.createElement('span');
  sitWrap.className = 'gg-sit-wrap';
  const sit = document.createElement('button');
  sit.className = 'gg-btn';
  sit.textContent = 'Sit';
  const pop = document.createElement('span');
  pop.className = 'gg-sit-pop';
  for (const m of [2, 5, 10, 20]) {
    const b = document.createElement('button');
    b.textContent = m + 'm';
    b.onclick = () => { pop.classList.remove('open'); onSit && onSit(m); };
    pop.appendChild(b);
  }
  sit.onclick = () => pop.classList.toggle('open');
  sitWrap.append(sit, pop);
  // The reading light goes beside Sit, on the text's own toolbar rather than the
  // stage's: it is a setting for the page, and the stage is not affected by it.
  bar.append(back, nav, spacer);
  if (themeEl) bar.appendChild(themeEl);
  bar.appendChild(sitWrap);
  el.appendChild(bar);

  const head = document.createElement('div');
  head.className = 'gg-scroll-head';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  head.appendChild(h2);
  // The seal IS the case number. The front and back matter have none, so they
  // get no seal, and their one red thing lives in the diorama instead.
  if (shape.showSeal) {
    const seal = document.createElement('span');
    seal.className = 'gg-seal';
    seal.textContent = String(id);
    head.insertBefore(seal, h2);
  }
  let playAll = null;
  if (shape.showNarration) {
    playAll = document.createElement('button');
    playAll.className = 'gg-play-all gg-btn';
    playAll.textContent = '▶ Read aloud';
    playAll.onclick = () => onSpeakAll && onSpeakAll();
    head.appendChild(playAll);
  }
  el.appendChild(head);

  // reflect play/stop state on the button so there's always a way to stop
  function setReading(on) {
    if (playAll) playAll.textContent = on ? '■ Stop' : '▶ Read aloud';
  }

  const sectionEls = {};
  for (const key of shape.sections) {
    if (!text[key] || !text[key].trim()) continue;
    const sec = document.createElement('section');
    sec.className = 'gg-section';
    sec.dataset.section = key;
    const label = document.createElement('div');
    label.className = 'gg-section-label';
    label.textContent = shape.labels[key] || '';
    if (shape.showNarration) {
      const speak = document.createElement('button');
      speak.className = 'gg-speak';
      speak.textContent = '♪';
      speak.title = 'Read this section';
      speak.onclick = () => onSpeak && onSpeak(key);
      label.appendChild(speak);
    }
    const p = document.createElement('div');
    p.className = 'gg-section-text';
    p.textContent = text[key];
    sec.appendChild(label);
    sec.appendChild(p);
    el.appendChild(sec);
    sectionEls[key] = sec;
  }

  return {
    el,
    queue: () => narrationQueue(text, shape.sections),
    setReading,
    highlight(section) {
      for (const key of Object.keys(sectionEls)) sectionEls[key].classList.toggle('speaking', key === section);
    },
    dispose() { el.remove(); },
  };
}
