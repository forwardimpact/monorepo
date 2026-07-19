import { buildDigest } from "../boot.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

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
export function runBootCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const resolved = requireAgentFlag(options, {
    command: "boot",
    example: "gemba-wiki boot --agent staff-engineer",
  });
  if (!resolved.ok) return resolved;
  const agent = resolved.agent;

  const wikiRoot = resolveWikiRoot(runtime, options);
  const today = options.today || currentDayIso(runtime);

  const digest = buildDigest({ wikiRoot, agent, today, fs: runtime.fsSync });

  if ((options.format || "json") === "markdown") {
    runtime.proc.stdout.write(renderMarkdown(digest) + "\n");
  } else {
    runtime.proc.stdout.write(JSON.stringify(digest, null, 2) + "\n");
  }
  return { ok: true };
}
