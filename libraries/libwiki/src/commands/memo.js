import path from "node:path";
import { createLogger } from "@forwardimpact/libtelemetry";
import { writeMemo } from "../memo-writer.js";
import { listAgents } from "../agent-roster.js";
import { BROADCAST_TARGET } from "../constants.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

function writeAndCheck(runtime, summaryPath, sender, message, today) {
  const result = writeMemo(
    { summaryPath, sender, message, today },
    runtime.fsSync,
  );
  if (!result.written) {
    createLogger("wiki", runtime).warn(
      "memo",
      `summary lacks memo:inbox marker: ${result.path}`,
    );
    return { ok: false, code: 2 };
  }
  runtime.proc.stdout.write(`wrote ${result.path}\n`);
  return { ok: true };
}

function resolveTargetPath(wikiRoot, target) {
  const summaryPath = path.join(wikiRoot, target + ".md");
  const resolvedRoot = path.resolve(wikiRoot);
  const resolvedTarget = path.resolve(summaryPath);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  const escapesRoot =
    relative === "" || relative.startsWith("..") || path.isAbsolute(relative);
  return { summaryPath, escapesRoot };
}

function writeSingleTarget(
  runtime,
  { wikiRoot, target, sender, message, today },
) {
  const { summaryPath, escapesRoot } = resolveTargetPath(wikiRoot, target);
  if (escapesRoot) {
    return { ok: false, code: 2, error: `target escapes wiki root: ${target}` };
  }
  if (!runtime.fsSync.existsSync(summaryPath)) {
    return {
      ok: false,
      code: 2,
      error: `target summary not found: ${summaryPath}`,
    };
  }
  return writeAndCheck(runtime, summaryPath, sender, message, today);
}

function writeBroadcast(
  runtime,
  { agentsDir, wikiRoot, sender, message, today },
) {
  const agents = listAgents({ agentsDir, wikiRoot }, runtime.fsSync);
  for (const { agent, summaryPath } of agents) {
    if (agent === sender) continue;
    const result = writeAndCheck(runtime, summaryPath, sender, message, today);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** Write a memo to a target agent's summary file (or broadcast to all except the sender); the sender is the required --from flag. */
export function runMemoCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const resolved = requireAgentFlag(options, {
    command: "memo",
    flag: "--from",
    example:
      'gemba-wiki memo --from staff-engineer --to security-engineer --message "..."',
  });
  if (!resolved.ok) return resolved;
  const sender = resolved.agent;

  if (!options.to) {
    return { ok: false, code: 2, error: "memo requires --to <target|all>" };
  }
  if (!options.message) {
    return { ok: false, code: 2, error: "memo requires --message <text>" };
  }

  const projectRoot = resolveProjectRoot(runtime);
  const wikiRoot = options["wiki-root"] || path.join(projectRoot, "wiki");
  const agentsDir = path.join(projectRoot, ".claude", "agents");
  const today = currentDayIso(runtime);

  if (options.to === BROADCAST_TARGET) {
    return writeBroadcast(runtime, {
      agentsDir,
      wikiRoot,
      sender,
      message: options.message,
      today,
    });
  }
  return writeSingleTarget(runtime, {
    wikiRoot,
    target: options.to,
    sender,
    message: options.message,
    today,
  });
}
