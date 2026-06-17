import path from "node:path";
import {
  emitFindingsJson,
  emitFindingsText,
  runRules,
} from "@forwardimpact/libutil";
import { RULES } from "../audit/rules.js";
import { buildContext, resolveScope } from "../audit/scopes.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

/** Run the wiki audit and emit findings. JSON via --format json. */
export function runAuditCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const projectRoot = resolveProjectRoot(runtime);
  const wikiRoot = options["wiki-root"] || path.join(projectRoot, "wiki");
  const today = options.today || currentDayIso(runtime);

  const auditCtx = buildContext({
    wikiRoot,
    today,
    fs: runtime.fsSync,
    subprocess: runtime.subprocess,
  });
  const findings = runRules(RULES, auditCtx, { resolveScope });

  runtime.proc.stdout.write(
    options.format === "json"
      ? emitFindingsJson(findings)
      : emitFindingsText(findings, {
          cwd: projectRoot,
          passMessage: "wiki audit passed",
        }),
  );

  if (findings.some((f) => f.level === "fail")) return { ok: false, code: 1 };
  return { ok: true };
}
