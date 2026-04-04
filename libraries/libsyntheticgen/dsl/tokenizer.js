/**
 * DSL Tokenizer — converts universe DSL source to token stream.
 *
 * Token types:
 *   KEYWORD   - reserved words (universe, department, team, etc.)
 *   IDENT     - identifiers (variable / entity names)
 *   STRING    - double-quoted string literals
 *   NUMBER    - integer or decimal numbers
 *   PERCENT   - number followed by %
 *   DATE      - YYYY-MM format
 *   AT_IDENT  - @name references
 *   LBRACE    - {
 *   RBRACE    - }
 *   LBRACKET  - [
 *   RBRACKET  - ]
 *   COMMA     - ,
 *   EOF       - end of input
 */

const KEYWORDS = new Set([
  "universe",
  "domain",
  "industry",
  "seed",
  "org",
  "department",
  "team",
  "name",
  "location",
  "parent",
  "headcount",
  "size",
  "manager",
  "repos",
  "people",
  "count",
  "names",
  "distribution",
  "disciplines",
  "project",
  "type",
  "phase",
  "teams",
  "timeline_start",
  "timeline_end",
  "prose_topic",
  "prose_tone",
  "snapshots",
  "quarterly_from",
  "quarterly_to",
  "account_id",
  "scenario",
  "timerange_start",
  "timerange_end",
  "affect",
  "github_commits",
  "github_prs",
  "dx_drivers",
  "trajectory",
  "magnitude",
  "evidence_skills",
  "evidence_floor",
  "framework",
  "proficiencies",
  "maturities",
  "capabilities",
  "levels",
  "behaviours",
  "drivers",
  "tracks",
  "stages",
  "skills",
  "title",
  "rank",
  "experience",
  "roleTitle",
  "specialization",
  "isProfessional",
  "core",
  "supporting",
  "broad",
  "validTracks",
  "content",
  "articles",
  "article_topics",
  "blogs",
  "faqs",
  "howtos",
  "howto_topics",
  "reviews",
  "comments",
  "courses",
  "events",
  "personas",
  "persona_levels",
  "briefings_per_persona",
  "notes_per_persona",
  "comments_per_snapshot",
  // Dataset and output blocks
  "dataset",
  "tool",
  "population",
  "modules",
  "metadata",
  "data",
  "rows",
  "fields",
  "output",
  "table",
  "path",
  "json",
  "yaml",
  "csv",
  "markdown",
  "parquet",
  "sql",
]);

const DATE_RE = /^\d{4}-\d{2}$/;

const SINGLE_CHAR_TOKENS = {
  "{": "LBRACE",
  "}": "RBRACE",
  "[": "LBRACKET",
  "]": "RBRACKET",
  ",": "COMMA",
};

/**
 * @typedef {{ type: string, value: string, line: number }} Token
 */

/** @param {string} source @param {{ i: number, line: number }} s */
function skipMultiLineComment(source, s) {
  s.i += 2;
  while (
    s.i < source.length - 1 &&
    !(source[s.i] === "*" && source[s.i + 1] === "/")
  ) {
    if (source[s.i] === "\n") s.line++;
    s.i++;
  }
  s.i += 2;
}

/** @param {string} source @param {{ i: number, line: number }} s @returns {string} */
function readStringLiteral(source, s) {
  s.i++; // opening quote
  let str = "";
  while (s.i < source.length && source[s.i] !== '"') {
    if (source[s.i] === "\\" && s.i + 1 < source.length) {
      s.i++;
      if (source[s.i] === "n") str += "\n";
      else if (source[s.i] === "t") str += "\t";
      else str += source[s.i];
    } else {
      str += source[s.i];
    }
    s.i++;
  }
  s.i++; // closing quote
  return str;
}

/** @param {string} source @param {{ i: number, line: number }} s @returns {string} */
function readAtIdentifier(source, s) {
  s.i++; // skip @
  let name = "";
  while (s.i < source.length && /[a-zA-Z0-9_]/.test(source[s.i])) {
    name += source[s.i];
    s.i++;
  }
  return name;
}

/** @param {string} source @param {{ i: number, line: number }} s @returns {{ type: string, value: string }} */
function readNumeric(source, s) {
  let num = "";
  if (source[s.i] === "-") {
    num += "-";
    s.i++;
  }
  while (s.i < source.length && /[\d.]/.test(source[s.i])) {
    num += source[s.i];
    s.i++;
  }
  if (source[s.i] === "-" && /^\d{4}$/.test(num)) {
    num += "-";
    s.i++;
    while (s.i < source.length && /\d/.test(source[s.i])) {
      num += source[s.i];
      s.i++;
    }
    if (DATE_RE.test(num)) return { type: "DATE", value: num };
  }
  if (source[s.i] === "%") {
    s.i++;
    return { type: "PERCENT", value: num };
  }
  return { type: "NUMBER", value: num };
}

/** @param {string} source @param {{ i: number, line: number }} s @returns {{ type: string, value: string }} */
function readWord(source, s) {
  let word = "";
  while (s.i < source.length && /[a-zA-Z0-9_]/.test(source[s.i])) {
    word += source[s.i];
    s.i++;
  }
  return { type: KEYWORDS.has(word) ? "KEYWORD" : "IDENT", value: word };
}

/** @param {string} source @param {{ i: number, line: number }} s @returns {boolean} */
function skipWhitespaceOrComment(source, s) {
  const ch = source[s.i];
  if (ch === " " || ch === "\t" || ch === "\r") {
    s.i++;
    return true;
  }
  if (ch === "\n") {
    s.line++;
    s.i++;
    return true;
  }
  if (ch === "/" && source[s.i + 1] === "/") {
    while (s.i < source.length && source[s.i] !== "\n") s.i++;
    return true;
  }
  if (ch === "/" && source[s.i + 1] === "*") {
    skipMultiLineComment(source, s);
    return true;
  }
  return false;
}

/** @param {string} ch @param {string} source @param {{ i: number, line: number }} s @returns {{ type: string, value: string } | null} */
function readToken(ch, source, s) {
  const singleType = SINGLE_CHAR_TOKENS[ch];
  if (singleType) {
    s.i++;
    return { type: singleType, value: ch };
  }
  if (ch === '"')
    return { type: "STRING", value: readStringLiteral(source, s) };
  if (ch === "@")
    return { type: "AT_IDENT", value: readAtIdentifier(source, s) };
  if (/[\d-]/.test(ch)) return readNumeric(source, s);
  if (/[a-zA-Z_]/.test(ch)) return readWord(source, s);
  return null;
}

/**
 * Tokenize DSL source into a token stream.
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
  const tokens = [];
  const s = { i: 0, line: 1 };

  while (s.i < source.length) {
    if (skipWhitespaceOrComment(source, s)) continue;

    const ch = source[s.i];
    const tok = readToken(ch, source, s);
    if (tok) {
      tokens.push({ type: tok.type, value: tok.value, line: s.line });
      continue;
    }

    throw new Error(`Unexpected character '${ch}' at line ${s.line}`);
  }

  tokens.push({ type: "EOF", value: "", line: s.line });
  return tokens;
}
