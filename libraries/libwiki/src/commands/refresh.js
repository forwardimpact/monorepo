import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fsAsync from "node:fs/promises";
import { Finder } from "@forwardimpact/libutil";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { scanMarkers } from "../marker-scanner.js";
import { renderBlock, BlockRenderError } from "../block-renderer.js";
import { renderIssueList, parseRepoSlug } from "../issue-list-renderer.js";

function currentStoryboardPath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `wiki/storyboard-${yyyy}-M${mm}.md`;
}

function deriveParentRepo(parentDir) {
  if (process.env.FIT_GH_REPO) return process.env.FIT_GH_REPO;
  const r = spawnSync("git", ["-C", parentDir, "remote", "get-url", "origin"], {
    encoding: "utf-8",
    stdio: "pipe",
  });
  if (r.status !== 0) return null;
  return parseRepoSlug(r.stdout);
}

function renderForBlock(block, projectRoot, ghContext) {
  if (block.kind === "xmr") {
    return renderBlock({
      metric: block.metric,
      csvPath: block.csvPath,
      projectRoot,
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

/** Re-render XmR chart blocks and issue-list blocks in a storyboard file. */
export async function runRefreshCommand(values, args, _cli) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());

  const storyboardPath = path.resolve(
    projectRoot,
    args[0] || currentStoryboardPath(),
  );
  const text = readFileSync(storyboardPath, "utf-8");
  const blocks = scanMarkers(text);
  if (blocks.length === 0) return;

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
    repo: deriveParentRepo(projectRoot),
    token,
  };

  const lines = text.split("\n");
  let spliced = false;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    try {
      const rendered = renderForBlock(block, projectRoot, ghContext);
      if (!rendered) continue;
      spliceBlock(lines, block, rendered);
      spliced = true;
    } catch (err) {
      if (!(err instanceof BlockRenderError)) throw err;
      process.stderr.write(
        `refresh-error ${storyboardPath}:${block.openLine + 1} ${err.message}\n`,
      );
    }
  }

  if (spliced) writeFileSync(storyboardPath, lines.join("\n"));
  if (values && values.format === "json") {
    process.stdout.write(
      JSON.stringify({ blocks: blocks.length, spliced }) + "\n",
    );
  }
}
