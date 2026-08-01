/**
 * The client throws this error when a git subcommand exits non-zero.
 */
export class GitError extends Error {
  /**
   * @param {string} subcmd - The git subcommand that failed.
   * @param {{stdout: string, stderr: string, exitCode: number}} result
   */
  constructor(subcmd, result) {
    super(
      `git ${subcmd} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = "GitError";
    this.exitCode = result.exitCode;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}

// Resolve a `git diff` "+++ <target>" header to a working-tree path, or null
// for a deletion ("+++ /dev/null"). The "b/" prefix is git's destination side.
function parseDiffTarget(headerLine) {
  const target = headerLine.slice(4).trim();
  return target.startsWith("b/") ? target.slice(2) : null;
}

/**
 * Reject `:`-prefixed pathspec entries before they reach git. A leading `:`
 * marks git pathspec magic (`:/`, `:(exclude)…`, `:(glob)…`). The `--`
 * separator does NOT neutralise that magic. `--` ends OPTION parsing only.
 * A dynamically derived filename that starts with `:` could widen a scoped
 * commit beyond the named files. So the path-forwarding methods
 * (`commitPaths`, `status`) reject it at entry and never pass it to git.
 * @param {string[]} [paths]
 */
function assertSafePaths(paths) {
  for (const p of paths ?? []) {
    if (typeof p === "string" && p.startsWith(":")) {
      throw new Error(
        `unsafe pathspec: ':'-prefixed entries are rejected (got '${p}'). ` +
          "':' magic survives the '--' separator and could widen the commit",
      );
    }
  }
}

/**
 * Typed wrapper over the `git` CLI. Every subprocess call goes through the
 * injected `runtime.subprocess`. So callers never import `node:child_process`.
 * Tests inject `createMockSubprocess`. Methods resolve to the raw
 * `{ stdout, stderr, exitCode }` result. `#run` throws a {@link GitError}
 * on a non-zero exit unless the caller sets `allowFailure`.
 */
export class GitClient {
  #runtime;
  #token;

  /**
   * @param {object} options
   * @param {import('./runtime.js').Runtime} options.runtime - The runtime bag.
   * @param {string} [options.token] - Optional auth token threaded into env.
   */
  constructor({ runtime, token }) {
    if (!runtime) throw new Error("runtime is required");
    this.#runtime = runtime;
    this.#token = token;
  }

  /**
   * Clone `url` into `dir`. `opts.config` carries `-c key=value` entries. Git
   * applies them to this one invocation. An example is an `insteadOf` rewrite
   * that must be in effect before any remote contact, because the clone
   * predates the local `.git/config`.
   */
  async clone(url, dir, opts = {}) {
    return this.#run("clone", [url, dir, ...this.#flagOpts(opts)], {
      config: opts.config,
    });
  }

  /** Initialise a repository at `dir`. */
  async init(dir) {
    return this.#run("init", [dir]);
  }

  /** Fetch `refspec` from `remote`. */
  async fetch(remote = "origin", refspec, { cwd } = {}) {
    const args = ["fetch", remote];
    if (refspec) args.push(refspec);
    return this.#runRaw(args, { cwd });
  }

  /**
   * Return `git status --porcelain` output. `paths` limits the output when the
   * caller supplies it.
   * @param {object} [options]
   * @param {string} [options.cwd]
   * @param {string[]} [options.paths] - Pathspecs to scope the status to.
   *   {@link assertSafePaths} rejects `:`-prefixed entries.
   */
  async status({ cwd, paths } = {}) {
    assertSafePaths(paths);
    const args = ["status", "--porcelain"];
    if (paths?.length) args.push("--", ...paths);
    return this.#runRaw(args, { cwd });
  }

  /** Rebase the current branch onto `upstream`, optionally with a merge strategy. */
  async rebase(upstream, { cwd, strategy, autostash = false } = {}) {
    const args = ["rebase"];
    if (autostash) args.push("--autostash");
    if (strategy) args.push("-X", strategy);
    args.push(upstream);
    return this.#runRaw(args, { cwd, allowFailure: true });
  }

  /** Abort an in-progress rebase. The working tree keeps its pre-rebase state. */
  async rebaseAbort({ cwd } = {}) {
    return this.#runRaw(["rebase", "--abort"], { cwd, allowFailure: true });
  }

  /**
   * Move HEAD to `ref`. This does not touch the index or the working tree
   * (`git reset --soft`). It drops local commits ahead of `ref`. It keeps every
   * uncommitted change in place, including foreign residue from parallel
   * writers. A `--hard` reset does not keep them.
   */
  async resetSoft(ref, { cwd } = {}) {
    return this.#runRaw(["reset", "--soft", ref], { cwd });
  }

  /**
   * Reset only `paths` to their content at `ref` (`git checkout <ref> --
   * <paths>`). The rest of the working tree stays untouched. With
   * `allowMissing`, a path absent on `ref` yields a non-zero result and does
   * not throw. An example is a founding write of a file the tip does not yet
   * carry.
   * @param {string} ref
   * @param {string[]} paths
   * @param {{cwd?: string, allowMissing?: boolean}} [options]
   */
  async checkoutPaths(ref, paths, { cwd, allowMissing = false } = {}) {
    return this.#runRaw(["checkout", ref, "--", ...paths], {
      cwd,
      allowFailure: allowMissing,
    });
  }

  /**
   * Merge `ref` into the current branch. `-X ours` resolves the conflicts.
   * With `allowFailure`, a non-zero exit resolves to the raw result and does
   * not throw. The caller can then abort and refuse. It does not strand a
   * mid-merge tree.
   */
  async mergeOursStrategy({
    cwd,
    ref,
    autostash = false,
    allowFailure = false,
  }) {
    const args = ["merge"];
    if (autostash) args.push("--autostash");
    args.push("-X", "ours", "--no-edit", ref);
    return this.#runRaw(args, { cwd, allowFailure });
  }

  /** Abort an in-progress merge. This restores the pre-merge state. */
  async mergeAbort({ cwd } = {}) {
    return this.#runRaw(["merge", "--abort"], { cwd, allowFailure: true });
  }

  /**
   * Paths with an unmerged index entry (`git status --porcelain` rows whose XY
   * status is a U-family code: `UU`/`AA`/`DD`/`AU`/`UA`/`DU`/`UD`). The index
   * alone decides this. It needs no history resolution. So it holds on a
   * shallow clone.
   */
  async unmergedPaths({ cwd } = {}) {
    const result = await this.#runRaw(["status", "--porcelain"], { cwd });
    const unmerged = /^(DD|AU|UD|UA|DU|AA|UU)/;
    return result.stdout
      .split("\n")
      .filter((line) => unmerged.test(line))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
  }

  /**
   * Whether the repository is mid-merge. The repository is mid-merge when an
   * unmerged index entry exists or a MERGE_HEAD is pinned. Both signals are
   * local to the clone. So this holds at any fetch depth.
   */
  async isMidMerge({ cwd } = {}) {
    if ((await this.unmergedPaths({ cwd })).length > 0) return true;
    const head = await this.#runRaw(
      ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
      { cwd, allowFailure: true },
    );
    return head.exitCode === 0;
  }

  /**
   * The content that `range` introduces (e.g. `origin/master..HEAD`), grouped
   * by path. Returns a `Map<path, addedText>`. `addedText` is the added side
   * of the diff. The method strips the leading `+` from each hunk line. It
   * excludes the `+++`/`---` file headers. So line-anchored scanners match at
   * column 1.
   * Throws {@link GitError} on a non-zero exit (e.g. an unresolvable ref).
   * Callers must treat a throw as refuse-with-reason. A silent pass is never
   * correct.
   */
  async introducedByFile(range, { cwd } = {}) {
    const result = await this.#runRaw(["diff", "--no-color", range], { cwd });
    const byFile = new Map();
    let current = null;
    for (const line of result.stdout.split("\n")) {
      if (line.startsWith("+++ ")) {
        current = parseDiffTarget(line);
        if (current && !byFile.has(current)) byFile.set(current, []);
      } else if (current && line.startsWith("+")) {
        byFile.get(current).push(line.slice(1));
      }
    }
    return new Map([...byFile].map(([p, lines]) => [p, lines.join("\n")]));
  }

  /** Stage all changes and commit with `message`. */
  async commitAll(message, { cwd, author } = {}) {
    await this.#runRaw(["add", "-A"], { cwd });
    const args = ["commit", "-m", message];
    if (author) args.push("--author", author);
    return this.#runRaw(args, { cwd });
  }

  /**
   * Stage and commit only `paths`. The rest of the working tree stays
   * untouched. The commit carries the same pathspec. So the commit never
   * sweeps in content that other writers staged.
   * @param {string} message
   * @param {string[]} paths - Pathspecs to stage and commit.
   *   {@link assertSafePaths} rejects `:`-prefixed entries. So a dynamically
   *   derived filename can never widen the commit beyond the named files.
   * @param {{cwd?: string, author?: string}} [options]
   */
  async commitPaths(message, paths, { cwd, author } = {}) {
    assertSafePaths(paths);
    await this.#runRaw(["add", "--", ...paths], { cwd });
    const args = ["commit", "-m", message];
    if (author) args.push("--author", author);
    args.push("--", ...paths);
    return this.#runRaw(args, { cwd });
  }

  /** Push `branch` to `remote`. */
  async push(remote = "origin", branch, { cwd, force = false } = {}) {
    const args = ["push", remote];
    if (branch) args.push(branch);
    if (force) args.push("--force-with-lease");
    return this.#runRaw(args, { cwd });
  }

  /**
   * List commits in `ref` authored by `author`, newest first, as
   * `{sha, when}` where `when` is the commit epoch seconds (`%ct`). Excludes
   * merge commits. Returns `[]` on any git failure (e.g. an unborn ref).
   * @param {string} author - Author match (git `--author=` pattern).
   * @param {{cwd?: string, ref?: string}} [opts]
   * @returns {Promise<Array<{sha: string, when: number}>>}
   */
  async logByAuthor(author, { cwd, ref = "HEAD" } = {}) {
    const r = await this.#runRaw(
      ["log", ref, `--author=${author}`, "--no-merges", "--format=%H %ct"],
      { cwd, allowFailure: true },
    );
    if (r.exitCode !== 0) return [];
    return r.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, ct] = line.split(" ");
        return { sha, when: Number.parseInt(ct, 10) };
      });
  }

  /**
   * Unified-diff text (`--unified=0`) of a two-tree `range` (e.g. `"A B"` or
   * `"A..B"`), or `null` on git failure. This method uses a two-tree range
   * diff and never a single-commit `git show`, so it diffs merge commits
   * correctly. An empty string is a legitimate empty diff. `null` is an error.
   * Callers distinguish them.
   * @param {string} range - Range spec. The method splits it on spaces into
   *   git args.
   * @param {{cwd?: string}} [opts]
   * @returns {Promise<string|null>}
   */
  async diffRange(range, { cwd } = {}) {
    const r = await this.#runRaw(
      ["diff", "--no-color", "--unified=0", ...range.split(" ")],
      { cwd, allowFailure: true },
    );
    return r.exitCode === 0 ? r.stdout : null;
  }

  /**
   * Read the text of `filePath` at tree-ish `ref` with `git show <ref>:<path>`.
   * Returns `null` when the path is absent at that ref. Throws
   * {@link GitError} when the ref itself is unreadable (e.g. pruned below a
   * shallow boundary). So a caller that measures a tree never silently
   * mistakes an unreadable ref for an empty file.
   * @param {string} ref - The ref to read from (e.g. `"origin/master"`).
   * @param {string} filePath - Repo-relative path.
   * @param {{cwd?: string}} [opts]
   * @returns {Promise<string|null>}
   */
  async showFile(ref, filePath, { cwd } = {}) {
    const r = await this.#runRaw(["show", `${ref}:${filePath}`], {
      cwd,
      allowFailure: true,
    });
    if (r.exitCode === 0) return r.stdout;
    // An absent path at a valid ref gives stderr "does not exist in" or
    // "exists on disk, but not in". Any other failure (e.g. "invalid object
    // name") is an unreadable ref. It must throw and must not degrade to an
    // empty blob.
    if (/does not exist in|exists on disk, but not in/.test(r.stderr)) {
      return null;
    }
    throw new GitError(`show ${ref}:${filePath}`, r);
  }

  /** Count commits in `range` (`git rev-list --count`). */
  async revListCount(range, { cwd }) {
    const result = await this.#runRaw(["rev-list", "--count", range], { cwd });
    return Number.parseInt(result.stdout.trim(), 10);
  }

  /** Read a config `key`. */
  async configGet(key, { cwd } = {}) {
    const result = await this.#runRaw(["config", "--get", key], {
      cwd,
      allowFailure: true,
    });
    return result.stdout.trim();
  }

  /** Set a config `key` to `value`. */
  async configSet(key, value, { cwd } = {}) {
    return this.#runRaw(["config", key, value], { cwd });
  }

  /** Count commits the current branch is ahead of `upstream`. */
  async aheadCount({ cwd, upstream = "@{upstream}" } = {}) {
    return this.revListCount(`${upstream}..HEAD`, { cwd });
  }

  /** Read the URL configured for `remote`. */
  async remoteGetUrl(remote = "origin", { cwd }) {
    const result = await this.#runRaw(["remote", "get-url", remote], { cwd });
    return result.stdout.trim();
  }

  /**
   * Push `branch` to `remote` with the machine-readable per-ref status
   * (`--porcelain`). Runs with `allowFailure`. The caller classifies the
   * outcome from the remote-originated per-ref line. The exit code does not
   * decide it. The line is `<flag>\t<src>:<dst>\t<summary>`. A flag of ` ` or
   * `=` means accepted. A flag of `!` means rejected.
   */
  async pushPorcelain(remote = "origin", branch, { cwd } = {}) {
    const args = ["push", "--porcelain", remote];
    if (branch) args.push(branch);
    return this.#runRaw(args, { cwd, allowFailure: true });
  }

  /**
   * The commit SHA the remote ref points at, read fresh with `ls-remote`.
   * Throws a {@link GitError} on transport failure. Returns "" when the ref
   * does not exist on the remote.
   */
  async remoteRefTip(remote = "origin", branch, { cwd } = {}) {
    const r = await this.#runRaw(["ls-remote", remote, branch], { cwd });
    return r.stdout.split("\t")[0]?.trim() ?? "";
  }

  /** Whether `ancestor` is an ancestor of `descendant` (`merge-base --is-ancestor`). */
  async isAncestor(ancestor, descendant, { cwd } = {}) {
    const r = await this.#runRaw(
      ["merge-base", "--is-ancestor", ancestor, descendant],
      { cwd, allowFailure: true },
    );
    return r.exitCode === 0;
  }

  /** `git status --porcelain` output (for unmerged-path detection). */
  async statusPorcelain({ cwd } = {}) {
    return this.#runRaw(["status", "--porcelain"], { cwd });
  }

  /**
   * The short name of the branch HEAD points at, or "" when HEAD is detached.
   * An unborn HEAD on a branch (no commits yet) still returns that branch name.
   * `symbolic-ref` reads the ref HEAD targets. It does not read whether that
   * ref resolves. `symbolic-ref -q HEAD` exits non-zero on a detached HEAD.
   * This method swallows that exit code.
   */
  async headBranch({ cwd } = {}) {
    const r = await this.#runRaw(["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd,
      allowFailure: true,
    });
    return r.stdout.trim();
  }

  /** Whether `ref` resolves to a commit (`rev-parse --verify`). */
  async refExists(ref, { cwd } = {}) {
    const r = await this.#runRaw(
      ["rev-parse", "--verify", "-q", `${ref}^{commit}`],
      { cwd, allowFailure: true },
    );
    return r.exitCode === 0;
  }

  /**
   * Whether `a` and `b` share a merge-base within the fetched history.
   * `git merge-base` exits 1 (not an error) when no base exists. So this runs
   * with `allowFailure`. It reads the exit code and does not throw.
   */
  async mergeBaseExists(a, b, { cwd } = {}) {
    const r = await this.#runRaw(["merge-base", a, b], {
      cwd,
      allowFailure: true,
    });
    return r.exitCode === 0;
  }

  /**
   * Whether `branch` exists on `remote` (`ls-remote --heads`). Throws a
   * {@link GitError} when the remote cannot be observed, so callers can
   * distinguish a genuinely empty remote from a failed observation.
   */
  async remoteBranchExists(remote, branch, { cwd } = {}) {
    const r = await this.#runRaw(["ls-remote", "--heads", remote, branch], {
      cwd,
    });
    return r.stdout.trim() !== "";
  }

  /**
   * Deepen history to full depth for `branch` from `remote`. Runs with
   * `allowFailure` because `--unshallow` errors on a complete clone. Callers
   * gate this behind a shallow-clone check. They treat a non-zero exit as
   * "deepening failed".
   */
  async fetchDeepen(remote, branch, { cwd } = {}) {
    return this.#runRaw(["fetch", "--unshallow", remote, branch], {
      cwd,
      allowFailure: true,
    });
  }

  /**
   * List the tags and heads a remote `url` exposes. This does not clone.
   * Returns the raw `{ stdout, stderr, exitCode }` so callers can distinguish
   * exit 0 (refs listed), exit 128 (auth demand for an absent or private
   * repo), and transport faults. `#runRaw` handles auth and env. A tokenless
   * client transports anonymously. `GIT_TERMINAL_PROMPT` is whatever the
   * runtime's `proc.env` carries.
   * @param {string} url - The repository URL (e.g. `https://github.com/owner/repo`).
   * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
   */
  async lsRemote(url) {
    return this.#runRaw(["ls-remote", "--tags", "--heads", url], {
      allowFailure: true,
    });
  }

  /**
   * Resolve `ref` to a commit SHA, or "" when it does not resolve
   * (`rev-parse --verify -q`, swallowed).
   */
  async revParse(ref, { cwd } = {}) {
    const r = await this.#runRaw(["rev-parse", "--verify", "-q", ref], {
      cwd,
      allowFailure: true,
    });
    return r.exitCode === 0 ? r.stdout.trim() : "";
  }

  /**
   * Name-status lines between two tree-ish (`<code>\t<path>`). Read the codes
   * from `a` to `b`. A path present in `a` but gone in `b` is `D`. A modified
   * path is `M`. An added path is `A`. The conservation guard calls it
   * tip-first (a = remote tip, b = HEAD) so a dropped foreign file reads `D`.
   */
  async diffNameStatus(a, b, { cwd } = {}) {
    const r = await this.#runRaw(["diff", "--name-status", a, b], { cwd });
    return r.stdout.trim();
  }

  /** Drop a stash addressed by SHA, never by stack position (`stash drop <sha>`). */
  async stashDropBySha(sha, { cwd } = {}) {
    return this.#runRaw(["stash", "drop", sha], { cwd, allowFailure: true });
  }

  /** Return a new client that threads `token` into the git env. */
  withAuth(token) {
    return new GitClient({ runtime: this.#runtime, token });
  }

  #flagOpts(opts) {
    const flags = [];
    if (opts.depth) flags.push("--depth", String(opts.depth));
    if (opts.branch) flags.push("--branch", opts.branch);
    if (opts.bare) flags.push("--bare");
    return flags;
  }

  #run(subcmd, args, { cwd, allowFailure = false, config } = {}) {
    return this.#runRaw([subcmd, ...args], { cwd, allowFailure, config });
  }

  async #runRaw(args, { cwd, allowFailure = false, config = [] } = {}) {
    // Per-invocation `-c key=value` config (e.g. an `insteadOf` rewrite). These
    // precede the subcommand because git only honours `-c` before the verb.
    const configFlags = (config ?? []).flatMap((entry) => ["-c", entry]);
    // Authenticate over HTTPS with a per-invocation Basic auth header. Git's
    // `-c` config carries it (the `-c http.extraHeader` must precede the
    // subcommand). GitHub's git-over-HTTPS expects the token as the password
    // in HTTP Basic auth (username `x-access-token`). GitHub rejects a
    // `bearer` scheme for PAT/OAuth tokens. That scheme works only for App
    // installation tokens. So Basic is the broadly-compatible choice. No-op
    // when the client carries no token.
    const authFlags = this.#token
      ? [
          "-c",
          `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${this.#token}`).toString("base64")}`,
        ]
      : [];
    const fullArgs = [...configFlags, ...authFlags, ...args];
    const result = await this.#runtime.subprocess.run("git", fullArgs, {
      cwd,
      env: this.#runtime.proc.env,
    });
    if (!allowFailure && result.exitCode !== 0) {
      throw new GitError(args.join(" "), result);
    }
    return result;
  }
}
