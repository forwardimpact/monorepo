import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import fsAsync from "node:fs/promises";
import { Finder } from "@forwardimpact/libutil";
import { scanMarkers } from "../marker-scanner.js";
import { renderBlock, BlockRenderError } from "../block-renderer.js";
import { renderIssueList } from "../issue-list-renderer.js";

function currentStoryboardPath() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `wiki/storyboard-${yyyy}-M${mm}.md`;
}

function renderForBlock(block, projectRoot) {
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
export function runRefreshCommand(values, args, _cli) {
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

  const lines = text.split("\n");
  let spliced = false;

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    try {
      const rendered = renderForBlock(block, projectRoot);
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
