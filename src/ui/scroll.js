import { SECTIONS, LABELS, narrationQueue } from './scroll_state.js';

// The hanging-scroll (kakemono) text panel. DOM only; narration is wired by the koan.
export function makeScroll({ id, title, text, accent = '#C73E3A', onSpeak, onSpeakAll } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-scroll';
  el.style.setProperty('--accent', accent);

  const tab = document.createElement('button');
  tab.className = 'gg-scroll-tab';
  tab.textContent = String(id);
  el.appendChild(tab);

  const body = document.createElement('div');
  body.className = 'gg-scroll-body';
  el.appendChild(body);

  const head = document.createElement('div');
  head.className = 'gg-scroll-head';
  head.innerHTML = `<span class="gg-seal">${id}</span><h2>${title}</h2>`;
  const playAll = document.createElement('button');
  playAll.className = 'gg-play-all';
  playAll.textContent = '▶ Read aloud';
  playAll.onclick = () => onSpeakAll && onSpeakAll();
  head.appendChild(playAll);
  body.appendChild(head);

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
    sec.appendChild(label);
    sec.appendChild(p);
    body.appendChild(sec);
    sectionEls[key] = sec;
  }

  let tucked = false;
  const setTucked = (v) => { tucked = v; el.classList.toggle('tucked', tucked); };
  tab.onclick = () => setTucked(!tucked);

  return {
    el,
    queue: () => narrationQueue(text),
    tuck() { setTucked(true); },
    untuck() { setTucked(false); },
    isTucked() { return tucked; },
    highlight(section) {
      for (const key of Object.keys(sectionEls)) sectionEls[key].classList.toggle('speaking', key === section);
    },
    dispose() { el.remove(); },
  };
}
