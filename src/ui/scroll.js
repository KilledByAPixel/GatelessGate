import { SECTIONS, LABELS, narrationQueue } from './scroll_state.js';

// The koan text panel (left column). Solid, always shown — no close/tuck control.
// A quiet toolbar carries "Contents" (back) and "Sit"; the case seal appears once.
export function makeScroll({ id, title, text, accent = '#C73E3A', onSpeak, onSpeakAll, onBack, onSit } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-scroll';
  el.style.setProperty('--accent', accent);

  const bar = document.createElement('div');
  bar.className = 'gg-scroll-bar';
  const back = document.createElement('button');
  back.className = 'gg-back';
  back.textContent = '‹ Contents';
  back.onclick = () => onBack && onBack();
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const sit = document.createElement('button');
  sit.className = 'gg-btn';
  sit.textContent = 'Sit';
  sit.onclick = () => onSit && onSit();
  bar.append(back, spacer, sit);
  el.appendChild(bar);

  const head = document.createElement('div');
  head.className = 'gg-scroll-head';
  const seal = document.createElement('span');
  seal.className = 'gg-seal';
  seal.textContent = String(id);
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const playAll = document.createElement('button');
  playAll.className = 'gg-play-all gg-btn';
  playAll.textContent = '▶ Read aloud';
  playAll.onclick = () => onSpeakAll && onSpeakAll();
  head.append(seal, h2, playAll);
  el.appendChild(head);

  const sectionEls = {};
  for (const key of SECTIONS) {
    if (!text[key] || !text[key].trim()) continue;
    const sec = document.createElement('section');
    sec.className = 'gg-section';
    sec.dataset.section = key;
    const label = document.createElement('div');
    label.className = 'gg-section-label';
    label.textContent = LABELS[key];
    const speak = document.createElement('button');
    speak.className = 'gg-speak';
    speak.textContent = '♪';
    speak.title = 'Read this section';
    speak.onclick = () => onSpeak && onSpeak(key);
    label.appendChild(speak);
    const p = document.createElement('div');
    p.className = 'gg-section-text';
    p.textContent = text[key];
    sec.append(label, p);
    el.appendChild(sec);
    sectionEls[key] = sec;
  }

  return {
    el,
    queue: () => narrationQueue(text),
    highlight(section) {
      for (const key of Object.keys(sectionEls)) sectionEls[key].classList.toggle('speaking', key === section);
    },
    dispose() { el.remove(); },
  };
}
