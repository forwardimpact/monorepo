import { addDays } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { parseRepoSlug } from "../issue-list-renderer.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

// Resolve the monorepo's `owner/repo` slug the way `refresh.js` does: an
// explicit `FIT_GH_REPO` env override (sandbox proxy URLs), else the origin
// remote parsed via the injected git client. Returns null when nothing
// parseable is found, in which case `gh` falls back to its own cwd resolution.
async function deriveRepo(gitClient, cwd, env) {
  if (env.FIT_GH_REPO) return env.FIT_GH_REPO;
  if (!gitClient) return null;
  try {
    const url = await gitClient.remoteGetUrl("origin", { cwd });
    return parseRepoSlug(url);
  } catch {
    return null;
  }
}

// A missing token is non-fatal: `gh` may still resolve ambient auth, and a
// hard fetch failure downstream collapses to a logged warning and no row.
async function resolveToken() {
  try {
    return (await createScriptConfig("wiki")).ghToken();
  } catch {
    return null;
  }
}

// `gh pr list` returns at most this many PRs; a window that hits the cap is
// truncated, so the caller warns rather than silently undercounting.
const FETCH_LIMIT = 200;

// Fetch merged PRs in `[since, until]` and return their parsed JSON, or null on
// any failure (non-zero exit or unparseable stdout) so the caller emits no row.
async function fetchMergedPrs({ runtime, cwd, repo, since, until, token }) {
  const args = ["pr", "list", "--base", "main"];
  if (repo) args.push("--repo", repo);
  args.push(
    "--json",
    "number,labels,mergedAt",
    "--search",
    `merged:${since}..${until}`,
    "--limit",
    String(FETCH_LIMIT),
  );
  const env = token
    ? { ...runtime.proc.env, GH_TOKEN: token }
    : runtime.proc.env;
  const result = await runtime.subprocess.run("gh", args, { cwd, env });
  if (result.exitCode !== 0) return null;
  try {
    return JSON.parse(result.stdout || "[]");
  } catch {
    return null;
  }
}

// Tally merged PRs by their classification label. A PR with neither label is
// unlabeled; `product` wins if both are somehow present.
function countByLabel(prs) {
  const counts = { product: 0, internal: 0, unlabeled: 0 };
  for (const pr of prs) {
    const names = (pr.labels || []).map((l) => l.name);
    if (names.includes("product")) counts.product++;
    else if (names.includes("internal")) counts.internal++;
    else counts.unlabeled++;
  }
  return counts;
}

/**
 * Emit the product-vs-internal mix of merged PRs as a `product_share` metric
 * row. Counts PRs merged in `[since, until]` by their `product` / `internal`
 * label and appends `product_share = round(product / (product + internal) *
 * 100)` to `wiki/metrics/product-mix/<YYYY>.csv` via the `gemba-xmr record` write
 * path. Deterministic — re-running over the same merged PRs yields the same
 * value. A window with no labeled merged PRs emits no row (avoids a 0/0 ratio).
 */
export async function runProductMixCommand(ctx) {
  const { runtime, gitClient } = ctx.deps;
  const options = ctx.options;
  const logger = createLogger("wiki", runtime);
  const cwd = resolveProjectRoot(runtime);

  const until = options.until || currentDayIso(runtime);
  const since = options.since || addDays(until, -7);
  const run = options.run || "gh-live";
  const repo =
    options.repo || (await deriveRepo(gitClient, cwd, runtime.proc.env));
  const token = await resolveToken();

  const prs = await fetchMergedPrs({ runtime, cwd, repo, since, until, token });
  if (prs === null) {
    logger.warn("product-mix", `gh pr list failed for ${since}..${until}`);
    return { ok: true };
  }
  if (prs.length >= FETCH_LIMIT) {
    logger.warn(
      "product-mix",
      `window ${since}..${until} hit the ${FETCH_LIMIT}-PR fetch cap; product_share may undercount`,
    );
  }

  const { product, internal, unlabeled } = countByLabel(prs);
  const total = product + internal;
  if (total === 0) {
    logger.info(
      "product-mix",
      `no labeled merged PRs in ${since}..${until}; emitting no row`,
    );
    return { ok: true };
  }

  const share = Math.round((product / total) * 100);
  const recordArgs = [
    "gemba-xmr",
    "record",
    "--skill",
    "product-mix",
    "--metric",
    "product_share",
    "--value",
    String(share),
    "--unit",
    "pct",
    "--date",
    until,
    "--run",
    run,
    "--note",
    `product=${product} internal=${internal} unlabeled=${unlabeled} window=${since}..${until}`,
    "--event-type",
    "kata-shift",
  ];
  if (options["wiki-root"]) {
    recordArgs.push("--wiki-root", options["wiki-root"]);
  }

  const recordResult = await runtime.subprocess.run("npx", recordArgs, { cwd });
  if (recordResult.exitCode !== 0) {
    logger.warn("product-mix", "gemba-xmr record failed");
  }
  return { ok: true };
}
