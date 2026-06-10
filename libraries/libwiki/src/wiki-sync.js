import path from "node:path";

/** Error thrown when a wiki pull encounters a rebase conflict that cannot be resolved automatically. */
export class WikiPullConflict extends Error {
  /** Create a WikiPullConflict with the stderr output from the failed rebase. */
  constructor(stderr) {
    super("rebase conflict on pull");
    this.name = "WikiPullConflict";
    this.stderr = stderr;
  }
}

/**
 * Consolidates the wiki repository's pull / rebase / conflict-resolve / push
 * flow over an injected {@link import('@forwardimpact/libutil').GitClient}.
 * Replaces the pre-1370 `WikiRepo`: all shelling-out flows through
 * `gitClient` (itself over `runtime.subprocess`), so libwiki never imports
 * `node:child_process` and tests inject `createMockGitClient`.
 *
 * Network operations (fetch / clone / push) authenticate by resolving a token
 * lazily through `resolveToken` and threading it via `gitClient.withAuth`;
 * local operations never call `resolveToken`. The callback owns the entire
 * resolution policy and its throws propagate to the caller.
 */
export class WikiSync {
  #runtime;
  #git;
  #wikiDir;
  #parentDir;
  #resolveToken;

  /**
   * @param {object} options
   * @param {import('@forwardimpact/libutil/runtime').Runtime} options.runtime
   * @param {import('@forwardimpact/libutil').GitClient} options.gitClient
   * @param {string} options.wikiDir - The wiki clone directory.
   * @param {string} options.parentDir - The parent project directory (identity source).
   * @param {() => (string|null)} [options.resolveToken] - Lazy token resolver
   *   for network operations; returns a token string or null for anonymous.
   */
  constructor({ runtime, gitClient, wikiDir, parentDir, resolveToken }) {
    if (!runtime) throw new Error("WikiSync: runtime is required");
    if (!gitClient) throw new Error("WikiSync: gitClient is required");
    if (typeof wikiDir !== "string" || wikiDir === "") {
      throw new TypeError("WikiSync: wikiDir must be a non-empty string");
    }
    this.#runtime = runtime;
    this.#git = gitClient;
    this.#wikiDir = wikiDir;
    this.#parentDir = parentDir;
    this.#resolveToken = resolveToken ?? (() => null);
  }

  /** A GitClient authenticated with the lazily-resolved token, or the bare client when none. */
  #authed() {
    const token = this.#resolveToken();
    return token ? this.#git.withAuth(token) : this.#git;
  }

  /** Whether the wiki directory is an initialized git clone. */
  isCloned() {
    return this.#runtime.fsSync.existsSync(path.join(this.#wikiDir, ".git"));
  }

  /** Clone the wiki from `url` if it is not already cloned. */
  async ensureCloned(url) {
    if (this.isCloned()) return { cloned: true, reason: "already-cloned" };
    try {
      await this.#authed().clone(url, this.#wikiDir);
      return { cloned: true, reason: "cloned" };
    } catch (err) {
      return { cloned: false, reason: err.stderr?.trim() || err.message };
    }
  }

  /** Copy git user.name and user.email from the parent repository into the wiki repository. */
  async inheritIdentity() {
    const name = await this.#git.configGet("user.name", {
      cwd: this.#parentDir,
    });
    const email = await this.#git.configGet("user.email", {
      cwd: this.#parentDir,
    });
    if (name)
      await this.#git.configSet("user.name", name, { cwd: this.#wikiDir });
    if (email) {
      await this.#git.configSet("user.email", email, { cwd: this.#wikiDir });
    }
  }

  /** Fetch origin/master using token auth when available. */
  async fetch() {
    // Resolve auth first so a misconfigured `resolveToken` still surfaces.
    const client = this.#authed();
    try {
      await client.fetch("origin", "master", { cwd: this.#wikiDir });
    } catch {
      // WikiRepo treated fetch as fire-and-forget (it ignored the git result);
      // a failed fetch leaves the local origin/master ref in place and the
      // rebase proceeds against it. Preserved so push/pull degrade gracefully
      // rather than crash when the network or credentials are unavailable.
    }
  }

  /**
   * Whether the wiki working tree has no uncommitted changes, optionally
   * limited to `paths`.
   * @param {string[]} [paths] - Pathspecs to scope the check to.
   */
  async isClean(paths) {
    const r = await this.#git.status({ cwd: this.#wikiDir, paths });
    return r.stdout.trim() === "";
  }

  /** Fetch and rebase on origin/master, throwing WikiPullConflict if the rebase fails. */
  async pull() {
    await this.fetch();
    const r = await this.#git.rebase("origin/master", { cwd: this.#wikiDir });
    if (r.exitCode !== 0) {
      await this.#git.rebaseAbort({ cwd: this.#wikiDir });
      throw new WikiPullConflict(r.stderr?.trim() || "");
    }
  }

  /**
   * Stage and commit working-tree changes, then fetch, rebase on
   * origin/master (falling back to a merge with -X ours if the rebase fails),
   * and push if HEAD is ahead of origin/master. The commit gate and the push
   * gate are independent so a clean tree with local commits still pushes.
   *
   * Without `paths` the commit sweeps the whole tree (`fit-wiki push`
   * contract). With `paths` the commit is pathspec-scoped so foreign residue
   * from parallel writers in the shared workspace is never swept in; the
   * rebase and merge fallback then run with --autostash because that residue
   * stays uncommitted in the tree.
   *
   * @param {string} message - The commit message.
   * @param {string[]} [paths] - Pathspecs limiting what gets committed.
   */
  async commitAndPush(message, paths) {
    if (!(await this.isClean(paths))) {
      if (paths?.length) {
        await this.#git.commitPaths(message, paths, { cwd: this.#wikiDir });
      } else {
        await this.#git.commitAll(message, { cwd: this.#wikiDir });
      }
    }
    if (!(await this.#hasCommitsAhead())) {
      return { pushed: false, reason: "clean" };
    }
    await this.fetch();
    const rebase = await this.#git.rebase("origin/master", {
      cwd: this.#wikiDir,
      autostash: true,
    });
    if (rebase.exitCode !== 0) {
      await this.#git.rebaseAbort({ cwd: this.#wikiDir });
      await this.#git.mergeOursStrategy({
        cwd: this.#wikiDir,
        ref: "origin/master",
        autostash: true,
      });
    }
    // Resolve auth first so a misconfigured `resolveToken` still surfaces; the
    // push itself is fire-and-forget like WikiRepo (which ignored the push
    // result and reported pushed:true regardless), so a network/credential
    // failure degrades to "saved locally" rather than crashing the command.
    const client = this.#authed();
    try {
      await client.push("origin", "master", { cwd: this.#wikiDir });
    } catch {
      // Intentionally ignored — preserves WikiRepo's fire-and-forget push.
    }
    return { pushed: true, reason: "pushed" };
  }

  async #hasCommitsAhead() {
    const count = await this.#git.revListCount("origin/master..HEAD", {
      cwd: this.#wikiDir,
    });
    return count > 0;
  }
}
