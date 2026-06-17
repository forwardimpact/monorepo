import path from "node:path";
import { SINGLETON_PATHS } from "./constants.js";
import { parseDiff, findAbsent, makeDetection, normLine } from "./integrity.js";

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

// A push rejected because the remote tip moved (non-fast-forward) is the
// re-apply loop's retry signal; an auth or network failure is not contention.
// git surfaces a rejection on stderr with these markers.
const PUSH_REJECTION_RE =
  /\b(rejected|non-fast-forward|fetch first|tip of your current branch is behind)\b/i;

/** Whether a thrown push error is a non-fast-forward rejection (vs. auth/network). */
function isPushRejection(err) {
  const text = `${err?.stderr ?? ""}\n${err?.message ?? ""}`;
  return PUSH_REJECTION_RE.test(text);
}

/**
 * Error thrown when the ancestry guard refuses to commit or push because the
 * relationship between the history that would be published and the remote
 * branch cannot be positively confirmed. `kind` is `"unrelated"`
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
 * Error thrown when a registered-singleton operation cannot land within the
 * bounded re-apply budget: contention recurred on each round, so the publish
 * fails loud rather than resolving the contended hunk textually.
 */
export class WikiSyncConflict extends Error {
  /** @param {string[]} paths @param {string} reason */
  constructor(paths, reason) {
    super(`wiki sync conflict on ${paths.join(", ")} (${reason})`);
    this.name = "WikiSyncConflict";
    this.paths = paths;
    this.reason = reason;
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
   * Ancestry guard: before the commit and again before the push,
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
   * **Singleton merge discipline.** The discipline applies when a
   * rebase conflict arises for a *registered* row-structured singleton (the
   * single committed path is in `SINGLETON_PATHS`) and the caller supplied a
   * `reapply` operation. The contended hunk is then never resolved textually.
   * The conflicting local commit is dropped with `resetSoft`, which preserves
   * the working tree. Only the registered file is reset to the fresh tip with
   * `checkoutPaths`. The operation is re-derived against that tip's content,
   * re-committed, and pushed, bounded by `maxReapply`. A rejected push (the tip
   * moved again) drives the retry; exhaustion fails loud with
   * {@link WikiSyncConflict}. Foreign rows and untouched prose ride through from
   * the tip. Without a `reapply` the conflict keeps the `-X ours` fallback, so
   * prose surfaces and unregistered paths stay on the side-biased behavior.
   *
   * @param {string} message - The commit message.
   * @param {string[]} [paths] - Pathspecs limiting what gets committed.
   * @param {{reapply?: (freshText: string) => string | null, maxReapply?: number}} [options]
   *   `reapply` re-derives the registered file's content from the operation's
   *   own row edit against the fresh tip text; returns the new text or null when
   *   the op is already satisfied on the tip.
   * @throws {AncestryRefusal} When the published history cannot be verified.
   * @throws {WikiSyncConflict} When the re-apply budget is exhausted.
   */
  async commitAndPush(message, paths, { reapply, maxReapply = 3 } = {}) {
    await this.#assertPublishable();
    if (!(await this.isClean(paths))) {
      if (paths?.length) {
        await this.#git.commitPaths(message, paths, { cwd: this.#wikiDir });
      } else {
        await this.#git.commitAll(message, { cwd: this.#wikiDir });
      }
    }
    if (!(await this.#hasCommitsAhead())) {
      return { pushed: false, reason: "clean", detections: [] };
    }
    await this.#assertPublishable();
    await this.fetch();
    const rebase = await this.#git.rebase("origin/master", {
      cwd: this.#wikiDir,
      autostash: true,
    });
    if (rebase.exitCode !== 0) {
      await this.#git.rebaseAbort({ cwd: this.#wikiDir });
      const registered =
        typeof reapply === "function" &&
        paths?.length === 1 &&
        paths.every((p) => SINGLETON_PATHS.has(p));
      if (registered) {
        return this.#reapplyLoop(message, paths, reapply, maxReapply);
      }
      await this.#git.mergeOursStrategy({
        cwd: this.#wikiDir,
        ref: "origin/master",
        autostash: true,
      });
    }
    // Capture the pushed delta now: HEAD is the final (rebased/merged) local
    // tip and origin/master is still the pre-push base. A two-tree range diff
    // (not a single-commit show) is correct even when HEAD is a merge commit.
    // Wrapped so the detection-only probe never gates the push it follows.
    let pushedDelta = null;
    try {
      pushedDelta = await this.#git.diffRange("origin/master HEAD", {
        cwd: this.#wikiDir,
      });
    } catch {
      // Detection-only: a capture failure degrades to no tier-1 detections.
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
    const detections = await this.#tier1Probe(pushedDelta);
    return { pushed: true, reason: "pushed", detections };
  }

  /**
   * Tier-1 post-push integrity probe (spec 1960): re-fetch the origin tip and
   * verify the just-pushed delta — the full delta including shared surfaces —
   * is still content-present, returning detections for any absence. Reads only;
   * any error degrades to no detections so the probe never gates the push.
   * @param {string|null} pushedDelta - `diffRange` text of the pushed delta.
   * @returns {Promise<object[]>}
   */
  async #tier1Probe(pushedDelta) {
    try {
      if (pushedDelta == null) return [];
      const changes = parseDiff(pushedDelta);
      if (changes.length === 0) return [];
      // A new post-push fetch advances origin/master to the current tip.
      await this.fetch();
      const homes = [
        ...new Set(changes.map((c) => c.home).filter((h) => h !== "/dev/null")),
      ];
      const tipText = (
        await Promise.all(
          homes.map((home) =>
            this.#git.showFile("origin/master", home, { cwd: this.#wikiDir }),
          ),
        )
      )
        .filter((t) => t != null)
        .join("\n");
      const now = this.#runtime.clock.now();
      return findAbsent(changes, tipText, normLine).map((a) =>
        makeDetection({
          tier: 1,
          contentId: a.contentId,
          pushHome: a.pushHome,
          now,
        }),
      );
    } catch {
      return [];
    }
  }

  /**
   * Re-apply a registered singleton operation against the fresh remote tip,
   * bounded by `maxReapply` rounds. The caller has already aborted the rebase.
   * Each round: refresh the tip, drop the stale local commit (`resetSoft`,
   * working tree untouched so foreign residue survives), reset only the
   * registered file to the tip (`checkoutPaths`, tolerating a tip that lacks
   * it), re-derive via `reapply`, and — when the op still changes the tip —
   * re-commit and push. A rejected push (the tip moved again) loops; an
   * unchanged op is already satisfied; bound exhaustion throws.
   */
  async #reapplyLoop(message, paths, reapply, maxReapply) {
    const filePath = path.join(this.#wikiDir, paths[0]);
    for (let round = 0; round < maxReapply; round++) {
      await this.fetch();
      await this.#git.resetSoft("origin/master", { cwd: this.#wikiDir });
      // Reset only the registered file to the tip. `resetSoft` leaves the
      // working tree (so the dropped commit's copy of the file may linger), so
      // a non-zero checkout — the tip lacks the file (a founding write) — means
      // the fresh base is empty, NOT the lingering local copy.
      const checkout = await this.#git.checkoutPaths("origin/master", paths, {
        cwd: this.#wikiDir,
        allowMissing: true,
      });
      const tipHasFile = (checkout?.exitCode ?? 0) === 0;
      const freshText =
        tipHasFile && this.#runtime.fsSync.existsSync(filePath)
          ? this.#runtime.fsSync.readFileSync(filePath, "utf-8")
          : "";
      const newText = reapply(freshText);
      if (newText === null) {
        // The op is already satisfied on the tip; HEAD now equals the tip.
        return { pushed: false, reason: "already-satisfied" };
      }
      this.#runtime.fsSync.writeFileSync(filePath, newText);
      await this.#git.commitPaths(message, paths, { cwd: this.#wikiDir });
      try {
        await this.#authed().push("origin", "master", { cwd: this.#wikiDir });
        return { pushed: true, reason: "reapplied" };
      } catch (err) {
        // Only a rejected push (the tip moved again) is a retry signal. An auth
        // or network failure is not contention: rethrow it so the caller
        // degrades to "saved locally" rather than burning the budget and
        // misreporting a conflict that never happened.
        if (!isPushRejection(err)) throw err;
      }
    }
    throw new WikiSyncConflict(paths, "reapply-bound");
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
   * the ancestry decision table; throws {@link AncestryRefusal} on refusal and
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
    const branchPresent = await this.#git.refExists(REMOTE_BRANCH, { cwd });
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
      // Remote branch present but no local tracking ref: fetch it into the
      // tracking ref so the unborn-HEAD and merge-base steps below judge
      // against the probed branch tip rather than an unresolvable ref.
      try {
        await this.#git.fetch(
          REMOTE,
          `${BRANCH}:refs/remotes/${REMOTE_BRANCH}`,
          {
            cwd,
          },
        );
      } catch {
        throw new AncestryRefusal(
          "unverifiable",
          "fit-wiki: refusing to publish — could not fetch the remote branch " +
            "to verify ancestry; the local change is not published.",
        );
      }
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
