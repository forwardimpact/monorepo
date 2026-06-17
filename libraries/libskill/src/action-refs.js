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
 *
 * @typedef {object} Ref
 * @property {string} file - The file path the reference was found in.
 * @property {number} line - 1-based line number of the reference site.
 * @property {'qualified'|'placeholder'|'illustrative'|'contextual-qualified'|'contextual'} class
 *   The reference class. `qualified`/`placeholder`/`illustrative` carry an
 *   `owner/repo`; `contextual-qualified` is an `owner/repo` with no `@ref`;
 *   `contextual` is an owner-less `name@ref` or bare action-name mention.
 * @property {string} [owner] - The `owner` segment (absent for owner-less
 *   `contextual` tokens).
 * @property {string} repo - The `repo` segment (the action name for
 *   owner-less/bare `contextual` tokens).
 * @property {RefToken} refToken - The classified post-`@` token.
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
      const seenSpans = [];

      // Qualified `owner/repo[@ref]` (fenced `uses:` or prose).
      QUALIFIED.lastIndex = 0;
      let m;
      while ((m = QUALIFIED.exec(line)) !== null) {
        const owner = m[2];
        const repo = m[3];
        const token = m[4];
        if (!isRealRepoHalf(owner, repo)) continue;
        const refToken = classifyToken(token);
        const cls =
          refToken.kind === "none"
            ? "contextual-qualified"
            : refToken.kind === "placeholder"
              ? "placeholder"
              : refToken.kind === "illustrative"
                ? "illustrative"
                : "qualified";
        refs.push({ file: path, line: lineNo, class: cls, owner, repo, refToken });
        // Record the matched span so owner-less/bare scans don't double-count
        // the `repo@ref` sub-token of a qualified match.
        const start = m.index + m[1].length;
        seenSpans.push([start, start + m[0].length - m[1].length]);
      }

      // Owner-less `name@ref` prose tokens (contextual). Skip spans already
      // claimed by a qualified match.
      OWNERLESS.lastIndex = 0;
      while ((m = OWNERLESS.exec(line)) !== null) {
        const start = m.index + m[1].length;
        if (seenSpans.some(([s, e]) => start >= s && start < e)) continue;
        const repo = m[2];
        const token = m[3];
        const refToken = classifyToken(token);
        // Owner-less placeholders/illustrative tokens are not action refs.
        if (refToken.kind !== "literal") continue;
        refs.push({
          file: path,
          line: lineNo,
          class: "contextual",
          repo,
          refToken,
        });
        seenSpans.push([start, start + m[0].length - m[1].length]);
      }

      // Bare action-name mentions in inline code (contextual, no ref).
      BARE_CODE.lastIndex = 0;
      while ((m = BARE_CODE.exec(line)) !== null) {
        const start = m.index + 1; // skip the opening backtick
        if (seenSpans.some(([s, e]) => start >= s && start < e)) continue;
        const repo = m[1];
        refs.push({
          file: path,
          line: lineNo,
          class: "contextual",
          repo,
          refToken: { kind: "none" },
        });
        seenSpans.push([start, start + repo.length]);
      }
    }
  }

  return refs;
}
