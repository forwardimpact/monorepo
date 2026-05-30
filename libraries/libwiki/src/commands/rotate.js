import { rotateIfOverBudget } from "../weekly-log.js";
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

  const result = rotateIfOverBudget(
    wikiRoot,
    agent,
    today,
    0,
    { force: true },
    runtime.fsSync,
  );
  if (result.rotated) {
    runtime.proc.stdout.write(
      `rotated ${result.fromPath} → ${result.toPath}\n`,
    );
  } else {
    runtime.proc.stdout.write(`no rotation needed for ${agent}\n`);
  }
  return { ok: true };
}
