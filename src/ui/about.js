import { SECTIONS, REPO_CALLOUT } from './about_state.js';

// The back matter: where the text came from, who made this, and what it was
// made with. A printed book puts this at the end and sets it in the same type
// as the rest, so this view reuses the koan page's own classes (gg-scroll,
// gg-section) rather than inventing a credits screen. It is the one page in
// the book with no case number and no seal.
//
// Called "About" rather than "Colophon": the printer's word is the precise one,
// and precisely why it reads as jargon.
//
// Glue only — every word lives in about_state.js, where the tests can hold
// its claims against the files that make them true.
export function makeAbout({ onBack } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-view gg-scroll gg-about hidden';

  const bar = document.createElement('div');
  bar.className = 'gg-scroll-bar';
  const back = document.createElement('button');
  back.className = 'gg-back';
  back.textContent = '‹ Contents';
  back.onclick = () => onBack && onBack();
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  bar.append(back, spacer);
  el.appendChild(bar);

  const head = document.createElement('div');
  head.className = 'gg-scroll-head';
  const h2 = document.createElement('h2');
  h2.textContent = 'About';
  head.appendChild(h2);
  el.appendChild(head);

  // the repository, set apart directly under the head — see REPO_CALLOUT's
  // note in about_state.js for why it earns the placement
  const repo = document.createElement('div');
  repo.className = 'gg-about-repo';
  repo.appendChild(document.createTextNode(REPO_CALLOUT.lead));
  const repoA = document.createElement('a');
  repoA.href = REPO_CALLOUT.href;
  repoA.textContent = REPO_CALLOUT.text;
  repoA.target = '_blank';
  repoA.rel = 'noopener noreferrer';
  repo.appendChild(repoA);
  el.appendChild(repo);

  for (const { label, parts } of SECTIONS) {
    const sec = document.createElement('section');
    sec.className = 'gg-section';
    const lab = document.createElement('div');
    lab.className = 'gg-section-label';
    lab.textContent = label;
    const body = document.createElement('div');
    body.className = 'gg-section-text';
    for (const part of parts) {
      if (Array.isArray(part)) {
        const a = document.createElement('a');
        a.href = part[1];
        a.textContent = part[0];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        body.appendChild(a);
      } else {
        body.appendChild(document.createTextNode(part));
      }
    }
    sec.append(lab, body);
    el.appendChild(sec);
  }

  return { el };
}
