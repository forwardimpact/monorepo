/**
 * `fit-harness scan-logs` — scan a run's log archive for secret literals and
 * fail closed.
 *
 * A run-lifecycle concern (not an NDJSON trace, so it lives here rather than
 * in `fit-trace`): after a CI run that handled secrets, download or accept the
 * run's own log archive and assert none of a supplied set of literals leaked
 * into it. Any hit exits non-zero; any download/extract failure also exits
 * non-zero — the gate must never silently disarm.
 *
 * Log resolution:
 *   - `--archive <zip>` — an already-resolved archive (extracted locally).
 *   - `--run-id <id> --repo <owner/repo>` — download this run's archive via
 *     `gh` first, then extract.
 *
 * Secrets are `--secret <label>=<literal>`, repeatable. The literal is
 * everything after the FIRST `=` (JWTs and base64 keys contain `=`); the label
 * is only cosmetic, named in the `FAIL:` line.
 */

import { join } from "node:path";

/**
 * Parse repeatable `--secret label=literal` flags. libcli's `multiple: true`
 * yields an array from node's parseArgs in every case; tolerate a bare string
 * or undefined defensively. Split on the FIRST `=` only.
 *
 * @param {string[]|string|undefined} secretOpt
 * @returns {{label: string, literal: string}[]}
 */
export function parseSecrets(secretOpt) {
  const arr = Array.isArray(secretOpt)
    ? secretOpt
    : secretOpt
      ? [secretOpt]
      : [];
  return arr.map((s) => {
    const idx = s.indexOf("=");
    if (idx === -1) return { label: s, literal: "" };
    return { label: s.slice(0, idx), literal: s.slice(idx + 1) };
  });
}

/**
 * Walk a directory tree and return every file path. Uses per-level readdir so
 * it works against both node:fs and the libmock fs (no `recursive` reliance).
 */
async function collectFiles(dir, runtime) {
  const out = [];
  const entries = await runtime.fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectFiles(full, runtime)));
    } else if (ent.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Scan every file under `dir` for each secret literal. Returns the labels of
 * secrets whose non-empty literal appears in any file (empty literals are
 * skipped — a secret the run never set cannot leak).
 *
 * @param {object} params
 * @param {string} params.dir
 * @param {{label: string, literal: string}[]} params.secrets
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime
 * @returns {Promise<string[]>} labels that hit
 */
export async function scanDirectory({ dir, secrets, runtime }) {
  const files = await collectFiles(dir, runtime);
  const contents = await Promise.all(
    files.map((f) => runtime.fs.readFile(f, "utf8").catch(() => "")),
  );
  const failures = [];
  for (const { label, literal } of secrets) {
    if (!literal) continue;
    if (contents.some((c) => c.includes(literal))) failures.push(label);
  }
  return failures;
}

/**
 * Resolve a directory of extracted log files, downloading the archive first
 * when given a run id. Throws (→ fail closed) on any download or extract
 * failure or on missing/invalid inputs.
 */
async function resolveLogsDir({ options, runtime }) {
  const tmpRoot = runtime.proc.env.RUNNER_TEMP || "/tmp";
  const dir = await runtime.fs.mkdtemp(join(tmpRoot, "scan-logs-"));
  let zip = options.archive;

  if (!zip) {
    const runId = options["run-id"];
    const repo = options.repo;
    if (!runId || !repo) {
      throw new Error("requires --archive, or --run-id and --repo");
    }
    if (!/^\d+$/.test(String(runId))) {
      throw new Error("--run-id must be numeric");
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      throw new Error("--repo must be owner/name");
    }
    zip = join(dir, "run-logs.zip");
    const dl = await runtime.subprocess.run("bash", [
      "-c",
      `gh api -H "Accept: application/vnd.github+json" ` +
        `"/repos/${repo}/actions/runs/${runId}/logs" > "${zip}"`,
    ]);
    if (dl.exitCode !== 0) {
      throw new Error(
        `log archive download failed (gh exit ${dl.exitCode}): ${dl.stderr ?? ""}`,
      );
    }
  }

  const unz = await runtime.subprocess.run("unzip", ["-q", zip, "-d", dir]);
  if (unz.exitCode !== 0) {
    throw new Error(
      `log archive empty/unreadable (unzip exit ${unz.exitCode})`,
    );
  }
  return dir;
}

/**
 * scan-logs command handler.
 *
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: boolean, code: number, error?: string}>}
 */
export async function runScanLogsCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const options = ctx.options;
  const secrets = parseSecrets(options.secret);

  let dir;
  try {
    dir = await resolveLogsDir({ options, runtime });
  } catch (err) {
    // Fail closed: an unresolvable archive must not pass as "no leak".
    runtime.proc.stderr.write(`FAIL: scan-logs: ${err.message}\n`);
    return { ok: false, code: 1, error: err.message };
  }

  const failures = await scanDirectory({ dir, secrets, runtime });
  for (const label of failures) {
    runtime.proc.stderr.write(`FAIL: ${label} literal in run logs\n`);
  }
  return { ok: failures.length === 0, code: failures.length ? 1 : 0 };
}
