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
   * @param {{ wikiDir: string, parentDir: string, resolveToken?: () => string | null | undefined }} opts
   *   `resolveToken` is called lazily per network operation to obtain a GitHub token.
   *   When omitted, falls back to reading `GH_TOKEN` or `GITHUB_TOKEN` from `process.env`.
   *   Commands typically pass `() => config.ghToken()` so the libconfig resolution chain
   *   (env → `.env` overrides → `gh auth token`) is honored.
   */
  constructor({ wikiDir, parentDir, resolveToken }) {
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

  /** Stage all changes, commit with the given message, fetch, rebase on origin/master (falling back to a merge with -X ours if rebase fails), and push. */
  commitAndPush(message) {
    if (this.isClean()) return { pushed: false, reason: "clean" };
    this.#git(["add", "-A"]);
    this.#git(["commit", "-m", message]);
    this.fetch();
    const rebase = this.#git(["rebase", "origin/master"]);
    if (rebase.status !== 0) {
      this.#git(["rebase", "--abort"]);
      this.#git(["merge", "origin/master", "-X", "ours", "--no-edit"]);
    }
    this.#authGit(["-C", this.#wikiDir, "push", "origin", "master"]);
    return { pushed: true, reason: "pushed" };
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
    const token = this.#token();
    const fullArgs = buildAuthArgs(args, token);
    // The credential helper body keeps `${GH_TOKEN:-$GITHUB_TOKEN}` literal so
    // git's child shell expands it at auth time — the token never sits in argv.
    // When libconfig resolves a token from `.env` or `gh auth token` (i.e. it
    // is not on `process.env`), inject GH_TOKEN into the spawn env so the
    // helper's lazy expansion still finds it.
    const env = token ? { ...process.env, GH_TOKEN: token } : undefined;
    return spawnSync("git", fullArgs, { stdio: "pipe", env });
  }

  #token() {
    if (this.#resolveToken) {
      try {
        return this.#resolveToken() || null;
      } catch {
        return null;
      }
    }
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
  }
}
