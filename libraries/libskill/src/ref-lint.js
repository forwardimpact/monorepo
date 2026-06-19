/**
 * Pure orchestration: extracted `Ref[]` + the placeholder allowlist + an
 * injected resolver → an ordered `Finding[]`. Applies the spec's three
 * assertions and every class stance; an `unreachable` resolver result short-
 * circuits the whole run to a single sentinel, never a pass.
 *
 * @typedef {import('./action-refs.js').Ref} Ref
 * @typedef {import('./ref-resolver.js').ResolverResult} ResolverResult
 *
 * @typedef {object} Finding
 * @property {'finding'|'unreachable'} kind - `unreachable` is the run sentinel.
 * @property {string} [file]
 * @property {number} [line]
 * @property {string} [ref] - The `owner/repo[@ref]` text named in the finding.
 * @property {string} [reason] - One-line human reason.
 */

import { anchorContextual, skillDir } from "./ref-anchors.js";

/**
 * A skill directory is published (resolves anonymously) when its name begins
 * `fit-` or `kata-`. Internal skills resolve under the ambient token.
 * @param {string} file
 * @returns {boolean}
 */
function isPublishedSkill(file) {
  const dir = skillDir(file);
  if (!dir) return false;
  const name = dir.slice(".claude/skills/".length);
  return name.startsWith("fit-") || name.startsWith("kata-");
}

/**
 * Render the `owner/repo[@ref]` text for a finding line.
 * @param {string|undefined} owner
 * @param {string|undefined} repo
 * @param {import('./action-refs.js').RefToken} [token]
 * @returns {string}
 */
function refText(owner, repo, token) {
  const base = owner ? `${owner}/${repo}` : (repo ?? "");
  return token?.value !== undefined ? `${base}@${token.value}` : base;
}

/**
 * Is `value` a 40-hex SHA?
 * @param {string} value
 * @returns {boolean}
 */
function isSha(value) {
  return /^[0-9a-f]{40}$/i.test(value);
}

/**
 * Run assertions 2–3 against a resolved listing for a literal ref token.
 * @param {import('./ref-resolver.js').ParsedRefs} refs
 * @param {import('./action-refs.js').RefToken} token - The literal post-`@`
 *   token (its `value` is the ref/SHA; `pinTag` the claimed tag, if any).
 * @param {{file: string, line: number, ref: string}} site
 * @returns {Finding[]}
 */
function assertRefAndPin(refs, token, site) {
  const findings = [];
  const literal = token.value;
  const pinTag = token.pinTag;
  if (isSha(literal)) {
    // Assertion 2 for a SHA: the SHA must appear in the listing.
    const known = [...refs.shas].some(
      (s) => s.toLowerCase() === literal.toLowerCase(),
    );
    if (!known) {
      findings.push({
        kind: "finding",
        ...site,
        reason: "pinned SHA not found in repository",
      });
    }
    // Assertion 3: the named tag must point at this SHA.
    if (pinTag) {
      const sha = refs.tagSha.get(pinTag);
      if (!sha) {
        findings.push({
          kind: "finding",
          ...site,
          reason: `tag ${pinTag} does not exist`,
        });
      } else if (sha.toLowerCase() !== literal.toLowerCase()) {
        findings.push({
          kind: "finding",
          ...site,
          reason: `tag ${pinTag} does not point at the pinned SHA`,
        });
      }
    }
  } else if (!refs.tags.has(literal) && !refs.heads.has(literal)) {
    // Assertion 2 for a tag/branch literal: it must exist as a tag or head.
    findings.push({
      kind: "finding",
      ...site,
      reason: "ref does not resolve in repository",
    });
  }
  return findings;
}

/**
 * Resolve the repository a ref's assertions run against, plus whether it must
 * resolve anonymously. Returns `null` when the ref emits nothing (unanchored
 * contextual, or a `pin` whose placeholder is unknown).
 * @param {Ref & {anchor?: {owner: string, repo: string}|null}} ref
 * @param {Map<string, {owner: string, repo: string}>} allowlist
 * @returns {{owner: string, repo: string}|null|'malformed'}
 */
function targetFor(ref, allowlist) {
  if (ref.class === "contextual" || ref.class === "contextual-qualified") {
    return ref.anchor ?? null;
  }
  if (ref.class === "placeholder") {
    return allowlist.has(ref.refToken.value)
      ? allowlist.get(ref.refToken.value)
      : "malformed";
  }
  if (ref.class === "pin") {
    // A resolution-table pin binds to the repository its named placeholder
    // resolves to. An orphan pin (no matching placeholder) emits nothing.
    const key = `{{${ref.placeholderName}}}`;
    return allowlist.has(key) ? allowlist.get(key) : null;
  }
  // qualified / illustrative carry their own owner/repo.
  return { owner: ref.owner, repo: ref.repo };
}

/**
 * Lint extracted action references against reality.
 *
 * @param {object} options
 * @param {Ref[]} options.refs - Extracted references.
 * @param {Map<string, {owner: string, repo: string}>} options.allowlist - The
 *   placeholder allowlist from `buildPlaceholderAllowlist`.
 * @param {(ref: {owner: string, repo: string, anonymous: boolean}) => Promise<ResolverResult>} options.resolve
 *   The injected resolver.
 * @returns {Promise<Finding[]>} Findings sorted by `(file, line)`. A single
 *   `{kind:'unreachable'}` sentinel when reality could not be reached.
 */
export async function lintActionRefs({ refs, allowlist, resolve }) {
  const anchored = anchorContextual(refs);
  const findings = [];

  for (const ref of anchored) {
    const target = targetFor(ref, allowlist);

    if (target === "malformed") {
      findings.push({
        kind: "finding",
        file: ref.file,
        line: ref.line,
        ref: refText(ref.owner, ref.repo, ref.refToken),
        reason: "placeholder is not a known ref substitution",
      });
      continue;
    }
    if (!target) continue; // unanchored contextual / orphan pin — no finding

    const anonymous = isPublishedSkill(ref.file);
    const res = await resolve({ ...target, anonymous });
    if (res.state === "unreachable") return [{ kind: "unreachable" }];

    const refStr = refText(
      ref.owner ?? target.owner,
      ref.repo ?? target.repo,
      ref.refToken,
    );

    // Assertion 1 — repo resolves.
    if (res.state === "absent") {
      findings.push({
        kind: "finding",
        file: ref.file,
        line: ref.line,
        ref: refStr,
        reason: "repository does not resolve",
      });
      continue; // no ref/pin checks against an unresolved repo
    }

    // Assertions 2–3 apply only to literal post-@ tokens (qualified, an
    // anchored contextual token carrying its own literal ref, or a pin).
    // Placeholders and illustrative tokens are repo-only by design.
    if (res.state === "ok" && ref.refToken?.kind === "literal") {
      findings.push(
        ...assertRefAndPin(res.refs, ref.refToken, {
          file: ref.file,
          line: ref.line,
          ref: refStr,
        }),
      );
    }
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return (a.file ?? "") < (b.file ?? "") ? -1 : 1;
    return (a.line ?? 0) - (b.line ?? 0);
  });
  return findings;
}
