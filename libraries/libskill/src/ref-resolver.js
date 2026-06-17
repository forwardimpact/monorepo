/**
 * Side-effecting reference resolver behind a `resolve(ref)` interface, wrapping
 * a `git ls-remote` probe with the design's two-stage reachability gate.
 *
 * Verified git behavior: a missing and a private repo both exit 128 with an
 * auth-demand on stderr, indistinguishable by message from a transport fault.
 * So the resolver never string-matches stderr. It first proves GitHub reachable
 * by probing a known-good public anchor anonymously (memoized once per run);
 * only then is an exit-128 on the target unambiguously "repo unresolvable".
 *
 * @typedef {object} ResolverResult
 * @property {'ok'|'absent'|'unreachable'} state
 * @property {ParsedRefs} [refs] - Present only when `state === 'ok'`.
 *
 * @typedef {object} ParsedRefs
 * @property {Set<string>} tags - Tag names present in the listing.
 * @property {Set<string>} heads - Branch names present in the listing.
 * @property {Set<string>} shas - All object SHAs present in the listing.
 * @property {Map<string, string>} tagSha - Tag name → the SHA it resolves to
 *   (the `^{}` peel SHA for an annotated tag, the bare SHA for a lightweight
 *   tag).
 */

const GITHUB = "https://github.com";

/**
 * Parse `git ls-remote --tags --heads` stdout into a structured ref view.
 * @param {string} stdout
 * @returns {ParsedRefs}
 */
export function parseLsRemote(stdout) {
  const tags = new Set();
  const heads = new Set();
  const shas = new Set();
  /** @type {Map<string, string>} */
  const tagSha = new Map();
  // First pass: bare refs. Second-pass peel lines (`<sha>\trefs/tags/<t>^{}`)
  // override the tag→SHA mapping when present (annotated tags).
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const sha = line.slice(0, tab).trim();
    const ref = line.slice(tab + 1).trim();
    shas.add(sha);
    if (ref.startsWith("refs/tags/")) {
      const peeled = ref.endsWith("^{}");
      const name = ref.slice("refs/tags/".length).replace(/\^\{\}$/, "");
      tags.add(name);
      // A peel line always wins; a bare tag line only sets the mapping if no
      // peel line has set it.
      if (peeled || !tagSha.has(name)) tagSha.set(name, sha);
    } else if (ref.startsWith("refs/heads/")) {
      heads.add(ref.slice("refs/heads/".length));
    }
  }
  return { tags, heads, shas, tagSha };
}

/**
 * Create a resolver bound to a token-bearing and an anonymous GitClient.
 *
 * @param {object} options
 * @param {{lsRemote: (url: string) => Promise<{stdout: string, stderr: string, exitCode: number}>}} options.authedGit
 *   Client that transports with the ambient token (internal-skill refs).
 * @param {{lsRemote: (url: string) => Promise<{stdout: string, stderr: string, exitCode: number}>}} options.anonGit
 *   Tokenless client (published-skill refs and the reachability gate).
 * @param {string} [options.anchor='actions/checkout'] - The public anchor probed
 *   to prove GitHub reachable.
 * @returns {{resolve: (ref: {owner: string, repo: string, anonymous: boolean}) => Promise<ResolverResult>}}
 */
export function createGitResolver({
  authedGit,
  anonGit,
  anchor = "actions/checkout",
}) {
  /** @type {Promise<boolean>|null} Memoized reachability gate. */
  let gatePromise = null;

  const probeGate = () => {
    if (!gatePromise) {
      gatePromise = anonGit
        .lsRemote(`${GITHUB}/${anchor}`)
        .then((r) => r.exitCode === 0);
    }
    return gatePromise;
  };

  async function resolve({ owner, repo, anonymous }) {
    // Stage 1: reachability gate. Any nonzero anchor exit → unreachable.
    if (!(await probeGate())) return { state: "unreachable" };

    // Stage 2: target probe with GitHub proven reachable.
    const client = anonymous ? anonGit : authedGit;
    const url = `${GITHUB}/${owner}/${repo}`;
    const result = await client.lsRemote(url);
    if (result.exitCode === 0) {
      return { state: "ok", refs: parseLsRemote(result.stdout) };
    }
    if (result.exitCode === 128) {
      // Reachability is established, so an auth demand means private-or-absent.
      return { state: "absent" };
    }
    // A non-128 transport fault: re-probe the gate. If it now fails, the run is
    // unreachable; otherwise treat the target as absent.
    gatePromise = null;
    if (!(await probeGate())) return { state: "unreachable" };
    return { state: "absent" };
  }

  return { resolve };
}
