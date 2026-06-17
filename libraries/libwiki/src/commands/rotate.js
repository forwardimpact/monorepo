import { createLogger } from "@forwardimpact/libtelemetry";
import { rotateIfOverBudget, weeklyLogPath } from "../weekly-log.js";
import { currentDayIso } from "../util/clock.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

/** Force-rotate the current weekly log to a sealed part file. */
export function runRotateCommand(ctx) {
  const { runtime } = ctx.deps;
  const logger = createLogger("wiki", runtime);
  const options = ctx.options;
  const agent = options.agent || runtime.proc.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    return {
      ok: false,
      code: 2,
      error: "rotate requires --agent or LIBEVAL_AGENT_PROFILE",
    };
  }
  const wikiRoot = resolveWikiRoot(runtime, options);
  const today = options.today || currentDayIso(runtime);
  // Name the resolved target before any seal: the file follows from agent +
  // current week, not from any audit finding, so an env-default agent can
  // silently select a different file than the one the operator has in mind.
  runtime.proc.stdout.write(
    `target → ${weeklyLogPath(wikiRoot, agent, today)}\n`,
  );

  let result;
  try {
    result = rotateIfOverBudget(
      wikiRoot,
      agent,
      today,
      { lines: 0, words: 0 },
      { force: true },
      runtime.fsSync,
    );
  } catch (e) {
    logger.error("rotate", `rotate failed: ${e.message}`);
    return { ok: false, code: 1 };
  }
  switch (result.status) {
    case "noop":
      runtime.proc.stdout.write(`no rotation needed for ${agent}\n`);
      return { ok: true };
    case "sealed":
      for (const part of result.parts) {
        runtime.proc.stdout.write(`sealed → ${part}\n`);
      }
      return { ok: true };
    case "incomplete": {
      for (const part of result.parts) {
        runtime.proc.stdout.write(`sealed → ${part}\n`);
      }
      const { section, lines, words, path: residuePath } = result.residue;
      logger.error(
        "rotate",
        `section ${section} alone exceeds the budget ` +
          `(${lines} lines, ${words} words) and has no finer seam to split ` +
          `at: ${residuePath}\n` +
          `recover it by hand — shorten the section ` +
          `(see the memory protocol's manual-recovery convention)`,
      );
      return { ok: false, code: 1 };
    }
    default:
      // Defensive: the tagged union is exhaustive above, so this is
      // unreachable; kept so a future status can't fall through to no return.
      return { ok: true };
  }
}
