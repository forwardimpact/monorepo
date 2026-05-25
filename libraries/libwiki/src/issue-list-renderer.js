import { spawnSync } from "node:child_process";

export const GENERATED_NOTICE =
  "<!-- Do not edit. Generated from fit-wiki refresh. -->";

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

/** Render an issue-list block for an obstacles/experiments marker. Returns markdown lines. `cwd` should be the parent monorepo's project root so `gh` resolves the correct origin; `token` is the resolved GH token (e.g. via `Config.ghToken()`). */
export function renderIssueList({
  topic,
  state,
  window,
  cwd,
  token,
  today = new Date(),
  gh = defaultGh,
}) {
  const ghState = state === "closed" ? "closed" : "open";
  const args = [
    "issue",
    "list",
    "--label",
    topic.replace(/s$/, ""),
    "--state",
    ghState,
    "--json",
    "number,title,labels,closedAt",
    "--limit",
    "100",
  ];
  const result = gh(args, { cwd, token });
  if (result.status !== 0) {
    process.stderr.write(
      `refresh: gh issue list failed for ${topic}:${state}\n`,
    );
    return [GENERATED_NOTICE];
  }
  let issues;
  try {
    issues = JSON.parse(result.stdout || "[]");
  } catch {
    process.stderr.write(
      `refresh: gh issue list JSON parse failed for ${topic}:${state}\n`,
    );
    return [GENERATED_NOTICE];
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

  const lines = [GENERATED_NOTICE];
  for (const issue of issues) {
    const tag = topic === "experiments" ? "Exp" : "Obs";
    lines.push(`- **${tag} #${issue.number} — ${issue.title}**`);
  }
  return lines;
}
