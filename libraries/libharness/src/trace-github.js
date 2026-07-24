import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

import { isoTimestamp } from "@forwardimpact/libutil";

import { nameMatchesKey, participantInNames } from "./trace-identity.js";

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
   * List recent workflow runs, optionally filtered by name pattern and by the
   * participant whose trace lane a run carries.
   *
   * Without `participant`, behaviour is unchanged: the workflow-name pattern is
   * the only filter. With `participant`, each name-matched run is resolved
   * against its trace lane (see {@link runMatchesParticipant}) and annotated
   * with a `match` field:
   *   - `"confirmed"` — the participant's lane is present in the run's
   *     artifacts (matrix artifact name, or a member filename in the shared
   *     dispatch artifact).
   *   - `"unconfirmed-pending-artifacts"` — the run's workflow mints trace
   *     artifacts but none exist yet (still running, or completed-but-not-yet
   *     uploaded); reported as a candidate, never silently dropped.
   * Runs that have artifacts but no matching lane are omitted. Participant
   * identity is read from artifact/file *names* only, never from trace content.
   *
   * @param {object} [opts]
   * @param {string} [opts.pattern] - Case-insensitive regex to match workflow name (default: "kata|agent|eval|benchmark" — covers `Kata: Shift`, `Kata: Dispatch`, benchmark-driven eval workflows, and any `agent`-named workflow)
   * @param {number} [opts.limit=50] - Max runs to return from GitHub API
   * @param {string} [opts.lookback="7d"] - How far back to search (e.g. "7d", "24h", "2w")
   * @param {string} [opts.participant] - Participant name; when set, filter/annotate runs by trace lane
   * @returns {Promise<object[]>} Array of {workflow, runId, status, conclusion, createdAt, branch, url[, match]}
   */
  async listRuns(opts = {}) {
    const {
      pattern = "kata|agent|eval|benchmark",
      limit = 50,
      lookback = "7d",
    } = opts;
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
    const matched = runs
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

    if (!opts.participant) return matched;

    const out = [];
    for (const run of matched) {
      const verdict = await this.runMatchesParticipant(
        run.runId,
        opts.participant,
      );
      if (verdict === "omit") continue;
      out.push({ ...run, match: verdict });
    }
    return out;
  }

  /**
   * Decide whether a run carries a participant's trace lane.
   *
   * Matrix hosts name the participant in an artifact name
   * (`trace--<participant>`); dispatch hosts name it in a member filename
   * (`trace--<case>--<participant>.<role>.ndjson`) inside one shared `trace--*`
   * artifact. The GitHub artifacts API exposes only artifact-level metadata, so
   * a matrix lane confirms from the inventory alone, while a dispatch lane
   * requires downloading the shared artifact and listing its extracted member
   * filenames — names only, never trace content.
   *
   * A run whose trace artifacts are absent (still running, or
   * completed-but-not-yet-uploaded) is a candidate, not a drop.
   *
   * @param {number|string} runId
   * @param {string} participant
   * @returns {Promise<"confirmed"|"unconfirmed-pending-artifacts"|"omit">}
   */
  async runMatchesParticipant(runId, participant) {
    const url = `${API}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts`;
    const data = await this.#get(url);
    const artifacts = data.artifacts ?? [];
    const traceArtifacts = artifacts.filter((a) =>
      a.name.startsWith("trace--"),
    );

    // No trace artifacts yet: a candidate the matcher must report, not drop —
    // the lane may upload when the host completes.
    if (traceArtifacts.length === 0) return "unconfirmed-pending-artifacts";

    // Matrix host: the participant is an artifact name. No download.
    if (
      participantInNames(
        traceArtifacts.map((a) => a.name),
        participant,
      )
    ) {
      return "confirmed";
    }

    // Dispatch host: one shared artifact whose members name the participant.
    // Download and list member filenames (names only). Members are nested
    // relative paths (`runs/<taskId>/<idx>/trace--*` on eval artifacts), so
    // match on basenames — the `trace--` prefix check never matches a nested
    // path directly.
    for (const artifact of traceArtifacts) {
      const { files } = await this.downloadTrace(runId, {
        name: artifact.name,
      });
      const basenames = files.map((f) => path.basename(f));
      if (participantInNames(basenames, participant)) return "confirmed";
    }
    return "omit";
  }

  /**
   * Resolve a trace lane path for a known run in one keyed lookup — no run
   * enumeration, no trace-content inspection. The key may be an exact member
   * filename, a case id, or a participant name.
   *
   * Matrix host: the artifact name carries the key (no download). Dispatch
   * host: download every `trace--*` artifact and match member basenames
   * against the key. Exactly one match resolves; several matches throw an
   * error listing the candidates so the caller narrows the key — this
   * deliberately replaces silent first-match, which returned an arbitrary
   * cell's lane on eval runs (every cell emits the same participants).
   *
   * @param {number|string} runId
   * @param {string} key - Exact member filename, case id, or participant name.
   * @param {object} [opts]
   * @param {string} [opts.dir] - Output directory for a downloaded dispatch artifact
   * @returns {Promise<{runId: (number|string), key: string, host: "matrix"|"dispatch", artifact: string, path: string}>}
   * @throws {Error} when the run has no trace artifacts, no member matches
   *   the key, or several members match.
   */
  async findByKey(runId, key, opts = {}) {
    const url = `${API}/repos/${this.owner}/${this.repo}/actions/runs/${runId}/artifacts`;
    const data = await this.#get(url);
    const artifacts = data.artifacts ?? [];
    const traceArtifacts = artifacts.filter((a) =>
      a.name.startsWith("trace--"),
    );
    if (traceArtifacts.length === 0) {
      throw new Error(`No trace artifacts for run ${runId}`);
    }

    // Matrix host: the artifact name carries the key. No download.
    const matrix = traceArtifacts.find((a) =>
      participantInNames([a.name], key),
    );
    if (matrix) {
      return {
        runId,
        key,
        host: "matrix",
        artifact: matrix.name,
        path: matrix.name,
      };
    }

    // Dispatch host: download every shared artifact and collect the members
    // whose basename matches the key (members are nested relative paths).
    // Each artifact extracts into its own subdirectory — a shared extract
    // dir would re-list earlier artifacts' members on every iteration, so a
    // uniquely-matching key on a multi-artifact (sharded) run would throw a
    // spurious ambiguity error.
    const baseDir = opts.dir ?? `/tmp/trace-${runId}`;
    const matches = [];
    for (const artifact of traceArtifacts) {
      const { dir, files } = await this.downloadTrace(runId, {
        name: artifact.name,
        dir: path.join(baseDir, artifact.name),
      });
      for (const member of files) {
        if (nameMatchesKey(path.basename(member), key)) {
          matches.push({ artifact: artifact.name, dir, member });
        }
      }
    }

    if (matches.length === 1) {
      const m = matches[0];
      return {
        runId,
        key,
        host: "dispatch",
        artifact: m.artifact,
        path: path.join(m.dir, m.member),
      };
    }
    if (matches.length > 1) {
      const names = matches.map((m) => m.member).join(", ");
      throw new Error(
        `Ambiguous key "${key}" for run ${runId}: matches ${names}. Narrow the key to a case id or exact filename.`,
      );
    }
    throw new Error(`No trace lane for key "${key}" in run ${runId}`);
  }

  /**
   * Download a trace artifact from a workflow run and extract it.
   *
   * When `opts.name` is set, looks up that exact artifact. Otherwise picks
   * the single `trace--*` artifact if exactly one exists, or throws with a
   * disambiguation list when matrix workflows emit multiple per-participant
   * artifacts (see {@link pickTraceArtifact}).
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
    const artifact = pickTraceArtifact(artifacts, opts.name, runId);

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

    // List extracted files — recursively, since eval artifacts carry nested
    // members (`runs/<taskId>/<idx>/trace--*`).
    const files = await listExtractedFiles(this.runtime, dir);

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
 * List every regular file under `dir` recursively, as paths relative to
 * `dir`, excluding `*.zip` (the downloaded archive itself). Sorted for a
 * deterministic member order.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
export async function listExtractedFiles(runtime, dir) {
  const entries = await runtime.fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((e) => e.isFile() && !e.name.endsWith(".zip"))
    .map((e) => path.relative(dir, path.join(e.parentPath ?? e.path, e.name)))
    .sort();
}

/**
 * Pick the trace artifact to download from a workflow run's artifact list.
 *
 * When `name` is given, returns the exact match or throws with the available
 * names. When `name` is omitted, returns the only `trace--*` artifact if
 * there is exactly one; if there are multiple (matrix workflows like
 * `kata-shift.yml` emit one `trace--<participant>` per cell), throws and
 * lists them so the caller can pass `--name` to disambiguate.
 *
 * @param {Array<{name: string}>} artifacts - Artifact list from the GitHub API.
 * @param {string} [name] - Exact artifact name to match.
 * @param {number|string} [runId] - Run id for error messages.
 * @returns {{name: string}} The selected artifact.
 */
export function pickTraceArtifact(artifacts, name, runId) {
  const runRef = runId == null ? "" : ` for run ${runId}`;
  if (name) {
    const found = artifacts.find((a) => a.name === name);
    if (found) return found;
    const available = artifacts.map((a) => a.name).join(", ");
    throw new Error(
      `No artifact named "${name}"${runRef}. Available: ${available || "none"}`,
    );
  }

  const traceArtifacts = artifacts.filter((a) => a.name.startsWith("trace--"));
  if (traceArtifacts.length === 1) return traceArtifacts[0];
  if (traceArtifacts.length === 0) {
    const available = artifacts.map((a) => a.name).join(", ");
    throw new Error(
      `No trace artifact found${runRef}. Available: ${available || "none"}`,
    );
  }
  const names = traceArtifacts.map((a) => a.name).join(", ");
  throw new Error(
    `Multiple trace artifacts found${runRef}: ${names}. Pass --name to choose one.`,
  );
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
