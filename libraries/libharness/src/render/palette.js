/**
 * Palette — pure profile-name → ANSI SGR foreground color function.
 *
 * The module assigns a color from a FNV-1a hash of the source name modulo
 * the palette size. So the same name maps to the same color in every
 * process. The module reserves red for tool-result errors. The palette never
 * contains red.
 *
 * Colors use the 24-bit truecolor SGR escape (`ESC[38;2;R;G;Bm`) rather than
 * the 16-color table. GitHub Actions' log viewer and most modern terminals
 * render truecolor as the exact hex requested. This avoids the washed-out
 * mustard/olive tones GHA applies to `ESC[93m` etc. Eight slots cover the
 * largest concurrent cast in any current workflow (five domain agents plus
 * the facilitator) with headroom.
 */

const PALETTE = [
  "\u001b[38;2;79;195;247m", // sky blue    #4FC3F7
  "\u001b[38;2;129;199;132m", // bright green #81C784
  "\u001b[38;2;255;202;40m", // amber       #FFCA28
  "\u001b[38;2;236;64;122m", // magenta     #EC407A
  "\u001b[38;2;38;198;218m", // cyan        #26C6DA
  "\u001b[38;2;186;104;200m", // lavender    #BA68C8
  "\u001b[38;2;255;167;38m", // orange      #FFA726
  "\u001b[38;2;66;165;245m", // blue        #42A5F5
];

/** 24-bit SGR foreground code reserved for tool-result errors (#F14C4C). */
export const ERROR_COLOR = "\u001b[38;2;241;76;76m";

/** ANSI SGR reset sequence. */
export const RESET = "\u001b[0m";

/**
 * Map a source name to a stable ANSI foreground color.
 *
 * This function is pure. A FNV-1a 32-bit hash of the name decides the color.
 * The same name gives the same color on every call, in every process.
 * Returns `RESET` for absent or empty names so callers never emit a stray
 * escape.
 *
 * @param {string|null|undefined} name
 * @returns {string} ANSI SGR escape, never equal to `ERROR_COLOR`
 */
export function colorForSource(name) {
  if (!name) return RESET;
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Length mixer. It reduces FNV's intrinsic birthday collisions on short
  // names with shared affixes (e.g. `staff-engineer`/`facilitator`).
  h ^= name.length;
  h = Math.imul(h, 0x01000193) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Expose the palette size so tests can assert distinctness on the full set.
 * @returns {number}
 */
export function paletteSize() {
  return PALETTE.length;
}
