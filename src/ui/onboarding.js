export function makeOnboarding({ onDismiss } = {}) {
  const el = document.createElement('div');
  el.className = 'gg-onboard hidden';
  el.style.cssText += ';top:50%;left:50%;transform:translate(-50%,-50%);max-width:340px;text-align:center;';
  el.innerHTML = `<p style="line-height:1.6">A quiet reading of the Mumonkan.<br>Read · listen · touch things · sit.</p>`;
  const b = document.createElement('button');
  b.textContent = 'Begin';
  b.onclick = () => { el.classList.add('hidden'); onDismiss && onDismiss(); };
  el.appendChild(b);
  return {
    el,
    show() { el.classList.remove('hidden'); },
    hide() { el.classList.add('hidden'); },
  };
}
