/**
 * Error thrown when a `gh` subcommand exits non-zero.
 */
export class GhError extends Error {
  /**
   * @param {string} subcmd - The gh subcommand that failed.
   * @param {{stdout: string, stderr: string, exitCode: number}} result
   */
  constructor(subcmd, result) {
    super(
      `gh ${subcmd} failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
    );
    this.name = "GhError";
    this.exitCode = result.exitCode;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}

/**
 * Typed wrapper over the `gh` CLI. Shelling-out flows through the injected
 * `runtime.subprocess` so callers never import `node:child_process` and tests
 * inject `createMockSubprocess`.
 */
export class GhClient {
  #runtime;

  /**
   * @param {object} options
   * @param {import('./runtime.js').Runtime} options.runtime - The runtime bag.
   */
  constructor({ runtime }) {
    if (!runtime) throw new Error("runtime is required");
    this.#runtime = runtime;
  }

  /** Create a pull request. Returns the new PR URL (stdout). */
  async prCreate({ cwd, title, body, base, head } = {}) {
    const args = ["pr", "create"];
    if (title) args.push("--title", title);
    if (body) args.push("--body", body);
    if (base) args.push("--base", base);
    if (head) args.push("--head", head);
    const result = await this.#run(args, { cwd });
    return result.stdout.trim();
  }

  /** Merge a pull request. */
  async prMerge(number, { cwd, method = "squash" } = {}) {
    return this.#run(["pr", "merge", String(number), `--${method}`], { cwd });
  }

  /** GET an API path; returns parsed JSON. */
  async apiGet(path, { cwd } = {}) {
    const result = await this.#run(["api", path], { cwd });
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }

  /**
   * GET every page of a paginated API `path`. Uses `gh api --paginate --slurp`,
   * which wraps the per-page response arrays in one outer JSON array of pages;
   * this parses that once and flattens it into a single array, avoiding the
   * concatenated-but-separate-documents shape a bare `--paginate` produces.
   * Returns `[]` when the response is empty.
   */
  async apiGetPaginated(path, { cwd } = {}) {
    const result = await this.#run(["api", "--paginate", "--slurp", path], {
      cwd,
    });
    if (!result.stdout.trim()) return [];
    const pages = JSON.parse(result.stdout);
    return Array.isArray(pages) ? pages.flat() : pages;
  }

  /** POST to an API path with `fields`; returns parsed JSON. */
  async apiPost(path, fields = {}, { cwd } = {}) {
    const args = ["api", "--method", "POST", path];
    for (const [k, v] of Object.entries(fields)) {
      args.push("-f", `${k}=${v}`);
    }
    const result = await this.#run(args, { cwd });
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }

  async #run(args, { cwd } = {}) {
    const result = await this.#runtime.subprocess.run("gh", args, {
      cwd,
      env: this.#runtime.proc.env,
    });
    if (result.exitCode !== 0) {
      throw new GhError(args.join(" "), result);
    }
    return result;
  }
}
