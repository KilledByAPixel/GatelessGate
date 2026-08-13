// The book's one hard render budget, in a module of its own so the debug
// workbench (which shows it live) and the staging net (which enforces it
// statically over every case) read the same number instead of each keeping
// a copy. From the design doc: < 150 draw calls per scene — one draw per
// visible mesh, instanced fields one call however many blades they carry.
// There is no pinned triangle or fps budget; draws are the number that
// decides.
export const DRAW_BUDGET = 150;
// The workbench turns its readout amber here. NOT "nearly over budget" — it is
// a long way under 150, on purpose.
//
// 150 was set when the inverted-hull outlines shipped: every mesh drew twice,
// itself and its back-face shell, so the ceiling was really "75 meshes." The
// hulls are gone (the depth-edge pass in render/post.js is the only edge system
// now) and a mesh costs one draw, which halved every case at a stroke. The book
// runs 40-75 today, max case 29, median 61 — so at 135 the amber could never
// show and the readout said nothing.
//
// 150 stays as the ceiling because it is a HARDWARE number: the GPU does not
// care whether a draw was a hull or a monk, and 150 draws is still what the
// frame can afford. What changed is that the same 150 now buys twice the scene,
// and that headroom is meant to be SPENT on detail rather than banked — adding
// more is the whole reason it was won. So the warning sits where a case has
// roughly doubled its current weight — heavy enough to be worth a look, with
// room left to keep going.
export const DRAW_WARN = 100;
