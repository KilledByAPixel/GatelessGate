// The book's one hard render budget, in a module of its own so the debug
// workbench (which shows it live) and the staging net (which enforces it
// statically over every case) read the same number instead of each keeping
// a copy. From the design doc: < 150 draw calls per scene — outlines double
// every mesh that takes one, instanced fields are one call however many
// blades they carry. There is no pinned triangle or fps budget; draws are
// the number that decides.
export const DRAW_BUDGET = 150;
// The workbench turns its readout amber here — close enough that the next
// prop or its outline could tip the scene over.
export const DRAW_WARN = 135;
