// Pairs shots/<prefix>before-<key>.jpg with shots/<prefix>after-<key>.jpg into
// one HTML page. `--prefix p3-` keeps one pass's shots apart from another's:
// without it the page is contact-sheet.html and pairs the bare before-/after-
// names, as it always did.
//
// Keys are grouped under the model they belong to — everything up to the first
// "-" that starts a view suffix (-sil, -lit, -kN, -preface, -afterword) — so a
// model's grids and its in-case shots read as one section.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const at = argv.indexOf('--prefix');
const prefix = at >= 0 ? (argv[at + 1] || '') : '';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'shots');
const files = fs.readdirSync(dir);
const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const beforeRe = new RegExp(`^${esc}before-(.+)\\.(jpe?g|png)$`);
const keys = [...new Set(files.map((f) => beforeRe.exec(f)?.[1]).filter(Boolean))].sort();

const modelOf = (key) => key.replace(/-(sil|lit|k\d+|preface|afterword)(-.*)?$/, '');
const groups = new Map();
for (const key of keys) {
  const m = modelOf(key);
  if (!groups.has(m)) groups.set(m, []);
  groups.get(m).push(key);
}

const find = (p, key) => files.find((f) => f.startsWith(`${prefix}${p}-${key}.`));
const row = (key) => {
  const after = find('after', key);
  return `<h3>${key}</h3><div class="pair">
    <figure><img loading="lazy" src="${find('before', key)}"><figcaption>before</figcaption></figure>
    ${after ? `<figure><img loading="lazy" src="${after}"><figcaption>after</figcaption></figure>`
            : '<p class="missing">no after shot</p>'}
  </div>`;
};
const section = ([model, ks]) => `<section id="${model}"><h2>${model}</h2>${ks.map(row).join('\n')}</section>`;

const html = `<!doctype html><meta charset="utf-8"><title>Contact sheet ${prefix}</title>
<style>
  body { font: 14px system-ui; background: #F3EDDF; color: #1E1E24; margin: 2em; }
  nav a { margin-right: 1em; color: inherit; }
  h2 { border-top: 1px solid #999; padding-top: 1em; } h3 { font-weight: normal; }
  .pair { display: flex; gap: 12px; } figure { margin: 0; }
  img { max-width: 46vw; border: 1px solid #999; } .missing { color: #a33; }
</style><h1>Before / after${prefix ? ` — ${prefix}` : ''}</h1>
<nav>${[...groups.keys()].map((m) => `<a href="#${m}">${m}</a>`).join('')}</nav>
${[...groups].map(section).join('\n')}`;
const out = `${prefix}contact-sheet.html`;
fs.writeFileSync(path.join(dir, out), html);
console.log(`${out}: ${keys.length} pairs in ${groups.size} models`);
