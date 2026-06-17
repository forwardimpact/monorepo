/**
 * Skill-content action-reference extractor.
 *
 * Pure: walks skill files (`[{path, text}]`) and emits a typed `Ref` per
 * reference site, classifying each by its post-`@` token per the design's
 * reference model. No I/O — the caller reads files and passes their text.
 *
 * @typedef {object} RefToken
 * @property {'literal'|'placeholder'|'illustrative'|'none'} kind - Post-`@`
 *   token shape. `none` when the reference carries no `@ref`.
 * @property {string} [value] - The raw token text (absent when `kind` is
 *   `none`).
 * @property {string} [pinTag] - For a SHA-pinned literal written
 *   `@<sha> # vX.Y.Z`, the tag named in the trailing comment. Carries the
 *   internal claim assertion 3 checks (the tag points at this SHA).
 *
 * @typedef {object} Ref
 * @property {string} file - The file path the reference was found in.
 * @property {number} line - 1-based line number of the reference site.
 * @property {'qualified'|'placeholder'|'illustrative'|'contextual-qualified'|'contextual'|'pin'} class
 *   The reference class. `qualified`/`placeholder`/`illustrative` carry an
 *   `owner/repo`; `contextual-qualified` is an `owner/repo` with no `@ref`;
 *   `contextual` is an owner-less `name@ref` or bare action-name mention;
 *   `pin` is a placeholder-resolution table value (`<sha> # <tag>`) bound to a
 *   placeholder name rather than an inline `owner/repo`.
 * @property {string} [owner] - The `owner` segment (absent for owner-less
 *   `contextual` and `pin` tokens).
 * @property {string} repo - The `repo` segment (the action name for
 *   owner-less/bare `contextual` tokens); absent for `pin` tokens.
 * @property {string} [placeholderName] - For a `pin`, the `{{NAME}}` whose
 *   resolution-table row this value sits in; the linter binds the pin's repo
 *   association from the placeholder of the same name.
 * @property {RefToken} refToken - The classified post-`@` token. For a `pin`,
 *   `kind` is `literal`, `value` is the SHA, and `pinTag` is the named tag.
 */

// A `repo`/`owner` segment: alphanumerics plus `.`, `_`, `-`. No slashes.
const SEG = "[A-Za-z0-9._-]+";

// A post-`@` ref token: a `{{PLACEHOLDER}}`, an `<illustrative>` token, or a
// literal tag/branch/sha. Bounded by whitespace, a backtick, or a `)`/`,`
// (prose punctuation around an inline ref), so `{{NAME}}` is captured whole.
const REF = "(\\{\\{[A-Z0-9_]+\\}\\}|<[^>]+>|[A-Za-z0-9._/-]+)";

// Fully-qualified `owner/repo[/path]@ref`, anchored on a token boundary. The
// optional `/path` lets sub-action references (`owner/repo/dir@ref`) match; the
// repo is always the second segment. The `@ref` is optional (covers
// contextual-qualified `owner/repo` with no ref).
const QUALIFIED = new RegExp(
  `(^|[^A-Za-z0-9._/@<-])(${SEG})/(${SEG})(?:/${SEG})*(?:@${REF})?(?=$|[^A-Za-z0-9._/@{<-]|\`)`,
  "g",
);

// Owner-less `name@ref` prose token (no slash), e.g. `kata-action-agent@v1`.
const OWNERLESS = new RegExp(
  `(^|[^A-Za-z0-9._/@<-])(${SEG})@${REF}(?=$|[^A-Za-z0-9._/@{<-]|\`)`,
  "g",
);

// A bare action-name mention in inline code: a backtick-wrapped token that
// looks like an action name (contains a hyphen, e.g. `kata-action-eval`).
const BARE_CODE = /`([A-Za-z0-9._]+-[A-Za-z0-9._-]+)`/g;

// A placeholder-resolution table value: a 40-hex SHA followed by `# <tag>`,
// sitting in a markdown table cell whose first cell names a `{{NAME}}`. Matched
// per line so the row's placeholder name and the pin value are read together.
const PIN_ROW =
  /\{\{([A-Z0-9_]+)\}\}.*?\b([0-9a-f]{40})\b\s*#\s*([A-Za-z0-9._-]+)/;

// A trailing `# <tag>` comment after a SHA-pinned literal `uses:`/inline ref.
const PIN_TAG = /^\s*#\s*([A-Za-z0-9._-]+)/;

// A 40-hex SHA — the literal-pin form whose tag claim assertion 3 checks.
const SHA = /^[0-9a-f]{40}$/;

/**
 * Classify a post-`@` token.
 * @param {string|undefined} token
 * @returns {RefToken}
 */
function classifyToken(token) {
  if (token === undefined) return { kind: "none" };
  if (/^\{\{[A-Z0-9_]+\}\}$/.test(token))
    return { kind: "placeholder", value: token };
  if (/^<.+>$/.test(token)) return { kind: "illustrative", value: token };
  return { kind: "literal", value: token };
}

/**
 * Is this `owner/repo` token a real repository reference, or a non-action form
 * that must be dropped at extraction (npm specifier, fully-schematic token)?
 * Local paths (`./…`, `<name>/action.yml`) never match {@link QUALIFIED}
 * because the owner segment forbids `.`-only or `/`-leading forms below.
 * @param {string} owner
 * @param {string} repo
 * @returns {boolean}
 */
function isRealRepoHalf(owner, repo) {
  // npm scoped specifier: `@forwardimpact/<pkg>` — the leading `@` means the
  // QUALIFIED owner would be empty; guard explicitly on a leading `@` owner.
  if (owner.startsWith("@")) return false;
  // Local path: `./.github/actions/<name>` — the owner is a bare `.` (relative
  // path), never a real GitHub owner.
  if (/^\.+$/.test(owner)) return false;
  // Fully schematic: `<owner>/<repo>` placeholder halves.
  if (owner.startsWith("<") || repo.startsWith("<")) return false;
  // Path strings: `<name>/action.yml` style — repo ending in a file extension.
  if (/\.(ya?ml|js|ts|md)$/.test(repo)) return false;
  return true;
}

/**
 * Map a non-`none` ref-token kind to its qualified reference class.
 * @param {RefToken} refToken
 * @returns {'qualified'|'placeholder'|'illustrative'|'contextual-qualified'}
 */
function qualifiedClass(refToken) {
  if (refToken.kind === "none") return "contextual-qualified";
  if (refToken.kind === "placeholder") return "placeholder";
  if (refToken.kind === "illustrative") return "illustrative";
  return "qualified";
}

/** Does `start` fall inside any already-claimed `[s, e)` span? */
function inSpan(spans, start) {
  return spans.some(([s, e]) => start >= s && start < e);
}

/**
 * Scan one line for qualified `owner/repo[@ref]` references, pushing each onto
 * `refs` and recording its span on `spans`.
 * @param {string} line
 * @param {string} file
 * @param {number} lineNo
 * @param {Ref[]} refs
 * @param {Array<[number, number]>} spans
 */
function scanQualified(line, file, lineNo, refs, spans) {
  QUALIFIED.lastIndex = 0;
  let m;
  while ((m = QUALIFIED.exec(line)) !== null) {
    const [, lead, owner, repo, token] = m;
    if (!isRealRepoHalf(owner, repo)) continue;
    const refToken = classifyToken(token);
    // For a SHA-pinned literal, capture a trailing `# <tag>` claim so
    // assertion 3 can check it (the match ended at the SHA).
    if (refToken.kind === "literal" && SHA.test(refToken.value)) {
      const pin = line.slice(m.index + m[0].length).match(PIN_TAG);
      if (pin) refToken.pinTag = pin[1];
    }
    refs.push({
      file,
      line: lineNo,
      class: qualifiedClass(refToken),
      owner,
      repo,
      refToken,
    });
    const start = m.index + lead.length;
    spans.push([start, start + m[0].length - lead.length]);
  }
}

/**
 * Scan one line for owner-less `name@ref` contextual tokens, skipping spans a
 * qualified match already claimed.
 * @param {string} line
 * @param {string} file
 * @param {number} lineNo
 * @param {Ref[]} refs
 * @param {Array<[number, number]>} spans
 */
function scanOwnerless(line, file, lineNo, refs, spans) {
  OWNERLESS.lastIndex = 0;
  let m;
  while ((m = OWNERLESS.exec(line)) !== null) {
    const start = m.index + m[1].length;
    if (inSpan(spans, start)) continue;
    const refToken = classifyToken(m[3]);
    // Owner-less placeholder/illustrative tokens are not action refs.
    if (refToken.kind !== "literal") continue;
    refs.push({
      file,
      line: lineNo,
      class: "contextual",
      repo: m[2],
      refToken,
    });
    spans.push([start, start + m[0].length - m[1].length]);
  }
}

/**
 * Scan one line for bare action-name mentions in inline code.
 * @param {string} line
 * @param {string} file
 * @param {number} lineNo
 * @param {Ref[]} refs
 * @param {Array<[number, number]>} spans
 */
function scanBare(line, file, lineNo, refs, spans) {
  BARE_CODE.lastIndex = 0;
  let m;
  while ((m = BARE_CODE.exec(line)) !== null) {
    const start = m.index + 1; // skip the opening backtick
    if (inSpan(spans, start)) continue;
    refs.push({
      file,
      line: lineNo,
      class: "contextual",
      repo: m[1],
      refToken: { kind: "none" },
    });
    spans.push([start, start + m[1].length]);
  }
}

/**
 * Scan one line for a placeholder-resolution table value
 * (`| {{NAME}} | <sha> # <tag> |`), binding the pin to its placeholder name.
 * @param {string} line
 * @param {string} file
 * @param {number} lineNo
 * @param {Ref[]} refs
 */
function scanPinRow(line, file, lineNo, refs) {
  const pinRow = line.match(PIN_ROW);
  if (!pinRow) return;
  const [, placeholderName, sha, pinTag] = pinRow;
  refs.push({
    file,
    line: lineNo,
    class: "pin",
    placeholderName,
    refToken: { kind: "literal", value: sha, pinTag },
  });
}

/**
 * Extract typed action references from skill files.
 * @param {Array<{path: string, text: string}>} files
 * @returns {Ref[]} References ordered by `(file, line)`.
 */
export function extractRefs(files) {
  /** @type {Ref[]} */
  const refs = [];
  for (const { path, text } of files) {
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;
      /** @type {Array<[number, number]>} */
      const spans = [];
      scanQualified(line, path, lineNo, refs, spans);
      scanOwnerless(line, path, lineNo, refs, spans);
      scanBare(line, path, lineNo, refs, spans);
      scanPinRow(line, path, lineNo, refs);
    }
  }
  return refs;
}
