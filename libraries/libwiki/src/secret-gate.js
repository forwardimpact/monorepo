/**
 * Fail-closed secret gate for the wiki push path. Runs gitleaks over the
 * commit range a push introduces and reports a clean / finding /
 * scanner-absent verdict. The wiki has no destination-side secret control (a
 * GitHub Wiki repo runs no Actions and is excluded from GitHub
 * secret-scanning), so this is the only place a content backstop can live.
 *
 * The module never throws on a scanner result: a missing or erroring scanner
 * resolves to `scanner-absent` so the caller fails closed rather than treating
 * an error as clean. Findings carry only a location (`file:line:rule`) — never
 * the matched secret value, so an audit record built from them cannot itself
 * leak.
 */

import { isoTimestamp } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";

/** The gitleaks binary name resolved on PATH; provisioning is an operator concern (see wiki-operations guide). */
const GITLEAKS = "gitleaks";

/**
 * Scan the commit range a push introduces for secrets, fail closed.
 *
 * Probes `gitleaks version` first; an unresolvable binary short-circuits to
 * `scanner-absent`. Then runs `gitleaks detect` over `range` expressed as
 * `git log` options, reading the JSON report from stdout. Exit codes follow
 * gitleaks' documented contract: `0` clean, `1` leaks found, any other
 * non-zero an invocation error (treated as `scanner-absent` — fail closed, an
 * error is never reported as clean).
 *
 * @param {object} args
 * @param {import('@forwardimpact/libutil/runtime').Runtime} args.runtime - Provides `subprocess.run`.
 * @param {string} args.wikiDir - The wiki clone directory to scan.
 * @param {string} args.range - A `git log` range (e.g. `origin/master..HEAD`).
 * @returns {Promise<{status: "clean"|"finding"|"scanner-absent", findings?: Array<{file: string, line: number, rule: string}>}>}
 */
export async function scanPushWindow({ runtime, wikiDir, range }) {
  const probe = await runtime.subprocess.run(GITLEAKS, ["version"], {
    cwd: wikiDir,
  });
  if (probe.exitCode !== 0) return { status: "scanner-absent" };

  const scan = await runtime.subprocess.run(
    GITLEAKS,
    [
      "detect",
      "--source",
      wikiDir,
      "--log-opts",
      range,
      "--report-format",
      "json",
      "--report-path",
      "-",
    ],
    { cwd: wikiDir },
  );

  if (scan.exitCode === 0) return { status: "clean" };
  if (scan.exitCode === 1) {
    return { status: "finding", findings: parseFindings(scan.stdout) };
  }
  // Any other non-zero is an invocation/usage error, not a leak verdict:
  // fail closed rather than risk reporting a broken scan as clean.
  return { status: "scanner-absent" };
}

/**
 * Parse a gitleaks JSON report into location-only findings. Reads only the
 * file, line, and rule of each entry — never the matched secret value — so a
 * record built from the result is secret-free by construction. A malformed or
 * empty report yields an empty list.
 *
 * @param {string} stdout - The gitleaks JSON report.
 * @returns {Array<{file: string, line: number, rule: string}>}
 */
function parseFindings(stdout) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(report)) return [];
  return report.map((entry) => ({
    file: entry.File ?? "",
    line: entry.StartLine ?? 0,
    rule: entry.RuleID ?? "",
  }));
}

/**
 * Append one secret-free line to the wiki tree's `secret-overrides.log` and
 * stage it (path-scoped) so it lands in the same push as the overridden
 * content. The line records the override as a durable, inspectable audit
 * trail: an ISO timestamp, the asserted operator identity (`git config
 * user.email` — attribution of intent, NOT an authenticated identity), the
 * override class, the reason, and for a finding its location. It never carries
 * a matched secret value.
 *
 * @param {object} args
 * @param {import('@forwardimpact/libutil/runtime').Runtime} args.runtime - Provides `fs` and `clock`.
 * @param {import('@forwardimpact/libutil').GitClient} args.gitClient - Stages the log into the push.
 * @param {string} args.wikiDir - The wiki clone directory.
 * @param {"finding"|"scanner-absent"} args.klass - The override class.
 * @param {string} args.reason - The operator-supplied reason for the override.
 * @param {Array<{file: string, line: number, rule: string}>} [args.findings] - Locations for a finding override.
 * @returns {Promise<{path: string}>} The relative path staged into the push.
 */
export async function appendOverrideRecord({
  runtime,
  gitClient,
  wikiDir,
  klass,
  reason,
  findings = [],
}) {
  const email =
    (await gitClient.configGet("user.email", { cwd: wikiDir })) || "unknown";
  const where =
    klass === "finding"
      ? findings.map((f) => `${f.file}:${f.line}:${f.rule}`).join(",") ||
        "unspecified"
      : "scanner-absent";
  const ts = isoTimestamp(runtime.clock.now());
  // Tab-separated, single line; the reason is collapsed so the record stays
  // one inspectable row per override.
  const line = `${ts}\t${email}\t${klass}\t${reason.replace(/\s+/g, " ").trim()}\t${where}\n`;
  const logPath = `${wikiDir}/${OVERRIDE_LOG}`;
  await runtime.fs.appendFile(logPath, line);
  await gitClient.commitPaths(
    `wiki: secret-gate override (${klass})`,
    [OVERRIDE_LOG],
    { cwd: wikiDir },
  );
  return { path: OVERRIDE_LOG };
}

/** The append-only audit log of break-glass overrides, in the wiki tree root. */
export const OVERRIDE_LOG = "secret-overrides.log";

/**
 * Translate a `commitAndPush` security refusal into a command envelope,
 * logging the cause and its break-glass procedure at error level (always
 * surfaced, regardless of LOG_LEVEL). Returns `null` for any non-refusal
 * result (clean / pushed / network "saved locally"), so a caller can fall
 * through to its normal success handling. Shared by every command surface so
 * the refusal message and exit code live in one place.
 *
 * @param {object} runtime - The runtime bag (the logger writes to `proc.stderr`).
 * @param {{reason?: string, findings?: Array<{file: string, line: number, rule: string}>}} result - A `commitAndPush` result.
 * @returns {{ok: false, code: 1}|null}
 */
export function refusalEnvelope(runtime, result) {
  if (result.reason === "secret-detected") {
    const where = (result.findings ?? [])
      .map((f) => `${f.file}:${f.line}:${f.rule}`)
      .join(", ");
    createLogger("wiki", runtime).error(
      "push",
      `push blocked: secret detected in wiki content${where ? ` (${where})` : ""}; ` +
        "the push was not attempted. After confirming a false positive, set " +
        "FIT_WIKI_SECRET_OVERRIDE to a reason to override (audited).",
    );
    return { ok: false, code: 1 };
  }
  if (result.reason === "scanner-unavailable") {
    createLogger("wiki", runtime).error(
      "push",
      "push blocked: the secret scanner (gitleaks) is unavailable; the push " +
        "was not attempted. Install gitleaks, or set FIT_WIKI_SCANNER_ABSENT_OK " +
        "to a reason to override (audited).",
    );
    return { ok: false, code: 1 };
  }
  return null;
}
