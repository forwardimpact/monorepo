/**
 * Error thrown when a git subcommand exits non-zero.
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

/**
 * Typed wrapper over the `git` CLI. All shelling-out flows through the
 * injected `runtime.subprocess`, so callers never import `node:child_process`
 * and tests inject `createMockSubprocess`. Methods resolve to the
 * raw `{ stdout, stderr, exitCode }` result; `#run` throws a {@link GitError}
 * on a non-zero exit unless `allowFailure` is set.
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

  /** Clone `url` into `dir`. */
  async clone(url, dir, opts = {}) {
    return this.#run("clone", [url, dir, ...this.#flagOpts(opts)]);
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

  /** Return `git status --porcelain` output. */
  async status({ cwd }) {
    return this.#runRaw(["status", "--porcelain"], { cwd });
  }

  /** Rebase the current branch onto `upstream`, optionally with a merge strategy. */
  async rebase(upstream, { cwd, strategy } = {}) {
    const args = ["rebase"];
    if (strategy) args.push("-X", strategy);
    args.push(upstream);
    return this.#runRaw(args, { cwd, allowFailure: true });
  }

  /** Continue a rebase resolving conflicts with `-X ours`. */
  async mergeOursStrategy({ cwd, ref }) {
    return this.#runRaw(["merge", "-X", "ours", ref], { cwd });
  }

  /** Stage all changes and commit with `message`. */
  async commitAll(message, { cwd, author } = {}) {
    await this.#runRaw(["add", "-A"], { cwd });
    const args = ["commit", "-m", message];
    if (author) args.push("--author", author);
    return this.#runRaw(args, { cwd });
  }

  /** Push `branch` to `remote`. */
  async push(remote = "origin", branch, { cwd, force = false } = {}) {
    const args = ["push", remote];
    if (branch) args.push(branch);
    if (force) args.push("--force-with-lease");
    return this.#runRaw(args, { cwd });
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

  #run(subcmd, args, { cwd, allowFailure = false } = {}) {
    return this.#runRaw([subcmd, ...args], { cwd, allowFailure });
  }

  async #runRaw(args, { cwd, allowFailure = false } = {}) {
    // Authenticate over HTTPS by injecting a per-invocation bearer header via
    // git's `-c` config (the standard token mechanism; `git -c http.extraHeader`
    // must precede the subcommand). No-op when the client carries no token.
    const fullArgs = this.#token
      ? ["-c", `http.extraHeader=AUTHORIZATION: bearer ${this.#token}`, ...args]
      : args;
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
