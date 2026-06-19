/**
 * Placeholder-allowlist computation and contextual-token anchoring. Both pure.
 *
 * The allowlist is the set of `{{NAME}}` placeholders that appear post-`@` in a
 * `uses:` reference under a `kata-setup` skill directory — the design's
 * authoritative source (post-`@` appearance, not resolution-table presence).
 * Anchoring covers contextual tokens whose `repo` segment exactly matches a
 * qualified reference in the same skill directory.
 *
 * @typedef {import('./action-refs.js').Ref} Ref
 */

/**
 * Derive the skill directory of a ref's file: the first two path segments under
 * `.claude/skills/` (e.g. `.claude/skills/kata-setup`). Returns `null` when the
 * path is not under `.claude/skills/`.
 * @param {string} file
 * @returns {string|null}
 */
export function skillDir(file) {
  const norm = file.replaceAll("\\", "/");
  const idx = norm.indexOf(".claude/skills/");
  if (idx === -1) return null;
  const rest = norm.slice(idx + ".claude/skills/".length);
  const first = rest.split("/")[0];
  if (!first) return null;
  return `.claude/skills/${first}`;
}

/**
 * Build the placeholder allowlist: `{{NAME}}` → `owner/repo` for every
 * placeholder ref appearing post-`@` in a `kata-setup` skill directory. Body-
 * only placeholders (`{{MODEL}}` …) never appear as a placeholder *ref* token,
 * so they never enter the map.
 * @param {Ref[]} refs
 * @returns {Map<string, {owner: string, repo: string}>}
 */
export function buildPlaceholderAllowlist(refs) {
  /** @type {Map<string, {owner: string, repo: string}>} */
  const allow = new Map();
  for (const ref of refs) {
    if (ref.class !== "placeholder") continue;
    const dir = skillDir(ref.file);
    if (!dir || !dir.endsWith("/kata-setup")) continue;
    allow.set(ref.refToken.value, { owner: ref.owner, repo: ref.repo });
  }
  return allow;
}

/**
 * Anchor contextual tokens to a qualified reference in the same skill dir.
 *
 * For each `contextual`/`contextual-qualified` ref, find a qualified reference
 * (literal `qualified` or `placeholder`) in the **same** skill directory whose
 * `repo` segment equals the token's `repo` exactly and case-sensitively. Return
 * a new array of refs, each annotated with `anchor` (the matched
 * `{owner, repo}`) or `anchor: null` when unanchored. Non-contextual refs pass
 * through with `anchor: undefined`.
 * @param {Ref[]} refs
 * @returns {Array<Ref & {anchor?: {owner: string, repo: string}|null}>}
 */
export function anchorContextual(refs) {
  // Index qualified anchors by skill dir → repo → {owner, repo}.
  /** @type {Map<string, Map<string, {owner: string, repo: string}>>} */
  const anchorsByDir = new Map();
  for (const ref of refs) {
    if (ref.class !== "qualified" && ref.class !== "placeholder") continue;
    const dir = skillDir(ref.file);
    if (!dir) continue;
    let byRepo = anchorsByDir.get(dir);
    if (!byRepo) {
      byRepo = new Map();
      anchorsByDir.set(dir, byRepo);
    }
    if (!byRepo.has(ref.repo))
      byRepo.set(ref.repo, { owner: ref.owner, repo: ref.repo });
  }

  return refs.map((ref) => {
    if (ref.class !== "contextual" && ref.class !== "contextual-qualified")
      return ref;
    const dir = skillDir(ref.file);
    const anchor = dir ? (anchorsByDir.get(dir)?.get(ref.repo) ?? null) : null;
    return { ...ref, anchor };
  });
}
