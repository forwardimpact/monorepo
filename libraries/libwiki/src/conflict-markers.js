// Structural detector for unresolved git conflict markers, shared by the wiki
// audit's `conflict.markers` rule (audit/conflict-markers-rule.js) and the
// WikiSync pre-push guard (wiki-sync.js). One home so the two layers cannot
// drift on what counts as a marker.
//
// Detection is line-anchored and structural, not a naive grep, so it does not
// fire on markers legitimately quoted in prose:
//
// - Open (`<<<<<<<`) and close (`>>>>>>>`) marker lines fire UNCONDITIONALLY,
//   per file. A seal rotation can sever one conflict block across two sealed
//   files (the open in one, the separator + close in the other); a
//   complete-in-file-block matcher would miss both, so each marker form stands
//   alone. The single-space-or-end-of-line guard after the 7-char run admits
//   the stash-pop label forms (`<<<<<<< Updated upstream`,
//   `>>>>>>> Stashed changes`) and the branch/sha label forms while rejecting
//   longer `<`/`>` runs.
// - The separator (`=======`) fires ONLY while a conflict block is open in the
//   same file (block-conditioned). A lone separator with no open above it is
//   indistinguishable from a setext-heading underline and is a deliberate
//   accepted non-detection.
// - In a `fenceExempt` (prose) surface, occurrences inside a fenced code block
//   are suppressed — a fence quotes content. Markers quoted in a backtick code
//   SPAN are handled by the column-1 anchor itself: a span sits mid-line, so
//   `^` never matches. STATUS.md and non-markdown push targets pass
//   `fenceExempt:false`: their fenced rows are data, where a marker is never
//   legitimate, so fence state never suppresses.

const OPEN_RE = /^<{7}( |$)/;
const CLOSE_RE = /^>{7}( |$)/;
const SEPARATOR_RE = /^={7}\s*$/;
// A fenced-code delimiter: three or more backticks or tildes, up to three
// leading spaces of indentation (CommonMark). The info string after the run is
// ignored — a delimiter line is never itself a marker.
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

/**
 * Scan `text` for unresolved git conflict markers.
 *
 * @param {string} text - The file (or diff-added) content to scan.
 * @param {object} [options]
 * @param {boolean} [options.fenceExempt=true] - When true, suppress markers
 *   inside fenced code blocks (prose surfaces). When false, fence state never
 *   suppresses (STATUS.md, non-markdown targets).
 * @returns {Array<{lineNo: number, kind: "open"|"separator"|"close"}>}
 *   One entry per detected marker line, in document order.
 */
export function scanConflictMarkers(text, { fenceExempt = true } = {}) {
  const lines = text.split("\n");
  const hits = [];
  let insideFence = false;
  let openDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    // Strip a trailing CR so a CRLF checkout is matched identically to LF — a
    // bare marker (`<<<<<<<\r`) would otherwise escape the `( |$)` anchor and
    // a CRLF corruption block would publish undetected.
    const line = lines[i].replace(/\r$/, "");
    if (FENCE_RE.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (fenceExempt && insideFence) continue;
    const kind = classify(line, openDepth);
    if (!kind) continue;
    hits.push({ lineNo: i + 1, kind });
    if (kind === "open") openDepth++;
    else if (kind === "close" && openDepth > 0) openDepth--;
  }
  return hits;
}

// Classify a single line as a marker kind, or null. The separator is
// block-conditioned: it only counts while a conflict block is open.
function classify(line, openDepth) {
  if (OPEN_RE.test(line)) return "open";
  if (CLOSE_RE.test(line)) return "close";
  if (openDepth > 0 && SEPARATOR_RE.test(line)) return "separator";
  return null;
}
