import { spawnSync } from "node:child_process";

const CREDENTIAL_HELPER_BODY =
  '!f() { echo username=x-access-token; echo "password=${GH_TOKEN:-$GITHUB_TOKEN}"; }; f';

/** Error thrown when a wiki pull encounters a rebase conflict that cannot be resolved automatically. */
export class WikiPullConflict extends Error {
  /** Create a WikiPullConflict with the stderr output from the failed rebase. */
  constructor(stderr) {
    super("rebase conflict on pull");
    this.name = "WikiPullConflict";
    this.stderr = stderr;
  }
}

/** Prepend credential-helper config arguments to a git command when a token is available. */
export function buildAuthArgs(args, token) {
  if (token) {
    return [
      "-c",
      "credential.helper=",
      "-c",
      `credential.helper=${CREDENTIAL_HELPER_BODY}`,
      ...args,
    ];
  }
  return [...args];
}

/** Git operations wrapper for the GitHub wiki repository used as agent team memory. */
export class WikiRepo {
  #wikiDir;
  #parentDir;
  #resolveToken;

  /**
   * Create a WikiRepo targeting the given wiki directory and its parent project directory.
   * @param {{ wikiDir: string, parentDir: string, resolveToken: () => string | null }} opts
   *   `resolveToken` is called lazily before each network operation. Return a
   *   GitHub token string to authenticate, or `null` to run anonymously. The
   *   callback owns the entire resolution policy — libwiki does not read
   *   `process.env` directly. Throws propagate to the caller so credential
   *   misconfiguration surfaces loudly. Commands typically pass
   *   `() => config.ghToken()` from `@forwardimpact/libconfig`.
   */
  constructor({ wikiDir, parentDir, resolveToken }) {
    if (typeof wikiDir !== "string" || wikiDir === "") {
      throw new TypeError("WikiRepo: wikiDir must be a non-empty string");
    }
    if (typeof parentDir !== "string" || parentDir === "") {
      throw new TypeError("WikiRepo: parentDir must be a non-empty string");
    }
    if (typeof resolveToken !== "function") {
      throw new TypeError("WikiRepo: resolveToken callback is required");
    }
    this.#wikiDir = wikiDir;
    this.#parentDir = parentDir;
    this.#resolveToken = resolveToken;
  }

  /** Check whether the wiki directory is an initialized git repository. */
  isCloned() {
    const r = spawnSync(
      "git",
      ["-C", this.#wikiDir, "rev-parse", "--git-dir"],
      {
        stdio: "pipe",
      },
    );
    return r.status === 0;
  }

  /** Clone the wiki from the given URL if it is not already cloned. */
  ensureCloned(url) {
    if (this.isCloned()) return { cloned: true, reason: "already-cloned" };
    const r = this.#authGit(["clone", url, this.#wikiDir]);
    if (r.status !== 0) {
      return {
        cloned: false,
        reason: r.stderr?.toString().trim() || "clone failed",
      };
    }
    return { cloned: true, reason: "cloned" };
  }

  /** Copy git user.name and user.email from the parent repository into the wiki repository. */
  inheritIdentity() {
    const name = this.#parentConfig("user.name");
    const email = this.#parentConfig("user.email");
    if (name) this.#git(["config", "user.name", name]);
    if (email) this.#git(["config", "user.email", email]);
  }

  /** Fetch the latest master branch from the wiki remote using token auth if available. */
  fetch() {
    this.#authGit(["-C", this.#wikiDir, "fetch", "origin", "master"]);
  }

  /** Return true if the wiki working tree has no uncommitted changes. */
  isClean() {
    const r = this.#git(["status", "--porcelain"]);
    return r.stdout.toString().trim() === "";
  }

  /** Fetch and rebase on origin/master, throwing WikiPullConflict if the rebase fails. */
  pull() {
    this.fetch();
    const r = this.#git(["rebase", "origin/master"]);
    if (r.status !== 0) {
      this.#git(["rebase", "--abort"]);
      throw new WikiPullConflict(r.stderr?.toString().trim() || "");
    }
  }

  /** Stage and commit any working-tree changes, then fetch, rebase on origin/master (falling back to a merge with -X ours if rebase fails), and push if HEAD is ahead of origin/master. The commit gate and the push gate are independent so a clean tree with local commits still pushes. */
  commitAndPush(message) {
    const hasWorkingTreeChanges = !this.isClean();
    if (hasWorkingTreeChanges) {
      this.#git(["add", "-A"]);
      this.#git(["commit", "-m", message]);
    }
    if (!this.#hasCommitsAhead()) {
      return { pushed: false, reason: "clean" };
    }
    this.fetch();
    const rebase = this.#git(["rebase", "origin/master"]);
    if (rebase.status !== 0) {
      this.#git(["rebase", "--abort"]);
      this.#git(["merge", "origin/master", "-X", "ours", "--no-edit"]);
    }
    this.#authGit(["-C", this.#wikiDir, "push", "origin", "master"]);
    return { pushed: true, reason: "pushed" };
  }

  #hasCommitsAhead() {
    const r = this.#git(["rev-list", "--count", "origin/master..HEAD"]);
    const count = parseInt(r.stdout?.toString().trim() || "0", 10);
    return count > 0;
  }

  #parentConfig(key) {
    const r = spawnSync(
      "git",
      ["-C", this.#parentDir, "config", "--get", key],
      {
        stdio: "pipe",
      },
    );
    return r.status === 0 ? r.stdout.toString().trim() : null;
  }

  #git(args) {
    return spawnSync("git", ["-C", this.#wikiDir, ...args], { stdio: "pipe" });
  }

  #authGit(args) {
    const token = this.#resolveToken();
    const fullArgs = buildAuthArgs(args, token);
    // The credential helper body keeps `${GH_TOKEN:-$GITHUB_TOKEN}` literal so
    // git's child shell expands it at auth time — the token never sits in argv.
    // Inject the resolved token into the spawn env so the helper's lazy
    // expansion finds it even when the resolver pulled from `.env` or
    // `gh auth token` rather than the ambient process env.
    const env = token ? { ...process.env, GH_TOKEN: token } : undefined;
    return spawnSync("git", fullArgs, { stdio: "pipe", env });
  }
}
