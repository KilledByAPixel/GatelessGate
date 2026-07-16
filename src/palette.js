// The entire M0 palette. Ink on paper, one accent.
export const PAPER = '#F3EDDF';
export const INK = '#1E1E24';
export const GRAY_DARK = '#55555E';
export const GRAY_LIGHT = '#9A9AA3';
export const ACCENT = '#C73E3A'; // case 29 vermillion — the flag, nothing else

export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
