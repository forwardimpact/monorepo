import path from "node:path";
import { yearMonth } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { scanMarkers } from "../marker-scanner.js";
import { renderBlock, BlockRenderError } from "../block-renderer.js";
import { renderIssueList, parseRepoSlug } from "../issue-list-renderer.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

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

async function renderForBlock(block, projectRoot, ghContext, runtime) {
  if (block.kind === "xmr") {
    return renderBlock({
      metric: block.metric,
      csvPath: block.csvPath,
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
  return null;
}

function spliceBlock(lines, block, rendered) {
  lines.splice(
    block.openLine + 1,
    block.closeLine - block.openLine - 1,
    ...rendered,
  );
}

// A missing current-month storyboard (e.g. a coaching run early in the month,
// before the storyboard meeting created it) is non-fatal: return null so the
// deterministic refresh step exits cleanly instead of failing the job.
function readStoryboardOrNull(runtime, storyboardPath) {
  try {
    return runtime.fsSync.readFileSync(storyboardPath, "utf-8");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return null;
  }
}

/** Re-render XmR chart blocks and issue-list blocks in a storyboard file. */
export async function runRefreshCommand(ctx) {
  const { runtime, gitClient } = ctx.deps;
  const options = ctx.options;
  const logger = createLogger("wiki", runtime);
  const projectRoot = resolveProjectRoot(runtime);

  const storyboardPath = path.resolve(
    projectRoot,
    ctx.args["storyboard-path"] || currentStoryboardRelPath(runtime),
  );
  const text = readStoryboardOrNull(runtime, storyboardPath);
  if (text === null) {
    logger.warn("refresh", `no storyboard at ${storyboardPath}`);
    return { ok: true };
  }
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
      JSON.stringify({ blocks: blocks.length, spliced }) + "\n",
    );
  }
  return { ok: true };
}
