// The enumeration-drift grammar: source probes (fs-glob, md-table), the
// list/count value extractors, and the fenced-block consumer parser. These are
// the reusable mechanics the invariant kit injects as `kit.enumDrift`; they
// carry no policy. Filesystem access is passed in (`fsSync`) rather than
// imported, so this module stays clean under the repo's ambient-deps invariant;
// the orchestration that binds them lives in enum-drift.js.

import { isAbsolute, join } from "node:path";

export const VALID_PROPERTIES = new Set(["count", "list"]);

/** Reject a pattern/file that escapes `root` (absolute or `..`); else null.
 *
 * @param {string} pattern - A repo-relative source pattern or file path.
 * @returns {string|null} An error message, or null when contained.
 */
export function checkContainment(pattern) {
  if (typeof pattern !== "string" || pattern === "") {
    return "missing or empty pattern";
  }
  if (isAbsolute(pattern)) return `absolute path not allowed: ${pattern}`;
  if (pattern.split("/").includes("..")) {
    return `path escapes the repo root: ${pattern}`;
  }
  return null;
}

// --- fs-glob probe ---------------------------------------------------------

/** Compile one path segment (e.g. `kata-*`) to a line-anchored, safe regex.
 *
 * @param {string} segment - A single glob path segment.
 * @returns {RegExp} An anchored matcher for one path component.
 */
export function segmentToRegExp(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, "[^/]+")}$`);
}

/** Derive an identifier from a matched path per the registry `id` rule.
 *
 * @param {string} relPath - The matched path, repo-relative.
 * @param {"dirname"|"basename"|"basename-noext"} id - Derivation rule.
 * @returns {string} The derived identifier.
 */
export function deriveId(relPath, id) {
  const parts = relPath.split("/");
  const base = parts[parts.length - 1];
  if (id === "dirname") return parts[parts.length - 2] ?? base;
  if (id === "basename-noext") return base.replace(/\.[^.]+$/, "");
  return base;
}

/** Split a glob into its fixed (non-glob) prefix segments and its glob tail. */
function splitGlob(pattern) {
  const segments = pattern.split("/");
  let i = 0;
  while (i < segments.length && !segments[i].includes("*")) i += 1;
  return { fixed: segments.slice(0, i), tail: segments.slice(i) };
}

/** Walk `tail`-deep below `dir`, matching each level, collecting ids. */
function walkGlob(dir, tail, fixed, relParts, id, excludeSet, ids, fsSync) {
  if (relParts.length === tail.length) {
    const base = relParts[relParts.length - 1];
    if (!excludeSet.has(base)) {
      ids.add(deriveId([...fixed, ...relParts].join("/"), id));
    }
    return;
  }
  const matcher = segmentToRegExp(tail[relParts.length]);
  const isLast = relParts.length === tail.length - 1;
  let entries;
  try {
    entries = fsSync.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!matcher.test(entry)) continue;
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = fsSync.statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isLast && !isDir) continue;
    walkGlob(
      full,
      tail,
      fixed,
      [...relParts, entry],
      id,
      excludeSet,
      ids,
      fsSync,
    );
  }
}

/** Probe a fs-glob source into a Set of identifiers.
 *
 * @param {{ pattern: string, id?: string, exclude?: string[] }} source
 * @param {string} root - Repository root.
 * @param {{ existsSync: Function, readdirSync: Function, statSync: Function }} fsSync
 * @returns {Set<string>}
 */
export function probeFsGlob(source, root, fsSync) {
  const { pattern, id = "basename", exclude = [] } = source;
  const { fixed, tail } = splitGlob(pattern);
  const baseDir = join(root, ...fixed);
  const ids = new Set();
  if (!fsSync.existsSync(baseDir)) return ids;
  walkGlob(baseDir, tail, fixed, [], id, new Set(exclude), ids, fsSync);
  return ids;
}

// --- md-table probe --------------------------------------------------------

/**
 * Reduce a composite-action cell to its bare slug. Unwraps a leading
 * `[text](url)` markdown link to its link text, then drops backticks, the
 * `forwardimpact/` scope, and a trailing `@version`.
 *
 * @param {string} cell - A raw table cell.
 * @returns {string} The bare slug.
 */
export function bareSlug(cell) {
  const trimmed = cell.trim();
  const link = trimmed.match(/^\[([^\]]+)\]\([^)]*\)/);
  return (link ? link[1] : trimmed)
    .trim()
    .replace(/^`+|`+$/g, "")
    .trim()
    .replace(/^forwardimpact\//, "")
    .replace(/@[^\s`]+$/, "")
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split a GFM table row `| a | b |` into cells, or null when not a row.
 *
 * @param {string} line - One source line.
 * @returns {string[]|null} Trimmed cells, or null when the line is not a row.
 */
export function parseTableRow(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  return t
    .replace(/^\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

// The table rows under a `## <section>` heading, up to the next heading,
// skipping fenced-code regions. Returns parsed cell-arrays (header included).
function sectionTableRows(lines, section) {
  const headingRe = new RegExp(`^#{1,6}\\s+${escapeRegExp(section)}\\s*$`);
  let i = lines.findIndex((l) => headingRe.test(l));
  if (i < 0) return [];
  const rows = [];
  let inFence = false;
  for (i += 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) break;
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
    } else if (!inFence) {
      const cells = parseTableRow(line);
      if (cells) rows.push(cells);
    }
  }
  return rows;
}

/** Probe a md-table source: filtered column cells under a section heading.
 *
 * @param {{ file: string, section: string, column: string, filter: string }} source
 * @param {string} root - Repository root.
 * @param {{ readFileSync: Function }} fsSync
 * @returns {Set<string>}
 */
export function probeMdTable(source, root, fsSync) {
  const { file, section, column, filter } = source;
  const lines = fsSync.readFileSync(join(root, file), "utf8").split("\n");
  const rows = sectionTableRows(lines, section);
  if (rows.length === 0) return new Set();
  const filterRe = new RegExp(filter);
  const columnIndex = rows[0].findIndex((h) => h === column);
  const out = new Set();
  if (columnIndex < 0) return out;
  for (const cells of rows.slice(1)) {
    const raw = (cells[columnIndex] ?? "").trim();
    if (raw === "" || /^[-:\s]+$/.test(raw)) continue;
    if (filterRe.test(raw.replace(/^`+|`+$/g, ""))) out.add(bareSlug(raw));
  }
  return out;
}

/** Resolve a topic's source to `{set}` or `{error}`.
 *
 * @param {{ type?: string }} source - A topic `source` descriptor.
 * @param {string} root - Repository root.
 * @param {object} [fsSync] - Sync filesystem surface (unused on error paths).
 * @returns {{ set: Set<string> }|{ error: string }}
 */
export function probeSource(source, root, fsSync) {
  if (!source || typeof source.type !== "string") {
    return { error: "source missing `type`" };
  }
  if (source.type !== "fs-glob" && source.type !== "md-table") {
    return { error: `unknown source type \`${source.type}\`` };
  }
  const target = source.type === "md-table" ? source.file : source.pattern;
  const bad = checkContainment(target);
  if (bad) return { error: bad };
  try {
    return {
      set:
        source.type === "fs-glob"
          ? probeFsGlob(source, root, fsSync)
          : probeMdTable(source, root, fsSync),
    };
  } catch (err) {
    return { error: `${source.type} probe failed: ${err.message}` };
  }
}

// --- value extraction ------------------------------------------------------

const WORD_NUMBERS = buildWordNumbers();

function buildWordNumbers() {
  const ones = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
    "twenty",
  ];
  const out = {};
  ones.forEach((w, n) => {
    out[w] = n;
  });
  out.thirty = 30;
  out.forty = 40;
  out.fifty = 50;
  return out;
}

/** Every count in a span, in source order (digits + English word-numbers).
 *
 * @param {string} span - The text to scan.
 * @returns {number[]} Counts in source order.
 */
export function extractCounts(span) {
  const matches = [];
  let m;
  const intRe = /\b\d+\b/g;
  while ((m = intRe.exec(span)) !== null) {
    matches.push({ pos: m.index, value: Number(m[0]) });
  }
  const wordRe = new RegExp(
    `\\b(${Object.keys(WORD_NUMBERS).join("|")})\\b`,
    "gi",
  );
  while ((m = wordRe.exec(span)) !== null) {
    matches.push({ pos: m.index, value: WORD_NUMBERS[m[1].toLowerCase()] });
  }
  return matches.sort((a, b) => a.pos - b.pos).map((x) => x.value);
}

/** The first count in a span, or null.
 *
 * @param {string} span - The text to scan.
 * @returns {number|null}
 */
export function extractCount(span) {
  const all = extractCounts(span);
  return all.length === 0 ? null : all[0];
}

function firstToken(s) {
  return s.trim().split(/\s+/)[0] ?? "";
}

/** Normalize a list token to its comparison form (slug, no slash, lowercase).
 *
 * @param {string} raw - A raw list token.
 * @returns {string} The normalized identifier.
 */
export function normalizeToken(raw) {
  let s = (raw ?? "").trim();
  if (s === "") return "";
  const link = s.match(/^\[([^\]]+)\]\([^)]*\)/);
  if (link) s = link[1];
  return s
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/`/g, "")
    .replace(/^forwardimpact\//, "")
    .replace(/@[^\s/]+$/, "")
    .replace(/\/+$/, "")
    .replace(/[.,;:]+$/, "")
    .trim()
    .toLowerCase();
}

function tokensToSet(tokens) {
  const ids = new Set();
  for (const tok of tokens) {
    const id = normalizeToken(tok);
    if (id) ids.add(id);
  }
  return ids;
}

function matchAll(span, re) {
  const out = [];
  let m;
  while ((m = re.exec(span)) !== null) out.push(...m[1].split(","));
  return out;
}

function bulletTokens(lines) {
  const out = [];
  for (const line of lines) {
    const b = line.trim().match(/^[-*+]\s+(.*)$/);
    if (b) out.push(firstToken(b[1]));
  }
  return out;
}

// First non-empty cell of each GFM data row, dropping the header (the row right
// before the `|---|` alignment row).
function tableIds(lines) {
  const rows = [];
  let alignmentAt = -1;
  let sawTable = false;
  for (const line of lines) {
    const cells = parseTableRow(line);
    if (!cells) continue;
    sawTable = true;
    if (/^[\s|:-]+$/.test(line.trim()) && line.includes("-")) {
      alignmentAt = rows.length;
    } else {
      rows.push(cells);
    }
  }
  if (!sawTable) return null;
  const ids = new Set();
  rows.forEach((cells, idx) => {
    if (idx === alignmentAt - 1) return;
    const first = cells.find((c) => c !== "");
    if (first && /[`a-z]/i.test(first)) {
      const id = normalizeToken(first);
      if (id) ids.add(id);
    }
  });
  return ids;
}

// ASCII-tree leaf `name/  desc` — the trailing slash distinguishes a directory
// leaf from a prose sentence whose first word is capitalized.
function treeIds(lines) {
  const ids = new Set();
  for (const line of lines) {
    const leaf = line.trim().match(/^([A-Za-z0-9._-]+)\/(\s|$|#|—|-)/);
    if (leaf && /[A-Za-z]/.test(leaf[1])) {
      const id = normalizeToken(leaf[1]);
      if (id) ids.add(id);
    }
  }
  return ids;
}

// A bare comma/space-separated run of inline code spans and nothing else, e.g.
// `a`, `b`, `c`. Returns the code-span tokens, or null when the span carries
// any other text (prose, a bullet marker, an item description). That ambiguity
// — commas inside a description versus commas between items — is exactly what
// the bracketed shapes resolve, so this fires only when the whole span is code
// spans plus separators, and needs at least two so a lone token is not a list.
function inlineCodeSpanList(span) {
  const t = span.trim();
  const spans = t.match(/`[^`]+`/g);
  if (!spans || spans.length < 2) return null;
  const residue = t.replace(/`[^`]+`/g, "").replace(/[\s,]+/g, "");
  return residue === "" ? spans : null;
}

/**
 * Identifier set from a list-shaped span. Precedence: brace expansion, bullets,
 * a bare comma/space-separated run of code spans, GFM table, ASCII tree, then a
 * parenthetical comma-list (last resort, since a bullet/tree leaf often carries
 * a parenthetical aside whose commas are prose).
 *
 * @param {string} span - The fenced body to read.
 * @returns {Set<string>} The normalized identifier set.
 */
export function extractList(span) {
  const lines = span.split("\n");
  const brace = matchAll(span, /\{([^{}]+)\}/g);
  if (brace.length > 0) return tokensToSet(brace);
  const bullets = bulletTokens(lines);
  if (bullets.length > 0) return tokensToSet(bullets);
  const codeSpans = inlineCodeSpanList(span);
  if (codeSpans) return tokensToSet(codeSpans);
  const table = tableIds(lines);
  if (table) return table;
  const tree = treeIds(lines);
  if (tree.size > 0) return tree;
  const paren = matchAll(span, /\(([^()]*,[^()]*)\)/g);
  return tokensToSet(paren);
}

// --- consumer parser -------------------------------------------------------

const OPEN_RE = /^\s*<!--\s*(enum:[^>]*?)\s*-->\s*$/;
const CLOSE_RE = /^\s*<!--\s*\/enum\s*-->\s*$/;
const CLAIM_RE = /^enum:([a-z0-9-]+):([a-z]+)$/;

// Inline single-line fence: open + body + close on one line (counts embedded in
// prose). A fresh regex per call keeps no global `lastIndex` between lines.
function inlineFenceRe() {
  return /<!--\s*(enum:[^>]*?)\s*-->(.*?)<!--\s*\/enum\s*-->/g;
}

function splitClaims(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = tok.match(CLAIM_RE);
      return m ? { topic: m[1], property: m[2] } : { bad: tok };
    });
}

function countRecord(topic, value, lineNo) {
  return {
    topic,
    property: "count",
    observed: value,
    lineNo,
    malformed: value === null ? "count span has no number" : undefined,
  };
}

// Expand one fence (raw claim string + body span) into per-claim records.
function spanRecords(raw, span, lineNo) {
  const counts = extractCounts(span);
  let countIndex = 0;
  const records = [];
  for (const c of splitClaims(raw)) {
    if (c.bad !== undefined) {
      records.push({ lineNo, malformed: `bad claim token \`${c.bad}\`` });
    } else if (!VALID_PROPERTIES.has(c.property)) {
      records.push({
        topic: c.topic,
        property: c.property,
        lineNo,
        malformed: `unknown property \`${c.property}\``,
      });
    } else if (c.property === "count") {
      const value = countIndex < counts.length ? counts[countIndex] : null;
      countIndex += 1;
      records.push(countRecord(c.topic, value, lineNo));
    } else {
      records.push({
        topic: c.topic,
        property: "list",
        observed: extractList(span),
        lineNo,
      });
    }
  }
  return records;
}

const isCodeFence = (line) => /^\s*(```|~~~)/.test(line);

// Outside an enum span: toggle top-level code-fence state, emit any inline
// fences, and open a multi-line span. Returns the new `open` state (or null).
function scanOutside(line, lineNo, st, records) {
  if (isCodeFence(line)) {
    st.inFence = !st.inFence;
    return null;
  }
  if (st.inFence) return null;
  let sawInline = false;
  for (const im of line.matchAll(inlineFenceRe())) {
    sawInline = true;
    records.push(...spanRecords(im[1], im[2], lineNo));
  }
  const om = sawInline ? null : line.match(OPEN_RE);
  return om ? { raw: om[1], body: [], lineNo } : null;
}

// Inside an enum span: a span may enclose a code block, so a close marker only
// finalizes when we are not within an enclosed fence. Returns the `open` state
// (cleared to null when the span closes).
function scanInside(line, st, open, records) {
  if (isCodeFence(line)) {
    st.enclosed = !st.enclosed;
    open.body.push(line);
  } else if (!st.enclosed && CLOSE_RE.test(line)) {
    records.push(...spanRecords(open.raw, open.body.join("\n"), open.lineNo));
    return null;
  } else {
    open.body.push(line);
  }
  return open;
}

function unclosedRecords(open, records) {
  for (const c of splitClaims(open.raw)) {
    records.push({
      topic: c.topic ?? null,
      property: c.property ?? null,
      lineNo: open.lineNo,
      malformed: "unclosed fence (no <!-- /enum -->)",
    });
  }
}

/**
 * Scan a consumer's text for enum fences outside top-level code blocks (a span
 * may itself enclose a code block). Returns one record per enum:TOPIC:PROPERTY.
 *
 * @param {string} text - The consumer file's text.
 * @returns {Array<object>} Per-claim records.
 */
export function parseConsumer(text) {
  const lines = text.split("\n");
  const records = [];
  const st = { inFence: false, enclosed: false };
  let open = null;
  for (let n = 0; n < lines.length; n += 1) {
    open =
      open === null
        ? scanOutside(lines[n], n + 1, st, records)
        : scanInside(lines[n], st, open, records);
  }
  if (open !== null) unclosedRecords(open, records);
  return records;
}
