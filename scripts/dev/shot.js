#!/usr/bin/env node
// scripts/dev/shot.js — self-contained one-shot screenshotter.
//
//   node scripts/dev/shot.js --kit dog --out after-dog
//   node scripts/dev/shot.js --kit fan --view fan-side --out after-fan-side
//   node scripts/dev/shot.js --case 1 --out redo-k1        # case NUMBER (or preface/afterword)
//   node scripts/dev/shot.js --jobs <file.json>   # [{ "kit"|"case"|"expr": ..., "view"?, "out": ... }]
//
// Case jobs ride the router's deep links (#<id> / #preface / #afterword) — the
// app's own "URL names what's on screen" invariant — instead of driving
// gate.enter(), which the boot sequence ignores while the intro is up.
//
// Everything lives and dies inside this one process: it serves the repo on an
// ephemeral port (no http-server), launches ONE headless Chrome, drives it over
// CDP, writes shots/<out>.jpeg, then kills the whole browser tree. Nothing is
// left running afterward.
//
// WHY THIS EXISTS: headless Chrome renders WebGL through SwiftShader — software
// rasterization on the CPU — and a fleet of persistent headless Chromes (one
// per agent, 4-6 OS processes each) once maxed the machine. The rule now is
// load → render → save → EXIT. Batch several shots into one invocation with
// --jobs to amortize the ~3s browser startup; never keep a browser parked.
//
// Needs Node 22+ (global fetch + WebSocket). Windows paths assumed for Chrome;
// override with CHROME env var.

import { createServer } from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const J = JSON.stringify;

// ---- args ------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 ? argv[i + 1] : undefined;
};
let jobs = [];
if (flag('jobs')) {
  jobs = JSON.parse(await readFile(flag('jobs'), 'utf8'));
} else if (flag('kit') || flag('case') || flag('expr')) {
  jobs = [{ kit: flag('kit'), case: flag('case'), expr: flag('expr'), view: flag('view'), out: flag('out') }];
}
if (!jobs.length || jobs.some((j) => !j.out || !(j.kit || j.case || j.expr))) {
  console.error('usage: shot.js --kit <model> [--view <view>] --out <name>');
  console.error('       shot.js --case <slug> --out <name>');
  console.error('       shot.js --expr "<js returning a dataURL>" --out <name>  (add --page kit|app)');
  console.error('       shot.js --jobs <file.json>');
  process.exit(1);
}
const SIZE = flag('size') || '900,700';

// ---- tiny static server (dies with this process) ----------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- one headless chrome, killed hard on the way out -------------------
const pageUrlFor = (job) => job.kit
  ? `${BASE}/dev/kit-preview.html?ink=0`
  : job.case
    ? `${BASE}/#${job.case}`
    : (job.page === 'kit' ? `${BASE}/dev/kit-preview.html?ink=0` : `${BASE}/`);

const debugPort = 9300 + (process.pid % 600);
const profile = path.join(tmpdir(), `gate-shot-${process.pid}`);
const chrome = spawn(CHROME, [
  '--headless', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  `--window-size=${SIZE}`, pageUrlFor(jobs[0]),
], { stdio: 'ignore' });

const killTree = () => { try { execSync(`taskkill /PID ${chrome.pid} /T /F`, { stdio: 'ignore' }); } catch {} };
process.on('exit', killTree);
process.on('SIGINT', () => process.exit(130));

// hard watchdog: whatever happens, this process (and the browser) ends
const deadline = setTimeout(() => {
  console.error('shot.js: watchdog timeout — killing browser');
  process.exit(2);
}, 60_000 + jobs.length * 90_000);
deadline.unref?.();

async function target(matchUrl) {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && (!matchUrl || t.url.startsWith(matchUrl)));
      if (page) return page;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('no page target' + (matchUrl ? ` for ${matchUrl}` : ''));
}

async function evalInPage(page, expr) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws connect failed')); });
  try {
    return await new Promise((res, rej) => {
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id !== 1) return;
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else if (m.result && m.result.exceptionDetails) rej(new Error(JSON.stringify(m.result.exceptionDetails)));
        else res(m.result && m.result.result && m.result.result.value);
      };
      ws.send(J({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    });
  } finally { ws.close(); }
}

// ---- the two page recipes ---------------------------------------------
const kitExpr = (kit, view) => `(async () => {
  for (let i = 0; i < 200 && !window.kp; i++) await new Promise(r => setTimeout(r, 100));
  if (!window.kp) return 'ERR: kit-preview never exposed window.kp';
  kp.solo(${J(view || kit)});
  kp.view(${J(view || kit)});
  kp.step(2);
  return kp.renderer.domElement.toDataURL('image/jpeg', 0.9);
})()`;

const caseExpr = (target) => `(async () => {
  for (let i = 0; i < 300 && !(window.gate && window.gate.state); i++) await new Promise(r => setTimeout(r, 100));
  if (!window.gate) return 'ERR: app never exposed window.gate';
  if (location.hash !== '#' + ${J(String(target))}) location.hash = '#' + ${J(String(target))};
  let s, settledRuns = 0;
  for (let i = 0; i < 150; i++) {
    window.gate.step(60);                      // rAF is paused headless; dissolves only advance in step()
    await new Promise(r => setTimeout(r, 0));  // yield so each await stage's microtasks flush
    s = window.gate.state();
    const settled = s.reading && s.reading.slug
      && s.freeze && s.freeze.active === false && s.dissolveT === 1
      && location.hash === '#' + ${J(String(target))};
    settledRuns = settled ? settledRuns + 1 : 0;
    if (settledRuns >= 3 && i > 6) break;      // stable for a few rounds, not a mid-cut frame
  }
  if (!settledRuns) return 'ERR: never settled, hash=' + location.hash + ' slug=' + (s && s.reading && s.reading.slug);
  window.gate.step(2);                         // render + capture in the SAME evaluate: the GL buffer
  return document.querySelector('canvas').toDataURL('image/jpeg', 0.9);  // is not preserved across round-trips
})()`;

// ---- run --------------------------------------------------------------
let lastUrl = pageUrlFor(jobs[0]);
let failures = 0;
try {
  for (const job of jobs) {
    const url = pageUrlFor(job);
    let page = await target(BASE);
    if (url !== lastUrl) {
      await evalInPage(page, `location.href = ${J(url)}; 'nav'`);
      await new Promise((r) => setTimeout(r, 800));
      page = await target(url);
      lastUrl = url;
    }
    const expr = job.kit ? kitExpr(job.kit, job.view) : job.case ? caseExpr(job.case) : job.expr;
    const t0 = Date.now();
    // the fresh tab is still navigating when the target first appears, and an
    // evaluate started then dies with "Execution context was destroyed" —
    // settle and retry rather than racing the load
    let data;
    for (let attempt = 0; ; attempt++) {
      try {
        data = await evalInPage(page, expr);
        break;
      } catch (e) {
        if (attempt >= 5 || !/context was destroyed|ws connect failed/i.test(String(e))) throw e;
        await new Promise((r) => setTimeout(r, 600));
        page = await target(url === lastUrl ? BASE : url);
      }
    }
    if (typeof data !== 'string' || !data.startsWith('data:image/')) {
      console.error(`FAIL ${job.out}: ${String(data).slice(0, 200)}`);
      failures++;
      continue;
    }
    const file = path.join(ROOT, 'shots', `${job.out}.jpeg`);
    await writeFile(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
    console.log(`shots/${job.out}.jpeg  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
} finally {
  killTree();
  server.close();
}
process.exit(failures ? 1 : 0);
