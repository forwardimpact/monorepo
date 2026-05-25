import { spawnSync } from "node:child_process";

function defaultGh(args, options) {
  const env = options?.token
    ? { ...process.env, GH_TOKEN: options.token }
    : undefined;
  return spawnSync("gh", args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    cwd: options?.cwd,
    env,
  });
}

function daysAgo(today, n) {
  const d = today instanceof Date ? new Date(today.getTime()) : new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Parse `owner/repo` from a git origin URL. Tolerates http(s), ssh, and proxy-rewritten URLs (e.g. `http://host/git/owner/repo`) by taking the last two path segments after stripping `.git`. Returns null when nothing parseable is found. */
export function parseRepoSlug(originUrl) {
  if (!originUrl) return null;
  const stripped = originUrl.trim().replace(/\.git$/, "");
  const match = stripped.match(/([^/:]+)\/([^/:]+)$/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

/** Render an issue-list block for an obstacles/experiments marker. Returns markdown lines. `cwd` should be the parent monorepo's project root so `gh` resolves the correct origin; `repo` is an explicit `owner/name` slug used when the origin remote is unparseable by `gh` (e.g. sandbox proxy URLs); `token` is the resolved GH token (e.g. via `Config.ghToken()`). */
export function renderIssueList({
  topic,
  state,
  window,
  cwd,
  repo,
  token,
  today = new Date(),
  gh = defaultGh,
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
  const result = gh(args, { cwd, token });
  if (result.status !== 0) {
    process.stderr.write(
      `refresh: gh issue list failed for ${topic}:${state}\n`,
    );
    return [];
  }
  let issues;
  try {
    issues = JSON.parse(result.stdout || "[]");
  } catch {
    process.stderr.write(
      `refresh: gh issue list JSON parse failed for ${topic}:${state}\n`,
    );
    return [];
  }

  if (state === "closed") {
    const windowDays = window
      ? Number.parseInt(window.replace("d", ""), 10)
      : 7;
    const cutoff = daysAgo(today, windowDays);
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
