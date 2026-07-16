# The Gateless Gate

An interactive sumi-e reading of the Mumonkan, in the browser. Working title.

Currently: **M0 look-dev scene** — validating the ink-and-paper art direction.
Design doc: `docs/gateless-gate-design-doc.md`.

## Run

    npx -y http-server -p 8105 -c-1 .

Then visit http://localhost:8105

## Develop

- `npm test` — runs `node --test` over `tests/` (Node 20+)
- `window.gate` — headless hooks: `step(n)` (advance n fixed 60 Hz ticks + render),
  `state()` (`{ simTime, drawCalls, triangles, fps, clothEnergy, dissolveT, camera }`),
  `dissolve('in'|'out', seconds?)` (returns a Promise)
- Deterministic sim: seeded noise everywhere, no `Math.random` — same steps, same state
- Screenshots while the preview panel is hidden: run `node scripts/dev/shot-server.js`
  (port 8106; also available as workspace launch config `gate-shots`), then POST a
  `canvas.toDataURL(...)` string to `http://localhost:8106/<name>` — files land in
  `shots/` (gitignored)
- Three.js is vendored in `lib/` (see `lib/THREE_VERSION.txt`). No build step.
