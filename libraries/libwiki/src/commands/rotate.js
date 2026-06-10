import { rotateIfOverBudget, weeklyLogPath } from "../weekly-log.js";
import { currentDayIso } from "../util/clock.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

/** Force-rotate the current weekly log to a sealed part file. */
export function runRotateCommand(ctx) {
  const { runtime } = ctx.deps;
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
      0,
      { force: true },
      runtime.fsSync,
    );
  } catch (e) {
    runtime.proc.stderr.write(`rotate failed: ${e.message}\n`);
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
      runtime.proc.stderr.write(
        `day-section ${section} alone exceeds the budget ` +
          `(${lines} lines, ${words} words) and cannot be split at a day ` +
          `seam: ${residuePath}\n` +
          `recover it by hand — bisect the section at a finer seam ` +
          `(see the memory protocol's manual-recovery convention)\n`,
      );
      return { ok: false, code: 1 };
    }
    default:
      // Defensive: the tagged union is exhaustive above, so this is
      // unreachable; kept so a future status can't fall through to no return.
      return { ok: true };
  }
}
