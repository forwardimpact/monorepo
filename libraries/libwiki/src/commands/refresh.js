import path from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { scanMarkers } from "../marker-scanner.js";
import { renderBlock, BlockRenderError } from "../block-renderer.js";
import {
  renderIssueList,
  renderAgentExperiments,
  TrackerQueryError,
  parseRepoSlug,
} from "../issue-list-renderer.js";
import { parseClaims, filterExpired, removeClaim } from "../active-claims.js";
import { renderStoryboardSkeleton } from "../storyboard-skeleton.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot, resolveWikiRoot } from "../util/wiki-dir.js";

function currentStoryboardRelPath(runtime) {
  return `wiki/storyboard-${yearMonth(currentDayIso(runtime))}.md`;
}

async function deriveParentRepo(gitClient, parentDir, env) {
  if (env.FIT_GH_REPO) return env.FIT_GH_REPO;
  try {
    const url = await gitClient.remoteGetUrl("origin", { cwd: parentDir });
    return parseRepoSlug(url);
  } catch {
    return null;
  }
}

// Compose the agent-experiments block body. On a successful tracker query the
// body is a fresh last-successful-sync stamp, then freshly rendered,
// label-re-checked, sanitized item lines. On a tracker failure the function
// keeps the body it materialized before (stamp + items) verbatim. Boot then
// still serves the last good routing surface. It does not serve an empty one.
// The function does not advance the timestamp, so the stamp keeps
// staleness auditable.
async function renderAgentExperimentsBlock(block, lines, ghContext, runtime) {
  const priorBody = lines.slice(block.openLine + 1, block.closeLine);
  try {
    const items = await renderAgentExperiments({
      cwd: ghContext.cwd,
      repo: ghContext.repo,
      token: ghContext.token,
      runtime,
    });
    const today = currentDayIso(runtime);
    return [`<!-- last-successful-sync: ${today} -->`, ...items];
  } catch (err) {
    if (!(err instanceof TrackerQueryError)) throw err;
    runtime.proc.stderr.write(
      "refresh: gh issue list failed for agent-experiments; keeping previous materialized items\n",
    );
    return priorBody;
  }
}

async function renderForBlock(block, lines, projectRoot, ghContext, runtime) {
  if (block.kind === "xmr") {
    return renderBlock({
      metric: block.metric,
      csvPath: block.csvPath,
      priorReadAnchor: block.priorReadAnchor,
      projectRoot,
      fs: runtime.fsSync,
    });
  }
  if (block.kind === "issue-list") {
    return renderIssueList({
      topic: block.topic,
      state: block.state,
      window: block.window,
      cwd: ghContext.cwd,
      repo: ghContext.repo,
      token: ghContext.token,
      today: currentDayIso(runtime),
      runtime,
    });
  }
  if (block.kind === "agent-experiments") {
    return renderAgentExperimentsBlock(block, lines, ghContext, runtime);
  }
  return null;
}

function spliceBlock(lines, block, rendered) {
  lines.splice(
    block.openLine + 1,
    block.closeLine - block.openLine - 1,
    ...rendered,
  );
}

// A missing current-month storyboard is non-fatal. Return null so the caller
// can create it (see createStoryboardSkeleton) and does not fail the job.
function readStoryboardOrNull(runtime, storyboardPath) {
  try {
    return runtime.fsSync.readFileSync(storyboardPath, "utf-8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return null;
  }
}

// Create the current-month storyboard from the minimal skeleton when it does
// not exist. Refresh is the deterministic "freshen the wiki" step and runs
// before the session (kata-agent pre-run). Creation here guarantees the file
// is on disk before participants look for it, and no lead needs a write tool.
// The skeleton carries the section structure and the generic issue-list
// markers. The render pass below fills them, and participants seed metric
// blocks.
function createStoryboardSkeleton(runtime, storyboardPath, logger) {
  const skeleton = renderStoryboardSkeleton(currentDayIso(runtime));
  runtime.fsSync.mkdirSync(path.dirname(storyboardPath), { recursive: true });
  runtime.fsSync.writeFileSync(storyboardPath, skeleton);
  logger.info("refresh", `created storyboard at ${storyboardPath}`);
  return skeleton;
}

// Drop every MEMORY.md `## Active Claims` row past its `expires_at`. Write the
// trimmed table back in place. Refresh is the deterministic "freshen the wiki"
// step, so a sweep of lapsed claims belongs here beside the storyboard render.
// It runs whether or not the storyboard has marker blocks to regenerate. The
// write is local and mirrors the storyboard splice. The caller's push
// publishes it. A missing wiki or claims table is a clean no-op.
function clearExpiredClaims(runtime, options, today, logger) {
  const memPath = path.join(resolveWikiRoot(runtime, options), "MEMORY.md");
  if (!runtime.fsSync.existsSync(memPath)) return;
  const text = runtime.fsSync.readFileSync(memPath, "utf-8");
  const { expired } = filterExpired(parseClaims(text), today);
  if (expired.length === 0) return;
  let current = text;
  for (const c of expired) {
    const result = removeClaim(current, { agent: c.agent, target: c.target });
    if (result.removed) current = result.text;
  }
  if (current !== text) {
    runtime.fsSync.writeFileSync(memPath, current);
    logger.info("refresh", `cleared ${expired.length} expired claim(s)`);
  }
}

/**
 * Re-render storyboard XmR/issue-list blocks and clear expired MEMORY.md claims.
 */
export async function runRefreshCommand(ctx) {
  const { runtime, gitClient } = ctx.deps;
  const options = ctx.options;
  const logger = createLogger("wiki", runtime);
  const projectRoot = resolveProjectRoot(runtime);

  // This is independent of the storyboard render below (and its early
  // returns). The sweep still runs on a wiki with no storyboard and on a wiki
  // with no marker blocks.
  clearExpiredClaims(runtime, options, currentDayIso(runtime), logger);

  const storyboardPath = path.resolve(
    projectRoot,
    ctx.args["storyboard-path"] || currentStoryboardRelPath(runtime),
  );
  const existing = readStoryboardOrNull(runtime, storyboardPath);
  const created = existing === null;
  const text = created
    ? createStoryboardSkeleton(runtime, storyboardPath, logger)
    : existing;
  const blocks = scanMarkers(text, {
    warn: (message) => logger.warn("refresh", message),
  });
  if (blocks.length === 0) return { ok: true };

  const config = await createScriptConfig("wiki");
  let token = null;
  try {
    token = config.ghToken();
  } catch {
    // A missing token is non-fatal. An issue-list render then fails with a
    // stderr warning, and the block collapses to the notice line.
  }
  // Spawn `gh` from the project root so it resolves the monorepo's origin
  // instead of whatever git context the caller's cwd happens to be in (the
  // wiki sibling repo, a subagent worktree, a service dir, etc.). Also
  // resolve an explicit owner/repo slug so `gh` works when a proxy URL
  // replaced origin (sandbox environments). The `FIT_GH_REPO` env var
  // overrides the parsed origin.
  const ghContext = {
    cwd: projectRoot,
    repo: await deriveParentRepo(gitClient, projectRoot, runtime.proc.env),
    token,
  };

  const lines = text.split("\n");
  let spliced = false;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    try {
      const rendered = await renderForBlock(
        block,
        lines,
        projectRoot,
        ghContext,
        runtime,
      );
      if (!rendered) continue;
      spliceBlock(lines, block, rendered);
      spliced = true;
    } catch (err) {
      if (!(err instanceof BlockRenderError)) throw err;
      logger.error(
        "refresh",
        `refresh-error ${storyboardPath}:${block.openLine + 1} ${err.message}`,
      );
    }
  }

  if (spliced) runtime.fsSync.writeFileSync(storyboardPath, lines.join("\n"));
  if (options.format === "json") {
    runtime.proc.stdout.write(
      JSON.stringify({ blocks: blocks.length, spliced, created }) + "\n",
    );
  }
  return { ok: true };
}
