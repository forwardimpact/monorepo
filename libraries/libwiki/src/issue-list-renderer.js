import { addDays } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";

/** Parse `owner/repo` from a git origin URL. Tolerates http(s), ssh, and proxy-rewritten URLs (e.g. `http://host/git/owner/repo`) by taking the last two path segments after stripping `.git`. Returns null when nothing parseable is found. */
export function parseRepoSlug(originUrl) {
  if (!originUrl) return null;
  const stripped = originUrl.trim().replace(/\.git$/, "");
  const match = stripped.match(/([^/:]+)\/([^/:]+)$/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/**
 * Render an issue-list block for an obstacles/experiments marker. Returns
 * markdown lines. `cwd` should be the parent monorepo's project root so `gh`
 * resolves the correct origin; `repo` is an explicit `owner/name` slug used when
 * the origin remote is unparseable by `gh` (e.g. sandbox proxy URLs); `token`
 * is the resolved GH token (e.g. via `Config.ghToken()`). The `gh` command runs
 * through `runtime.subprocess`, and stderr warnings through `runtime.proc`.
 *
 * @param {object} options
 * @param {string} options.topic
 * @param {string} options.state
 * @param {string|null} options.window
 * @param {string} options.cwd
 * @param {string} [options.repo]
 * @param {string} [options.token]
 * @param {string} options.today - ISO date string used for the closed-window cutoff.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} options.runtime
 * @returns {Promise<string[]>}
 */
export async function renderIssueList({
  topic,
  state,
  window,
  cwd,
  repo,
  token,
  today,
  runtime,
}) {
  const ghState = state === "closed" ? "closed" : "open";
  const args = ["issue", "list"];
  if (repo) args.push("--repo", repo);
  args.push(
    "--label",
    topic.replace(/s$/, ""),
    "--state",
    ghState,
    "--json",
    "number,title,labels,closedAt",
    "--limit",
    "100",
  );
  const env = token ? { ...runtime.proc.env, GH_TOKEN: token } : undefined;
  const result = await runtime.subprocess.run("gh", args, { cwd, env });
  if (result.exitCode !== 0) {
    createLogger("wiki", runtime).warn(
      "refresh",
      `gh issue list failed for ${topic}:${state}`,
    );
    return [];
  }
  let issues;
  try {
    issues = JSON.parse(result.stdout || "[]");
  } catch {
    createLogger("wiki", runtime).warn(
      "refresh",
      `gh issue list JSON parse failed for ${topic}:${state}`,
    );
    return [];
  }

  if (state === "closed") {
    const windowDays = window
      ? Number.parseInt(window.replace("d", ""), 10)
      : 7;
    const cutoff = addDays(today, -windowDays);
    issues = issues.filter(
      (i) => i.closedAt && i.closedAt.slice(0, 10) >= cutoff,
    );
  }

  const lines = [];
  for (const issue of issues) {
    lines.push(`- #${issue.number} ${issue.title}`);
  }
  return lines;
}
