const FIELD_CAP = 200;
const ELLIPSIS = "…";
const ZERO_WIDTH_SPACE = "\u200b";

// Replace every newline, control character, or whitespace code point with a
// single space. Then collapse runs. This function inspects each code point and
// does not use a character-class range. So it never folds a literal hyphen
// into a range, and hyphenated identifiers ("staff-engineer", "dick-olsson")
// survive intact.
function flattenWhitespace(input) {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0);
    const isControl = code <= 0x1f || code === 0x7f;
    const isSpace = /\s/.test(ch);
    out += isControl || isSpace ? " " : ch;
  }
  return out.replace(/ {2,}/g, " ");
}

/**
 * Neutralize an anyone-editable issue-tracker field before it crosses into a
 * boot-readable wiki surface. Flattens newlines, control characters, and
 * whitespace to single spaces. A multi-line value would let a field inject a
 * heading or block marker and move section boundaries. Escapes a leading
 * protocol sigil ("[" or "<") so "[ask#N]", "<tag>", and HTML-comment
 * lookalikes render inert. Length-caps the result.
 * @param {string|null|undefined} value
 * @param {number} [maxLen]
 * @returns {string}
 */
export function sanitizeCrossingField(value, maxLen = FIELD_CAP) {
  if (value == null) return "";
  let s = flattenWhitespace(String(value)).trim();
  s = s.replace(/^\[/, "\\[").replace(/^</, "\\<");
  if (s.length > maxLen) s = s.slice(0, maxLen - 1) + ELLIPSIS;
  return s;
}

/**
 * Sanitize a materialized item title. Beyond {@link sanitizeCrossingField}, it
 * defuses the literal author-suffix token " (by ". It inserts a zero-width
 * space after "(by". A title then never looks like the trailing
 * "(by <author>)" provenance suffix when the boot parse reads the line back.
 * @param {string|null|undefined} value
 * @param {number} [maxLen]
 * @returns {string}
 */
export function sanitizeTitle(value, maxLen = FIELD_CAP) {
  return sanitizeCrossingField(value, maxLen).replace(
    / \(by /g,
    " (by" + ZERO_WIDTH_SPACE + " ",
  );
}
