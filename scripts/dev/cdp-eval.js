// Evaluate a JS expression in a headless Chrome page over the DevTools
// protocol. Companion to shot-server.js for driving dev/kit-preview.html and
// the app itself without a visible window.
//
//   node scripts/dev/cdp-eval.js <debug-port> "<expression>"
//
// The expression runs with awaitPromise, so `(async () => {...})()` works.
// IMPORTANT for screenshots: the WebGL back buffer is not preserved between
// protocol round-trips, so a step/render and its canvas capture must happen
// inside ONE call to this script — never step in one call and shoot in the
// next, or the frame comes back black.
//
// Needs Node 22+ (global fetch + WebSocket).
const [, , port, ...exprParts] = process.argv;
const expr = exprParts.join(' ');
if (!port || !expr) {
  console.error('usage: node scripts/dev/cdp-eval.js <port> "<expression>"');
  process.exit(1);
}

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target on port ' + port);
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws connect failed')); });

const result = await new Promise((res, rej) => {
  const timer = setTimeout(() => rej(new Error('evaluate timed out')), 120000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id === 1) { clearTimeout(timer); res(m.result); }
  };
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: expr, awaitPromise: true, returnByValue: true },
  }));
});

ws.close();
if (result.exceptionDetails) {
  console.error(JSON.stringify(result.exceptionDetails, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result.result && result.result.value !== undefined ? result.result.value : result.result, null, 2));
