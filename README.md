# The Gateless Gate

An interactive sumi-e reading of the Mumonkan, in the browser. Working title.

Currently: **M1 vertical slice** — the interactive book. A skippable gate intro →
a table-of-contents menu of all 49 cases → case 29 complete (ambient two-monk
diorama, full text, narration, subtle wind, tap-the-flag wind toggle, a meditation
timer with a bell), with `read`/`sat` progress in localStorage.
Design doc: `docs/gateless-gate-design-doc.md` (v0.2 — the book model).

## Run

    npx -y http-server -p 8105 -c-1 .

Then visit http://localhost:8105

## Develop

- `npm test` — runs `node --test` over `tests/` (Node 20+)
- `window.gate` — headless hooks: `step(n)`, `state()` (`{ mode, simTime, drawCalls,
  triangles, fps, dissolveT, camera, progress:{read,sat}, koan? }`), `enter(slug)`,
  `exit()`, `menu(open?)`, `skipIntro()`, `dissolve('in'|'out', s?)`, `sit(min)`,
  `endSit()`, `markRead(slug)`, `markSat(slug)`, `setSound(on)`
- Driving async transitions headlessly: the hidden preview panel pauses `requestAnimationFrame`,
  so `await gate.enter(...)` hangs — the dissolve only advances inside `step()`. Fire the call,
  then `step(60)` once per await stage (`loadKoan` → dissolveOut → dissolveIn), yielding between
  batches so microtasks flush.
- Deterministic sim: seeded noise everywhere, no `Math.random` outside `src/audio/**` — same steps, same state
- Regenerate koan text after editing `local/gateless-gate.txt`: `node scripts/build-text.js`
- Screenshots while the preview panel is hidden: run `node scripts/dev/shot-server.js`
  (port 8106; also available as workspace launch config `gate-shots`), then POST a
  `canvas.toDataURL(...)` string to `http://localhost:8106/<name>` — files land in
  `shots/` (gitignored)
- Three.js is vendored in `lib/` (see `lib/THREE_VERSION.txt`). No build step.
