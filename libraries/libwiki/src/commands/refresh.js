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
// body is a fresh last-successful-sync stamp followed by freshly rendered,
// label-re-checked, sanitized item lines. On a tracker failure the previously
// materialized body (stamp + items) is preserved verbatim so boot keeps serving
// the last good routing surface instead of an empty one, and the timestamp is
// not advanced, so staleness stays auditable from the stamp.
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

// A missing current-month storyboard is non-fatal: return null so the caller
// can create it (see createStoryboardSkeleton) rather than fail the job.
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
// before the session (kata-agent pre-run), so creating here guarantees the file
// is on disk before participants look for it — without any lead having a write
// tool. The skeleton carries the section structure and the generic issue-list
// markers; the render pass below fills them and participants seed metric blocks.
function createStoryboardSkeleton(runtime, storyboardPath, logger) {
  const skeleton = renderStoryboardSkeleton(currentDayIso(runtime));
  runtime.fsSync.mkdirSync(path.dirname(storyboardPath), { recursive: true });
  runtime.fsSync.writeFileSync(storyboardPath, skeleton);
  logger.info("refresh", `created storyboard at ${storyboardPath}`);
  return skeleton;
}

// Drop every MEMORY.md `## Active Claims` row past its `expires_at`, writing the
// trimmed table back in place. Refresh is the deterministic "freshen the wiki"
// step, so clearing lapsed claims belongs here alongside the storyboard render;
// it runs whether or not the storyboard has marker blocks to regenerate. The
// write is local, mirroring the storyboard splice — the caller's push publishes
// it. A missing wiki or claims table is a clean no-op.
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

  // Independent of the storyboard render below (and its early returns), so a
  // wiki with no storyboard or no marker blocks still gets its claims swept.
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
    // Missing token is non-fatal; issue-list renders will fail with a stderr
    // warning and the block will collapse to the notice line.
  }
  // Spawn `gh` from the project root so it resolves the monorepo's origin
  // instead of whatever git context the caller's cwd happens to be in (the
  // wiki sibling repo, a subagent worktree, a service dir, etc.). Also
  // resolve an explicit owner/repo slug so `gh` works when origin has been
  // rewritten to a proxy URL (sandbox environments) — `FIT_GH_REPO` env
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
