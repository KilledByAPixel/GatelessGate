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
  bar.append(back, spacer, sitWrap);
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

  // reflect play/stop state on the button so there's always a way to stop
  function setReading(on) { playAll.textContent = on ? '■ Stop' : '▶ Read aloud'; }

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
    setReading,
    highlight(section) {
      for (const key of Object.keys(sectionEls)) sectionEls[key].classList.toggle('speaking', key === section);
    },
    dispose() { el.remove(); },
  };
}
