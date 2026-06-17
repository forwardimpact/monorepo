import { rotateIfOverBudget, weeklyLogPath } from "../weekly-log.js";
import { currentDayIso } from "../util/clock.js";
import { requireAgentFlag } from "../util/agent-flag.js";
import { resolveWikiRoot } from "../util/wiki-dir.js";

/**
 * Rotate the current weekly log to a sealed part file. Refuses an under-budget
 * target (exit 2) unless `--force`; the header-only floor stays a zero-exit
 * no-op even under `--force`; a missing target exits 2.
 */
export function runRotateCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const resolved = requireAgentFlag(options, {
    command: "rotate",
    example: "fit-wiki rotate --agent staff-engineer",
  });
  if (!resolved.ok) return resolved;
  const agent = resolved.agent;
  const wikiRoot = resolveWikiRoot(runtime, options);
  const today = options.today || currentDayIso(runtime);
  // Name the resolved target before any seal: the file follows from agent +
  // current week, not from any audit finding.
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
      { force: Boolean(options.force) },
      runtime.fsSync,
    );
  } catch (e) {
    runtime.proc.stderr.write(`rotate failed: ${e.message}\n`);
    return { ok: false, code: 1 };
  }
  switch (result.status) {
    case "noop":
      // The header-only floor is a benign no-op; an under-budget or missing
      // target fails closed so a stale/typo'd invocation cannot pass silently.
      if (result.reason === "floor") {
        runtime.proc.stdout.write(`no rotation needed for ${agent}\n`);
        return { ok: true };
      }
      if (result.reason === "missing") {
        return {
          ok: false,
          code: 2,
          error: `no weekly log for ${agent} at ${result.fromPath}`,
        };
      }
      return {
        ok: false,
        code: 2,
        error:
          `${result.fromPath} is under budget ` +
          `(${result.lines} lines, ${result.words} words); ` +
          `pass --force to seal it early`,
      };
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
