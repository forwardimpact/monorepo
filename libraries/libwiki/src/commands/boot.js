import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import { buildDigest } from "../boot.js";

function renderMarkdown(digest) {
  const lines = [];
  lines.push("# Boot Digest");
  lines.push("");
  lines.push(`**Summary:** ${digest.summary || "(none)"}`);
  lines.push("");
  lines.push("## Owned priorities");
  if (digest.owned_priorities.length === 0) lines.push("- (none)");
  for (const p of digest.owned_priorities) {
    lines.push(`- ${p.item} — ${p.status} (added ${p.added})`);
  }
  lines.push("");
  lines.push("## Cross-cutting priorities");
  if (digest.cross_cutting.length === 0) lines.push("- (none)");
  for (const p of digest.cross_cutting) {
    lines.push(`- ${p.item} — ${p.status} (added ${p.added})`);
  }
  lines.push("");
  lines.push("## Active claims");
  if (digest.claims.length === 0) lines.push("- (none)");
  for (const c of digest.claims) {
    lines.push(
      `- ${c.agent}: ${c.target} (branch ${c.branch}, expires ${c.expires_at})`,
    );
  }
  lines.push("");
  lines.push("## Storyboard items");
  if (digest.storyboard_items.length === 0) lines.push("- (none)");
  for (const s of digest.storyboard_items) {
    lines.push(`- ${s.threshold}`);
  }
  lines.push("");
  lines.push(`**Inbox count:** ${digest.inbox_count}`);
  lines.push(`**Storyboard path:** ${digest.storyboard_path || "(none)"}`);
  return lines.join("\n");
}

/** Print the on-boot digest for the calling agent. JSON by default; --format markdown renders prose. */
export function runBootCommand(values, _args, cli) {
  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError(
      "boot requires --agent <name> or LIBEVAL_AGENT_PROFILE env var",
    );
    process.exit(2);
  }

  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);

  const digest = buildDigest({ wikiRoot, agent, today });

  if ((values.format || "json") === "markdown") {
    process.stdout.write(renderMarkdown(digest) + "\n");
  } else {
    process.stdout.write(JSON.stringify(digest, null, 2) + "\n");
  }
}
