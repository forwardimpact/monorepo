import path from "node:path";

/** The branch the wiki clone publishes (hard-coded in fetch / rebase / push). */
const BRANCH = "master";
const REMOTE = "origin";
const REMOTE_BRANCH = `${REMOTE}/${BRANCH}`;

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
 * Error thrown when the ancestry guard refuses to commit or push because the
 * relationship between the history that would be published and the remote
 * branch cannot be positively confirmed (spec 1750). `kind` is `"unrelated"`
 * (confirmed no shared history) or `"unverifiable"` (the relationship could be
 * neither confirmed nor refuted). The two kinds carry distinct messages so the
 * operator knows which state they are recovering from.
 */
export class AncestryRefusal extends Error {
  /**
   * @param {"unrelated"|"unverifiable"} kind
   * @param {string} message - Recovery-naming message.
   */
  constructor(kind, message) {
    super(message);
    this.name = "AncestryRefusal";
    this.kind = kind;
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
   * Ancestry guard (spec 1750): before the commit and again before the push,
   * {@link AncestryRefusal} is thrown when the published history's relationship
   * to `origin/master` cannot be positively confirmed — a detached HEAD, an
   * unborn HEAD or unrelated history against an existing remote branch, or a
   * remote that cannot be observed. A new wiki's first publication is allowed
   * only on positive evidence the remote branch is absent (a non-swallowed
   * `ls-remote`); mere absence of the local remote-tracking ref never grants
   * it, and the allowance is re-derived from live git on every call so a failed
   * first publication is re-judged rather than auto-re-granted. The guard
   * creates no commit, attempts no push, and adds no working-tree changes.
   *
   * @param {string} message - The commit message.
   * @param {string[]} [paths] - Pathspecs limiting what gets committed.
   * @throws {AncestryRefusal} When the published history cannot be verified.
   */
  async commitAndPush(message, paths) {
    await this.#assertPublishable();
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
    await this.#assertPublishable();
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

  /** Whether the wiki clone is shallow (has a `.git/shallow` file). */
  #isShallow() {
    return this.#runtime.fsSync.existsSync(
      path.join(this.#wikiDir, ".git", "shallow"),
    );
  }

  /**
   * Refuse, before any commit or push, whenever the relationship between the
   * history that would be published (the `master` branch ref, never bare HEAD)
   * and the remote branch can be neither confirmed nor refuted. Implements the
   * spec 1750 decision table; throws {@link AncestryRefusal} on refusal and
   * returns silently when publication is verified or the remote is positively
   * empty. The emptiness probe runs only on the absent-tracking-ref path, so
   * the healthy hot path adds no remote round-trip.
   */
  async #assertPublishable() {
    const cwd = this.#wikiDir;

    // 1. Detached HEAD: the push publishes the branch ref, not HEAD, so the
    //    session's commits would be silently lost. Verify nothing — refuse.
    if ((await this.#git.headBranch({ cwd })) !== BRANCH) {
      throw new AncestryRefusal(
        "unverifiable",
        "fit-wiki: refusing to publish — HEAD is detached, so the configured " +
          "branch would be pushed instead of your work. Re-clone the wiki.",
      );
    }

    // 2. Establish whether the remote branch is present. A resolvable local
    //    remote-tracking ref is sufficient; otherwise probe the remote (the
    //    only added round-trip, and only here).
    let branchPresent = await this.#git.refExists(REMOTE_BRANCH, { cwd });
    if (!branchPresent) {
      let observed;
      try {
        observed = await this.#git.remoteBranchExists(REMOTE, BRANCH, { cwd });
      } catch {
        throw new AncestryRefusal(
          "unverifiable",
          "fit-wiki: refusing to publish — could not observe the remote to " +
            "verify ancestry; the local change is not published.",
        );
      }
      // Positive evidence the remote branch is absent ⇒ empty-new-wiki.
      if (!observed) return;
      branchPresent = true;
    }

    // 3. Branch present + unborn HEAD ⇒ confirmed unrelated.
    if (!(await this.#git.refExists("HEAD", { cwd }))) {
      throw new AncestryRefusal(
        "unrelated",
        "fit-wiki: refusing to publish — HEAD is unborn but the remote " +
          "branch exists. Re-clone the wiki.",
      );
    }

    // 4. Shared ancestry within the fetched window ⇒ allow.
    if (await this.#git.mergeBaseExists(REMOTE_BRANCH, "HEAD", { cwd })) return;

    // 5. No merge-base on a complete clone ⇒ confirmed unrelated.
    if (!this.#isShallow()) {
      throw new AncestryRefusal(
        "unrelated",
        "fit-wiki: refusing to publish — local history is unrelated to the " +
          "remote branch. Re-clone the wiki.",
      );
    }

    // 6. Shallow clone: deepen to full history, then re-judge.
    const deepen = await this.#git.fetchDeepen(REMOTE, BRANCH, { cwd });
    if (deepen.exitCode !== 0) {
      throw new AncestryRefusal(
        "unverifiable",
        "fit-wiki: refusing to publish — could not deepen history to verify " +
          "ancestry; the local change is not published.",
      );
    }
    if (await this.#git.mergeBaseExists(REMOTE_BRANCH, "HEAD", { cwd })) return;
    throw new AncestryRefusal(
      "unrelated",
      "fit-wiki: refusing to publish — local history is unrelated to the " +
        "remote branch (confirmed against full history). Re-clone the wiki.",
    );
  }
}
