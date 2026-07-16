# The Gateless Gate

An interactive sumi-e reading of the Mumonkan, in the browser. Working title.

Currently: **M0 look-dev scene** — validating the ink-and-paper art direction.
Design doc: `docs/gateless-gate-design-doc.md`.

## Run

    npx serve -l 8103 .

Then visit http://localhost:8103

## Develop

- `npm test` — runs `node --test` over `tests/` (Node 20+)
- Three.js is vendored in `lib/` (see `lib/THREE_VERSION.txt`). No build step.
