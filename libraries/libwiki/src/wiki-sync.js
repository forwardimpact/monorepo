import path from "node:path";
import { scanConflictMarkers } from "./conflict-markers.js";
import { GITATTRIBUTES_FILE, SINGLETON_PATHS } from "./constants.js";
import { ensureMetricsCsvMergeAttribute } from "./gitattributes.js";
import { parseDiff, findAbsent, makeDetection, normLine } from "./integrity.js";
import { scanPushWindow, appendOverrideRecord } from "./secret-gate.js";

/** The branch the wiki clone publishes (hard-coded in fetch / rebase / push). */
const BRANCH = "master";
const REMOTE = "origin";
const REMOTE_BRANCH = `${REMOTE}/${BRANCH}`;

/** The commit range a wiki push introduces relative to the remote it reconciles against. */
const PUSH_RANGE = "origin/master..HEAD";

/** Working-tree status XY codes that signal an unmerged (conflicted) path. */
const UNMERGED_CODES = new Set(["UU", "AA", "DD", "AU", "UA", "DU", "UD"]);

/**
 * The honest push-outcome reason taxonomy (D2). Success-shaped
 * outcomes (`landed`, `nothing-to-push`) are returned; every other reason is
 * carried by a thrown {@link WikiPushFailure}.
 */
export const PUSH_REASONS = Object.freeze({
  LANDED: "landed",
  NOTHING: "nothing-to-push",
  REJECTED: "rejected",
  CONFLICT: "conflict",
  RESIDUE_CONFLICT: "residue-conflict",
  TRANSPORT: "transport",
  PRECONDITION: "precondition",
  CONSERVATION: "conservation",
});

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
 * The refusal reason taxonomy for {@link WikiSync.commitAndPush}. A refusal is
 * surfaced in the result rather than thrown, so callers reading the result keep
 * working; `WikiSyncRefusal.result(reason, details)` builds that result object.
 * `reason` is one of `mid-merge`, `stranded-merge`, `would-publish-markers`,
 * `introduced-scan-failed`; `workAt` (only for `stranded-merge`) names where
 * retained work lives. The reason set is additive to the existing `clean` and
 * `pushed` outcomes, so a future refusal taxonomy on this flow can union new
 * reasons in without rewriting the existing ones.
 */
export class WikiSyncRefusal {
  /** @type {readonly string[]} The recognized refusal reasons. */
  static REASONS = Object.freeze([
    "mid-merge",
    "stranded-merge",
    "would-publish-markers",
    "introduced-scan-failed",
  ]);

  /**
   * Build a `commitAndPush` refusal result.
   * @param {string} reason - One of {@link WikiSyncRefusal.REASONS}.
   * @param {{workAt?: string}} [details] - `workAt` names where retained work lives.
   * @returns {{pushed: false, reason: string, workAt?: string}}
   */
  static result(reason, { workAt } = {}) {
    const result = { pushed: false, reason };
    if (workAt) result.workAt = workAt;
    return result;
  }
}

// Markers introduced into a prose markdown surface may be legitimately quoted
// inside a fenced code block (the false-positive surface Layer 1 exempts).
// STATUS.md is data, not prose — its fenced rows are never legitimately marked
// — and non-markdown files (e.g. metrics CSVs) have no quoted-form idiom, so
// neither is fence-exempt on the publish path.
function pushFenceExempt(filePath) {
  const base = path.basename(filePath);
  return filePath.endsWith(".md") && base !== "STATUS.md";
}

/**
 * Error thrown when `commitAndPush` cannot honestly report a landed push
 *  `reason` is one of {@link PUSH_REASONS} other than `landed` /
 * `nothing-to-push`; `stashSha` names a preserved autostash on a
 * `residue-conflict`.
 */
export class WikiPushFailure extends Error {
  /**
   * @param {string} reason - A {@link PUSH_REASONS} value.
   * @param {string} message - Operator message naming the reason and recovery.
   * @param {object} [opts]
   * @param {string} [opts.stashSha] - Preserved stash SHA (residue-conflict).
   */
  constructor(reason, message, { stashSha } = {}) {
    super(message);
    this.name = "WikiPushFailure";
    this.reason = reason;
    if (stashSha) this.stashSha = stashSha;
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
   * Stage and commit working-tree changes, then reconcile on origin/master and
   * push — reporting an honest outcome  The commit gate and the
   * push gate are independent so a clean tree with local commits still pushes.
   *
   * Without `paths` the commit sweeps the whole tree (`fit-wiki push`
   * contract). With `paths` the commit is pathspec-scoped so foreign residue
   * from parallel writers in the shared workspace is never swept in; the
   * rebase runs with --autostash because that residue stays uncommitted.
   *
   * Outcome contract (D2 taxonomy):
   * - Returns `{ landed: true, reason: "landed" }` only when the push is
   *   **grounded** in observed remote state — the per-ref `--porcelain` report,
   *   or a post-push read of the remote tip containing HEAD — never inferred
   *   from the subprocess's exit or prose.
   * - Returns `{ landed: false, reason: "nothing-to-push" }` only when the
   *   observed remote ref already contains local HEAD (never pre-fetch
   *   arithmetic), so a stranded-resume tree re-pushes.
   * - Throws {@link WikiPushFailure} for every failure reason: `precondition`
   *   (rebase-in-progress / detached HEAD, before mutating), `conflict`
   *   (rebase conflict — aborted, the remote side never mechanically
   *   discarded), `residue-conflict` (autostash pop left unmerged paths — stash
   *   preserved by SHA), `conservation` (the push would drop foreign content),
   *   `rejected` (non-fast-forward after a successful fetch), `transport`
   *   (push/fetch transport failure). A failed push never loses uncommitted
   *   work.
   *
   * Bounded retry (D3) is in contract: the ancestry judgment is present
   * (this is the second lander), so a `rejected` outcome reconciles once and
   * re-pushes, re-entering {@link #assertPublishable} before the replay so the
   * empty-remote allowance is never auto-re-granted. The retry is bounded at
   * one, never re-pops a conflicted autostash, and never masks the final
   * outcome — exhaustion reports `rejected`.
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
   * Before the gates, the metrics-CSV union merge declaration is ensured in
   * `.gitattributes`. When the ensure writes the file, the commit must carry it
   * regardless of the session's payload: on the pathspec-scoped path the
   * declaration is outside `paths` and would otherwise be autostashed aside, and
   * on a no-payload sync there would be no commit at all. So `.gitattributes` is
   * appended to the effective commit pathspec only when the ensure changed it;
   * when it is already present-and-correct, behavior is byte-identical to a
   * commit-and-push that ensures nothing.
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
   * **Fail-closed secret gate.** After the reconcile and before the push, the
   * content the push introduces (the commit range `origin/master..HEAD`) is
   * secret-scanned fail-closed. A detected secret or an unavailable scanner
   * refuses the push with a distinct reason and no remote contact, unless the
   * matching off-by-default override is set in the environment —
   * `FIT_WIKI_SECRET_OVERRIDE` permits a finding, `FIT_WIKI_SCANNER_ABSENT_OK`
   * permits a scanner absence. Each override appends an audited line to the wiki
   * tree's `secret-overrides.log` before the push. A *network/credential* push
   * failure is distinct: it still degrades to "saved locally" (the preserved
   * fire-and-forget behaviour).
   *
   * @param {string} message - The commit message.
   * @param {string[]} [paths] - Pathspecs limiting what gets committed.
   * @param {{reapply?: (freshText: string) => string | null, maxReapply?: number}} [options]
   *   `reapply` re-derives the registered file's content from the operation's
   *   own row edit against the fresh tip text; returns the new text or null when
   *   the op is already satisfied on the tip.
   * @returns {Promise<{landed?: boolean, pushed?: boolean, reason: string, findings?: Array<{file: string, line: number, rule: string}>, detections?: object[], workAt?: string}>}
   *   A grounded landing (`{landed: true, reason: "landed"}`), a grounded
   *   nothing-to-push (`{landed: false, reason: "nothing-to-push"}`), a
   *   re-apply landing (`{pushed: true, reason: "reapplied"}` / `already-satisfied`),
   *   or a pre-push gate refusal ({@link WikiSyncRefusal}: `mid-merge`,
   *   `would-publish-markers`, `introduced-scan-failed`, `secret-detected`,
   *   `scanner-unavailable`).
   * @throws {WikiPushFailure} On a non-landed push outcome (D2 taxonomy:
   *   `precondition`, `conflict`, `residue-conflict`, `conservation`,
   *   `rejected`, `transport`).
   * @throws {AncestryRefusal} When the published history cannot be verified.
   * @throws {WikiSyncConflict} When the re-apply budget is exhausted.
   */
  async commitAndPush(message, paths, { reapply, maxReapply = 3 } = {}) {
    // Precondition (D7): refuse mid-rebase before mutating. A
    // detached HEAD is judged by the ancestry guard below (its `unverifiable`
    // refusal and this `precondition` collapse to one observable refusal); the
    // rebase-in-progress check is the residual this guard owns.
    await this.#assertPreconditions();
    // Guard 1 (hole 1): refuse mid-merge before staging. An abandoned merge
    // leaves unmerged hunks or a pinned MERGE_HEAD; sweeping them would
    // silently "complete" the merge and publish the markers. Decidable from
    // the index/working tree alone, so it holds on a shallow clone.
    if (await this.#git.isMidMerge({ cwd: this.#wikiDir })) {
      return WikiSyncRefusal.result("mid-merge");
    }
    // Ancestry guard: refuse a detached/unborn/unrelated history
    // before any mutation.
    await this.#assertPublishable();
    const gitattributesChanged = ensureMetricsCsvMergeAttribute(
      this.#wikiDir,
      this.#runtime.fsSync,
    ).changed;
    // The metrics-CSV declaration must be committed when it was just written,
    // even on the pathspec-scoped path; fold it into the effective pathspec.
    // On a no-payload sweep (`paths` absent), this becomes the sole pathspec
    // [GITATTRIBUTES_FILE], so provisioning still produces exactly one commit
    // rather than sweeping the whole tree via commitAll.
    const commitPaths = gitattributesChanged
      ? [...(paths ?? []), GITATTRIBUTES_FILE]
      : paths;
    if (!(await this.isClean(commitPaths))) {
      if (commitPaths?.length) {
        await this.#git.commitPaths(message, commitPaths, {
          cwd: this.#wikiDir,
        });
      } else {
        await this.#git.commitAll(message, { cwd: this.#wikiDir });
      }
    }

    // Grounded nothing-to-push (D2): assert it only when the
    // observed remote ref already contains local HEAD — never pre-fetch
    // arithmetic, so a stranded-resume tree (clean, ahead) re-pushes.
    const preTip = await this.#observeRemoteTip();
    if (preTip && (await this.#headContainedIn(preTip))) {
      return { landed: false, reason: PUSH_REASONS.NOTHING };
    }

    // Ancestry guard again before the push (the empty-remote allowance is
    // re-derived per call so a failed first publication is re-judged).
    await this.#assertPublishable();
    return this.#reconcileAndPush(message, paths, preTip, {
      reapply,
      maxReapply,
    });
  }

  /**
   * Reconcile on the remote and push, grounding the outcome (D2/D3).
   * Split from {@link commitAndPush} so the bounded ×1 retry (D3) re-enters the
   * ancestry judgment and re-reconciles without duplicating the gates. On a
   * `rejected` outcome it retries once: re-asserts {@link #assertPublishable}
   * (no auto-re-grant), refreshes the observed tip, and replays. The retry
   * never re-pops a conflicted autostash — a `residue-conflict` is refused, not
   * retried.
   *
   * @param {string} message
   * @param {string[]} [paths] - The caller's pathspec (singleton-discipline scope).
   * @param {string[]} [commitPaths] - The effective commit pathspec.
   * @param {string} preTip - The remote tip observed before the first reconcile.
   * @param {{reapply?: function, maxReapply: number}} options
   */
  async #reconcileAndPush(message, paths, preTip, opts) {
    // Bounded retry (D3): at most one reconcile-and-retry on `rejected`. The
    // first iteration uses `preTip`; the retry re-asserts the ancestry judgment
    // (no auto-re-grant) and re-observes the tip before replaying. `transport`,
    // `conflict`, `residue-conflict`, and `conservation` are never retried.
    let tip = preTip;
    for (let attempt = 0; attempt <= 1; attempt++) {
      const outcome = await this.#reconcileAttempt(message, paths, tip, opts);
      if (outcome.result) return outcome.result;
      // A non-landed grounded verdict. `transport` is never retried; `rejected`
      // retries once, re-entering the ancestry judgment first so the
      // empty-remote allowance is never auto-re-granted. Outcome never masked.
      if (outcome.verdict.reason === PUSH_REASONS.TRANSPORT || attempt === 1) {
        throw outcome.verdict.error;
      }
      await this.#assertPublishable();
      tip = await this.#observeRemoteTip();
    }
    // Unreachable: attempt 1 always returns a result or throws above.
    /* c8 ignore next */
    throw new Error("commitAndPush: retry loop fell through");
  }

  /**
   * One reconcile-guards-push attempt. Returns `{ result }` for a terminal
   * outcome (a landed/re-applied push, or a pre-push gate refusal), or
   * `{ verdict }` carrying a non-landed grounded verdict the retry loop reads
   * (it owns the retry decision). Throws for the unsafe-state refusals that are
   * never retried: `conflict`, `residue-conflict`, `conservation`.
   * @param {string} message
   * @param {string[]} [paths] - The caller's pathspec (singleton-discipline scope).
   * @param {string} tip - The remote tip observed before this attempt's reconcile.
   * @param {{reapply?: function, maxReapply: number}} opts
   */
  async #reconcileAttempt(message, paths, tip, opts) {
    const fetched = await this.#fetchObserved();
    const rebase = await this.#git.rebase(REMOTE_BRANCH, {
      cwd: this.#wikiDir,
      autostash: true,
    });

    // Rebase conflict (D2): a non-zero rebase exit is a conflict on the rebase
    // itself. For a registered singleton with a `reapply` op the singleton merge
    // discipline re-derives the row against the fresh tip; the no-intent path
    // fails loud (the `mergeOursStrategy` clobber fallback is removed — the
    // merge-discipline fail-loud floor applies). Checked before the residue read
    // because a stopped rebase also leaves UU markers.
    if (rebase.exitCode !== 0) {
      const resolved = await this.#resolveRebaseConflict(message, paths, opts);
      if (resolved) return { result: resolved };
    }

    // Residue check (D9): the rebase exited 0 but the autostash pop conflicted,
    // leaving unmerged paths — grounded in tree state, the sole conflict-capable
    // autostash site after the clobber fallback's removal. Never retried (D3).
    await this.#assertNoResidue();

    // Guard 3 (hole 3 / Layer 2): refuse to push commits that introduce an
    // unresolved conflict block (the conflict-marker guard).
    const markerRefusal = await this.#refuseIfIntroducedMarkers();
    if (markerRefusal) return { result: markerRefusal };

    // Conservation guard (D5): refuse to drop foreign content present at the
    // observed remote tip unless the removal is a deliberate act.
    await this.#assertConserved(tip, message);

    // Capture the pushed delta now: HEAD is the final (rebased) local tip and
    // origin/master is still the pre-push base (the tier-1 integrity probe).
    const pushedDelta = await this.#capturePushedDelta();

    // Fail-closed secret gate. Scan exactly the commits this push introduces
    // (the reconcile above made the range correct) before any remote contact;
    // a finding or missing scanner refuses unless its own override is set.
    const refusal = await this.#gateOrRefuse();
    if (refusal) return { result: refusal };

    const verdict = await this.#groundedPush(fetched);
    if (verdict.landed) {
      // The push landed; any declared removal it carried is now published, so
      // clear the intent sidecar — it must not leak into an unrelated push.
      this.#clearIntentSidecar();
      const detections = await this.#tier1Probe(pushedDelta);
      return {
        result: { landed: true, reason: PUSH_REASONS.LANDED, detections },
      };
    }
    return { verdict };
  }

  /**
   * Refuse (`residue-conflict`) when the reconcile left unmerged paths — the
   * autostash pop conflicted under an exit-0 rebase (D9). The stash is left
   * intact (git already kept it) and named by SHA for recovery.
   * @throws {WikiPushFailure} `residue-conflict` when the tree carries UU paths.
   */
  async #assertNoResidue() {
    if (!(await this.#hasUnmergedPaths())) return;
    const stashSha = await this.#git.revParse("refs/stash", {
      cwd: this.#wikiDir,
    });
    throw new WikiPushFailure(
      PUSH_REASONS.RESIDUE_CONFLICT,
      "fit-wiki: refusing to push — a foreign writer's residue conflicted " +
        "on the autostash pop; your stash is preserved at " +
        `${stashSha || "refs/stash"} (git stash list). Resolve or pop it ` +
        "from the true tip.",
      { stashSha: stashSha || undefined },
    );
  }

  /**
   * Capture the `origin/master..HEAD` delta for the post-push tier-1 probe. A
   * two-tree range diff (not a single-commit show) is correct even when HEAD is
   * a merge commit. Detection-only: a capture failure degrades to `null` so the
   * probe never gates the push it follows.
   * @returns {Promise<string|null>}
   */
  async #capturePushedDelta() {
    try {
      return await this.#git.diffRange("origin/master HEAD", {
        cwd: this.#wikiDir,
      });
    } catch {
      return null;
    }
  }

  /**
   * Resolve a failed rebase against the fresh tip. Aborts the rebase, then for a
   * registered singleton with a `reapply` op re-derives the row against the tip
   * via the bounded re-apply loop (the singleton merge discipline). Without a
   * registered `reapply` the conflict fails loud: the `-X ours` clobber fallback
   * is **removed** (the merge-discipline fail-loud floor), so the remote side is
   * never mechanically discarded. The rebase is already aborted, leaving the working
   * tree at `orig_head` with the autostash re-applied, so a `conflict` throw
   * loses no uncommitted work.
   * @param {string} message - The commit message.
   * @param {string[]} [paths] - Pathspecs committed.
   * @param {{reapply?: (freshText: string) => string | null, maxReapply: number}} options
   * @returns {Promise<object|null>} A terminal re-apply result, or null when the
   *   conflict resolved (registered op satisfied on the tip) and the push should
   *   proceed.
   * @throws {WikiPushFailure} `conflict` when a non-registered rebase conflicts.
   */
  async #resolveRebaseConflict(message, paths, { reapply, maxReapply }) {
    await this.#git.rebaseAbort({ cwd: this.#wikiDir });
    const registered =
      typeof reapply === "function" &&
      paths?.length === 1 &&
      paths.every((p) => SINGLETON_PATHS.has(p));
    if (registered) {
      return this.#reapplyLoop(message, paths, reapply, maxReapply);
    }
    // No-intent path: fail loud rather than discard the remote side (D2).
    throw new WikiPushFailure(
      PUSH_REASONS.CONFLICT,
      "fit-wiki: refusing to push — rebase conflict with the remote. " +
        "Resolve or retry from the true tip (fit-wiki pull, then push).",
    );
  }

  /**
   * Scan the content introduced by `origin/master..HEAD` for unresolved
   * conflict-marker blocks (Guard 3). Runs after the fetch + rebase/merge
   * resolve, so the diff is against the freshly-fetched origin tip; pre-existing
   * origin corruption is on the base side, never the added side, so an unrelated
   * writer's push is not blocked. A throw from the scan (unresolvable ref on a
   * shallow clone) refuses with a reason — never a silent pass.
   * @returns {Promise<{pushed: false, reason: string}|null>} A refusal result, or
   *   null when nothing introduced would publish a marker.
   */
  async #refuseIfIntroducedMarkers() {
    let introduced;
    try {
      introduced = await this.#git.introducedByFile("origin/master..HEAD", {
        cwd: this.#wikiDir,
      });
    } catch {
      return WikiSyncRefusal.result("introduced-scan-failed");
    }
    for (const [filePath, addedText] of introduced) {
      const hits = scanConflictMarkers(addedText, {
        fenceExempt: pushFenceExempt(filePath),
      });
      if (hits.length > 0) {
        return WikiSyncRefusal.result("would-publish-markers");
      }
    }
    return null;
  }

  /**
   * Tier-1 post-push integrity probe: re-fetch the origin tip and verify the
   * just-pushed delta — the full delta including shared surfaces —
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

  /**
   * Run the secret gate over the push window and decide whether to refuse.
   * Returns a refusal envelope to short-circuit the push, or `null` to proceed
   * (clean, or an override that wrote its audit record). An override appends a
   * secret-free line to `secret-overrides.log` and commits it into the push
   * range before returning `null`.
   *
   * @returns {Promise<{pushed: false, reason: "secret-detected"|"scanner-unavailable", findings?: Array<{file: string, line: number, rule: string}>}|null>}
   */
  async #gateOrRefuse() {
    const env = this.#runtime.proc.env;
    const verdict = await scanPushWindow({
      runtime: this.#runtime,
      wikiDir: this.#wikiDir,
      range: PUSH_RANGE,
    });
    if (verdict.status === "finding") {
      const reason = env.FIT_WIKI_SECRET_OVERRIDE;
      if (!reason) {
        return {
          pushed: false,
          reason: "secret-detected",
          findings: verdict.findings,
        };
      }
      await appendOverrideRecord({
        runtime: this.#runtime,
        gitClient: this.#git,
        wikiDir: this.#wikiDir,
        klass: "finding",
        reason,
        findings: verdict.findings,
      });
    } else if (verdict.status === "scanner-absent") {
      const reason = env.FIT_WIKI_SCANNER_ABSENT_OK;
      if (!reason) {
        return { pushed: false, reason: "scanner-unavailable" };
      }
      await appendOverrideRecord({
        runtime: this.#runtime,
        gitClient: this.#git,
        wikiDir: this.#wikiDir,
        klass: "scanner-absent",
        reason,
      });
    }
    return null;
  }

  /**
   * Refuse before mutating when a rebase is mid-flight (D7). The other D7
   * fixture — a detached HEAD — is deferred to the ancestry guard
   * ({@link #assertPublishable}), where it surfaces as an `AncestryRefusal`
   * ("unverifiable"): the two refusals collapse to one observable refusal, and
   * the ancestry guard owns the reason naming for that fixture. This guard owns
   * only the rebase-in-progress residual, which the ancestry guard does not
   * cover.
   */
  async #assertPreconditions() {
    if (this.#rebaseInProgress()) {
      throw new WikiPushFailure(
        PUSH_REASONS.PRECONDITION,
        "fit-wiki: refusing to act — a rebase is in progress. Resolve or " +
          "abort it before retrying; your uncommitted edit is preserved.",
      );
    }
  }

  /** Whether a rebase is mid-flight (`.git/rebase-merge` or `rebase-apply`). */
  #rebaseInProgress() {
    const gitDir = path.join(this.#wikiDir, ".git");
    return (
      this.#runtime.fsSync.existsSync(path.join(gitDir, "rebase-merge")) ||
      this.#runtime.fsSync.existsSync(path.join(gitDir, "rebase-apply"))
    );
  }

  /** Read the remote ref tip fresh, or "" when absent/unobservable. */
  async #observeRemoteTip() {
    try {
      return await this.#authed().remoteRefTip(REMOTE, BRANCH, {
        cwd: this.#wikiDir,
      });
    } catch {
      return "";
    }
  }

  /** Whether HEAD is contained in `tip` (grounded nothing-to-push). */
  async #headContainedIn(tip) {
    return this.#git.isAncestor("HEAD", tip, { cwd: this.#wikiDir });
  }

  /** Fetch, returning whether it succeeded (feeds the rejected-vs-transport split). */
  async #fetchObserved() {
    try {
      await this.#authed().fetch(REMOTE, BRANCH, { cwd: this.#wikiDir });
      return true;
    } catch {
      return false;
    }
  }

  /** Whether the working tree carries unmerged (conflicted) paths. */
  async #hasUnmergedPaths() {
    const r = await this.#git.statusPorcelain({ cwd: this.#wikiDir });
    return r.stdout
      .split("\n")
      .some((line) => UNMERGED_CODES.has(line.slice(0, 2)));
  }

  /**
   * Refuse (`conservation`) when the would-be-pushed tree drops foreign content
   * present at the observed remote tip, unless a deliberate removal carries it
   * (D5). After a clean rebase HEAD descends from the remote tip, so the
   * tip-first diff (`D`/`M`) is exactly the net effect of the pushed history:
   * a `D` is a foreign file deleted; an `M` carries the pushed history's
   * authored changes, where a row rewritten to a new state is an authored
   * transition (passes) but a row removed without replacement is a drop
   * (refuses). Row identity is the line's leading field, so a `plan approved`
   * written over a foreign row keeps the row key and passes.
   *
   * @param {string} remoteTip - The observed remote tip SHA.
   * @param {string} message - The pushed commit message (carries release intent).
   */
  async #assertConserved(remoteTip, message) {
    if (!remoteTip) {
      this.#reportConservation("pass");
      return;
    }
    const status = await this.#git.diffNameStatus(remoteTip, "HEAD", {
      cwd: this.#wikiDir,
    });
    // When HEAD does not descend from the observed remote tip, the pushed
    // history was written from a stale base and never saw the remote's advance,
    // so a surviving-key row whose value differs from the remote is a stale
    // revert (no authored transition to the restored state in the pushed
    // history), not an approval-propagating transition. Only a HEAD that
    // descends from the remote tip can have authored a transition over it.
    const headAuthoredOverRemote = await this.#git.isAncestor(
      remoteTip,
      "HEAD",
      { cwd: this.#wikiDir },
    );
    const sidecar = this.#readIntentSidecar();
    let declaredAny = false;
    for (const line of status.split("\n")) {
      if (!line) continue;
      const [code, file] = line.split("\t");
      if (code !== "D" && code !== "M") continue; // A/R/etc. add nothing to drop

      const remoteContent = await this.#git.showFile(remoteTip, file, {
        cwd: this.#wikiDir,
      });
      const headContent = await this.#git.showFile("HEAD", file, {
        cwd: this.#wikiDir,
      });
      if (
        !this.#dropsForeignContent(
          remoteContent,
          headContent,
          headAuthoredOverRemote,
        )
      )
        continue;

      if (
        this.#removalDeclared(file, message, sidecar, headAuthoredOverRemote)
      ) {
        declaredAny = true;
        continue;
      }
      this.#reportConservation("refusal");
      throw new WikiPushFailure(
        PUSH_REASONS.CONSERVATION,
        "fit-wiki: refusing to push — it would drop another writer's " +
          `content in ${file} that is present on the remote. Pull and ` +
          "re-apply, or declare the removal if it is deliberate.",
      );
    }
    this.#reportConservation(declaredAny ? "declared-removal" : "pass");
  }

  /**
   * Whether the pushed tree drops foreign content present at the remote tip.
   * A whole-file deletion drops it. Otherwise a remote line is dropped only
   * when neither it **nor a line sharing its identity key** survives in HEAD —
   * so a row rewritten to a new state (an authored transition) is conserved,
   * while a row removed outright is a drop. The pusher's own additive edits
   * never trip this because they remove no remote line.
   *
   * A surviving key with a changed value is an authored transition **only when
   * the pushed history descends from the remote tip** (`headAuthoredOverRemote`).
   * When it does not — a stale-base commit that never saw the remote's advance —
   * the changed value restores a superseded state with no authoring commit, so
   * it is a stale revert and counts as a drop (erases the foreign advance).
   *
   * `showFile` returns `null` for an absent blob; both `null` and `""` mean the
   * file is gone at that ref.
   */
  #dropsForeignContent(remoteContent, headContent, headAuthoredOverRemote) {
    if (remoteContent == null || remoteContent === "") return false;
    if (headContent == null || headContent === "") return true;
    const headLines = headContent.split("\n");
    const headSet = new Set(headLines);
    const headKeys = new Set(headLines.map((l) => this.#rowKey(l)));
    return remoteContent.split("\n").some((line) => {
      if (line.trim() === "") return false;
      if (headSet.has(line)) return false; // exact line survives
      const key = this.#rowKey(line);
      if (key === null) {
        // Unkeyed prose absent from HEAD. When the pushed history descends from
        // the remote tip, the pusher saw this line and authored its edit — a
        // legitimate prose change, not a foreign drop. Only a stale-base commit
        // that never saw the line (a side-pick / clean-replay erasure) drops it.
        return !headAuthoredOverRemote;
      }
      if (!headKeys.has(key)) return true; // key gone outright ⇒ drop
      // Key survives with a changed value: an authored transition only if the
      // pushed history was built over the remote tip; otherwise a stale revert.
      return !headAuthoredOverRemote;
    });
  }

  /**
   * The identity key of a structured row, used to tell an authored transition
   * (same row, new state) from a drop (row gone). For a Markdown table row the
   * key is the **first two cells** — the canonical Active Claims table is keyed
   * by `(agent, target)`, and `agent` alone is non-unique (one agent holds many
   * rows), so a single-cell key would let a real foreign-row drop masquerade as
   * a transition. For a tab-delimited ledger row (e.g. STATUS
   * `id<TAB>phase<TAB>status`) the key is the first field, whose later fields
   * are the state that transitions. Unstructured prose has no stable key
   * (`null`) and is conserved by exact-line match only.
   */
  #rowKey(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      const a = cells[0] ?? "";
      const b = cells[1] ?? "";
      return a || b ? `|${a}|${b}` : null;
    }
    if (line.includes("\t")) return `\t${line.split("\t")[0]}`;
    return null;
  }

  /** Whether the removal of `file` is declared deliberate (release/expiry/sidecar). */
  #removalDeclared(file, message, sidecar, headAuthoredOverRemote) {
    // A claim release/expiry records the deliberate act in the commit message,
    // and a claim/release commit is pathspec-scoped to MEMORY.md — so the
    // exemption is confined to that file, never a whole-tree trim. The blanket
    // message exemption is honored only when HEAD descends from the remote tip:
    // a release authored over current state drops exactly the row it released,
    // but a stale-base release never saw a foreign row another writer added, so
    // it must not blanket-exempt that collateral live-row drop (D5 — the
    // deliberate act is the released row, not a file-level pass).
    if (
      headAuthoredOverRemote &&
      /^wiki: release\b/.test(message) &&
      file === "MEMORY.md"
    )
      return true;
    // The intent sidecar names the specific file and survives a stranded-push
    // retry, so it passes regardless of base freshness (D5 retry-survival).
    return sidecar.includes(file);
  }

  /**
   * Declare that the next push deliberately removes foreign content in `paths`
   * (the cross-lane budget-trim shape, D5). The declaration is recorded
   * clone-locally so it survives a stranded-push retry from the same clone, and
   * is cleared only once a push lands (so the declaration never leaks into an
   * unrelated later push).
   * @param {string[]} paths - Files whose foreign-content removal is deliberate.
   */
  declareRemoval(paths) {
    if (!paths?.length) return;
    const existing = this.#readIntentSidecar();
    const merged = [...new Set([...existing, ...paths])];
    this.#runtime.fsSync.writeFileSync(
      this.#sidecarPath(),
      `${merged.join("\n")}\n`,
    );
  }

  #sidecarPath() {
    return path.join(this.#wikiDir, ".git", "fit-wiki-removal-intent");
  }

  /** Read the clone-local removal-intent sidecar (declared deliberate removals). */
  #readIntentSidecar() {
    const sidecar = this.#sidecarPath();
    if (!this.#runtime.fsSync.existsSync(sidecar)) return [];
    return this.#runtime.fsSync
      .readFileSync(sidecar, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /** Clear the removal-intent sidecar after a landed push. */
  #clearIntentSidecar() {
    const sidecar = this.#sidecarPath();
    if (this.#runtime.fsSync.existsSync(sidecar)) {
      this.#runtime.fsSync.unlinkSync(sidecar);
    }
  }

  /** Emit the per-event conservation self-report at the guard seam (D8). */
  #reportConservation(outcomeClass) {
    this.#runtime.proc.stderr.write(`wiki-conservation: ${outcomeClass}\n`);
  }

  /**
   * Push once and classify the outcome, grounding *landed* in the
   * remote-originated per-ref report or a post-push remote-tip read. Returns a
   * verdict the retry loop reads (it carries the {@link WikiPushFailure} to
   * throw on a terminal non-land so the loop owns the retry decision): a
   * non-landed push is `rejected` when the fetch succeeded, `transport` when it
   * failed or the push itself raised a transport error.
   * @param {boolean} fetched - Whether the pre-push fetch observed the remote.
   * @returns {Promise<{landed: boolean, reason: string, error?: WikiPushFailure}>}
   */
  async #groundedPush(fetched) {
    const client = this.#authed();
    let result;
    try {
      result = await client.pushPorcelain(REMOTE, BRANCH, {
        cwd: this.#wikiDir,
      });
    } catch {
      return {
        landed: false,
        reason: PUSH_REASONS.TRANSPORT,
        error: new WikiPushFailure(
          PUSH_REASONS.TRANSPORT,
          "fit-wiki: push failed at transport (network or credentials). " +
            "Your work is committed locally; retry when connectivity returns.",
        ),
      };
    }
    if (await this.#pushLanded(result)) {
      return { landed: true, reason: PUSH_REASONS.LANDED };
    }
    if (!fetched) {
      return {
        landed: false,
        reason: PUSH_REASONS.TRANSPORT,
        error: new WikiPushFailure(
          PUSH_REASONS.TRANSPORT,
          "fit-wiki: push did not land and the remote could not be observed " +
            "(network or credentials). Your work is committed locally.",
        ),
      };
    }
    return {
      landed: false,
      reason: PUSH_REASONS.REJECTED,
      error: new WikiPushFailure(
        PUSH_REASONS.REJECTED,
        "fit-wiki: push rejected — the remote advanced. Rerun from the true " +
          "tip (fit-wiki pull, then push).",
      ),
    };
  }

  /**
   * Whether the push landed, grounded in observed remote state: the per-ref
   * `--porcelain` report for `refs/heads/master` (flag ` `/`=` accepted, `!`
   * rejected), falling back to a post-push remote-tip read when the report is
   * unparseable.
   */
  async #pushLanded(result) {
    const verdict = this.#parsePorcelain(result.stdout);
    if (verdict === "accepted") return true;
    if (verdict === "rejected") return false;
    // Ambiguous report ⇒ ground in a fresh remote-tip read.
    const tip = await this.#observeRemoteTip();
    return tip ? this.#headContainedIn(tip) : false;
  }

  /** Classify a `push --porcelain` report for the pushed branch ref. */
  #parsePorcelain(stdout) {
    for (const line of stdout.split("\n")) {
      const fields = line.split("\t");
      if (fields.length < 2) continue;
      const flag = fields[0];
      const refspec = fields[1];
      if (!refspec.includes(`refs/heads/${BRANCH}`)) continue;
      if (flag === " " || flag === "=") return "accepted";
      if (flag === "!") return "rejected";
    }
    return "ambiguous";
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
