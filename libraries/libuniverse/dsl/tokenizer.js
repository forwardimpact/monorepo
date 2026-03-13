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
]);

const DATE_RE = /^\d{4}-\d{2}$/;

/**
 * @typedef {{ type: string, value: string, line: number }} Token
 */

/**
 * Tokenize DSL source into a token stream.
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;

  while (i < source.length) {
    // Skip whitespace
    if (source[i] === " " || source[i] === "\t" || source[i] === "\r") {
      i++;
      continue;
    }

    // Newline
    if (source[i] === "\n") {
      line++;
      i++;
      continue;
    }

    // Single-line comment
    if (source[i] === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // Multi-line comment
    if (source[i] === "/" && source[i + 1] === "*") {
      i += 2;
      while (
        i < source.length - 1 &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2;
      continue;
    }

    // String literal
    if (source[i] === '"') {
      i++;
      let str = "";
      while (i < source.length && source[i] !== '"') {
        if (source[i] === "\\" && i + 1 < source.length) {
          i++;
          if (source[i] === "n") str += "\n";
          else if (source[i] === "t") str += "\t";
          else str += source[i];
        } else {
          str += source[i];
        }
        i++;
      }
      i++; // closing quote
      tokens.push({ type: "STRING", value: str, line });
      continue;
    }

    // Braces and brackets
    if (source[i] === "{") {
      tokens.push({ type: "LBRACE", value: "{", line });
      i++;
      continue;
    }
    if (source[i] === "}") {
      tokens.push({ type: "RBRACE", value: "}", line });
      i++;
      continue;
    }
    if (source[i] === "[") {
      tokens.push({ type: "LBRACKET", value: "[", line });
      i++;
      continue;
    }
    if (source[i] === "]") {
      tokens.push({ type: "RBRACKET", value: "]", line });
      i++;
      continue;
    }
    if (source[i] === ",") {
      tokens.push({ type: "COMMA", value: ",", line });
      i++;
      continue;
    }

    // @identifier
    if (source[i] === "@") {
      i++;
      let name = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        name += source[i];
        i++;
      }
      tokens.push({ type: "AT_IDENT", value: name, line });
      continue;
    }

    // Number, percent, date, or negative number
    if (/[\d-]/.test(source[i])) {
      let num = "";
      if (source[i] === "-") {
        num += "-";
        i++;
      }
      while (i < source.length && /[\d.]/.test(source[i])) {
        num += source[i];
        i++;
      }
      // Check for date (YYYY-MM)
      if (source[i] === "-" && /^\d{4}$/.test(num)) {
        num += "-";
        i++;
        while (i < source.length && /\d/.test(source[i])) {
          num += source[i];
          i++;
        }
        if (DATE_RE.test(num)) {
          tokens.push({ type: "DATE", value: num, line });
          continue;
        }
      }
      // Check for percent
      if (source[i] === "%") {
        tokens.push({ type: "PERCENT", value: num, line });
        i++;
        continue;
      }
      tokens.push({ type: "NUMBER", value: num, line });
      continue;
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(source[i])) {
      let word = "";
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) {
        word += source[i];
        i++;
      }
      if (KEYWORDS.has(word)) {
        tokens.push({ type: "KEYWORD", value: word, line });
      } else {
        tokens.push({ type: "IDENT", value: word, line });
      }
      continue;
    }

    throw new Error(`Unexpected character '${source[i]}' at line ${line}`);
  }

  tokens.push({ type: "EOF", value: "", line });
  return tokens;
}
