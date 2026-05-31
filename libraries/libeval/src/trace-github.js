import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { isoTimestamp } from "@forwardimpact/libutil";

const API = "https://api.github.com";

/**
 * GitHub API client for trace-related operations: listing workflow runs
 * and downloading trace artifacts.
 */
export class TraceGitHub {
  /**
   * @param {object} deps
   * @param {string} deps.token - GitHub token
   * @param {string} deps.owner - Repository owner
   * @param {string} deps.repo  - Repository name
   * @param {import("@forwardimpact/libutil/runtime").Runtime} deps.runtime -
   *   Ambient collaborators; uses `fs`, `subprocess`, `clock`.
   */
  constructor({ token, owner, repo, runtime }) {
    if (!runtime) throw new Error("runtime is required");
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.runtime = runtime;
  }

  /**
   * List recent workflow runs, optionally filtered by name pattern.
   *
   * @param {object} [opts]
   * @param {string} [opts.pattern] - Case-insensitive substring to match workflow name (default: "agent")
   * @param {number} [opts.limit=50] - Max runs to return from GitHub API
   * @param {string} [opts.lookback="7d"] - How far back to search (e.g. "7d", "24h", "2w")
   * @returns {Promise<object[]>} Array of {workflow, runId, status, conclusion, createdAt, branch, url}
   */
  async listRuns(opts = {}) {
    const { pattern = "agent", limit = 50, lookback = "7d" } = opts;
    const cutoff = parseLookback(lookback, this.runtime.clock.now());

    const params = new URLSearchParams({
      per_page: String(Math.min(limit, 100)),
    });
    if (cutoff) {
      params.set("created", `>=${cutoff}`);
    }

    const url = `${API}/repos/${this.owner}/${this.repo}/actions/runs?${params}`;
    const data = await this.#get(url);
    const runs = data.workflow_runs ?? [];

    const re = new RegExp(pattern, "i");
    return runs
      .filter((r) => re.test(r.name))
      .map((r) => ({
        workflow: r.name,
        runId: r.id,
        status: r.status,
        conclusion: r.conclusion,
        createdAt: r.created_at,
        branch: r.head_branch,
        url: r.html_url,
      }));
  }

  /**
   * Download a trace artifact from a workflow run and extract it.
   *
   * When `opts.name` is set, looks up that exact artifact. Otherwise picks the
   * best match from the unified `trace--<case>--<participant>.<role>` naming
   * convention: prefer a `*.raw` artifact (combined log), then any `*.agent`,
   * then the first `trace--*` artifact found.
   *
   * @param {number|string} runId
   * @param {object} [opts]
   * @param {string} [opts.dir] - Output directory (default: /tmp/trace-<runId>)
   * @param {string} [opts.name] - Specific artifact name to download
   * @returns {Promise<{dir: string, artifact: string, files: string[]}>}
   */
  async downloadTrace(runId, opts = {}) {
    const fs = this.runtime.fs;
    const dir = opts.dir ?? `/tmp/trace-${runId}`;
    await fs.mkdir(dir, { recursive: true });

    // List artifacts for this run.
    const url = `${API}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts`;
    const data = await this.#get(url);
    const artifacts = data.artifacts ?? [];

    // Find the trace artifact.
    let artifact = null;
    if (opts.name) {
      artifact = artifacts.find((a) => a.name === opts.name);
    } else {
      const traceArtifacts = artifacts.filter((a) =>
        a.name.startsWith("trace--"),
      );
      artifact =
        traceArtifacts.find((a) => a.name.endsWith(".raw")) ??
        traceArtifacts.find((a) => a.name.endsWith(".agent")) ??
        traceArtifacts[0] ??
        null;
    }

    if (!artifact) {
      const available = artifacts.map((a) => a.name).join(", ");
      throw new Error(
        `No trace artifact found for run ${runId}. Available: ${available || "none"}`,
      );
    }

    // Download the zip.
    const zipPath = path.join(dir, `${artifact.name}.zip`);
    const downloadUrl = `${API}/repos/${this.owner}/${this.repo}/actions/artifacts/${artifact.id}/zip`;
    const response = await fetch(downloadUrl, {
      headers: this.#headers(),
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download artifact: ${response.status} ${response.statusText}`,
      );
    }

    // Stream to disk then extract.
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(zipPath),
    );

    const unzip = await this.runtime.subprocess.run("unzip", [
      "-o",
      "-q",
      zipPath,
      "-d",
      dir,
    ]);
    if (unzip.exitCode !== 0) {
      throw new Error(
        `unzip failed (${unzip.exitCode}): ${unzip.stderr || unzip.stdout}`,
      );
    }

    // List extracted files.
    const entries = await fs.readdir(dir);
    const files = entries.filter((f) => !f.endsWith(".zip"));

    return { dir, artifact: artifact.name, files };
  }

  /**
   * @param {string} url
   * @returns {Promise<object>}
   */
  async #get(url) {
    const response = await fetch(url, { headers: this.#headers() });
    if (!response.ok) {
      throw new Error(`GitHub API: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /** @returns {Record<string, string>} */
  #headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
}

/**
 * Parse a lookback duration string into an ISO date string.
 * Supports: Nd (days), Nh (hours), Nw (weeks).
 * @param {string} lookback
 * @param {number} nowMs - Current time in ms (`runtime.clock.now()`).
 * @returns {string|null} ISO date string or null if unparseable
 */
function parseLookback(lookback, nowMs) {
  const match = lookback.match(/^(\d+)([dhw])$/);
  if (!match) return null;
  const [, val, unit] = match;
  const ms = { d: 86400000, h: 3600000, w: 604800000 }[unit];
  return isoTimestamp(nowMs - parseInt(val, 10) * ms);
}

/**
 * Parse a GitHub repository URL or "owner/repo" string.
 * @param {string} remote - Git remote URL or owner/repo string
 * @returns {{owner: string, repo: string}}
 */
export function parseGitRemote(remote) {
  // SSH: git@github.com:owner/repo.git
  const ssh = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };

  // HTTPS: https://github.com/owner/repo
  const https = remote.match(/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (https) return { owner: https[1], repo: https[2] };

  // Plain owner/repo format (no github.com prefix).
  const simple = remote.match(/^([^/:@]+)\/([^/]+)$/);
  if (simple) return { owner: simple[1], repo: simple[2] };

  // Generic URL fallback: any remote whose path ends in /owner/repo(.git)?
  // Covers GitHub Enterprise, proxied git URLs, and mirrors.
  const generic = remote.match(/[/:]([^/:@?#]+)\/([^/:@?#]+?)(?:\.git)?\/?$/);
  if (generic) return { owner: generic[1], repo: generic[2] };

  throw new Error(`Cannot parse GitHub remote: ${remote}`);
}

/**
 * Detect the current GitHub repository slug as `{owner, repo}`.
 *
 * Resolution order:
 *   1. `GITHUB_REPOSITORY` env var (set automatically by GitHub Actions).
 *   2. `git remote get-url origin` in the current working directory.
 *
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<{owner: string, repo: string}>}
 * @throws {Error} with a clear message if neither source yields a parseable slug.
 */
export async function detectRepoSlug(runtime) {
  const env = runtime.proc.env.GITHUB_REPOSITORY;
  if (env && env.trim()) {
    return parseGitRemote(env.trim());
  }

  const result = await runtime.subprocess.run("git", [
    "remote",
    "get-url",
    "origin",
  ]);
  const remote = result.exitCode === 0 ? result.stdout.trim() : "";
  if (result.exitCode !== 0) {
    throw new Error(
      "Cannot detect repository: set --repo <owner/repo>, export GITHUB_REPOSITORY, or run inside a git checkout with an 'origin' remote.",
    );
  }

  if (!remote) {
    throw new Error(
      "Cannot detect repository: 'git remote get-url origin' returned an empty value. Pass --repo <owner/repo> or set GITHUB_REPOSITORY.",
    );
  }

  return parseGitRemote(remote);
}

/**
 * Create a TraceGitHub instance. The caller is responsible for resolving
 * the GitHub token — typically via `Config.ghToken()` — so credential
 * loading stays at the CLI entry point.
 *
 * Breaking change from the prior signature: `token` is now a required
 * caller input. Construct a `Config` via `@forwardimpact/libconfig` and
 * pass `config.ghToken()`.
 *
 * @param {object} opts
 * @param {string} opts.token - GitHub token (e.g. from `Config.ghToken()`)
 * @param {string} [opts.repo] - "owner/repo" override (default: detect from git remote)
 * @param {import("@forwardimpact/libutil/runtime").Runtime} opts.runtime - Ambient collaborators.
 * @returns {Promise<TraceGitHub>}
 */
export async function createTraceGitHub(opts = {}) {
  const { token, repo: repoOverride, runtime } = opts;
  if (!runtime) throw new Error("createTraceGitHub: runtime is required");
  if (!token) {
    throw new Error(
      "createTraceGitHub: token is required (pass Config.ghToken())",
    );
  }

  const { owner, repo } = repoOverride
    ? parseGitRemote(repoOverride)
    : await detectRepoSlug(runtime);

  return new TraceGitHub({ token, owner, repo, runtime });
}
