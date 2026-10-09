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

/**
 * Run the wiki audit and return its findings plus the resolved project root.
 * `runAuditCommand` emits the findings. `runCurateCommand` routes them to an
 * issue. Both share this function, so the two cannot drift.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {{ findings: object[], checked: Record<string, number>, projectRoot: string }}
 */
export function auditWiki(ctx) {
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
    projectRoot,
  });
  return {
    findings: runRules(RULES, auditCtx, { resolveScope }),
    checked: countChecked(auditCtx),
    projectRoot,
  };
}

// Count the subjects each rule scope resolved. A run that checked nothing and
// a run that checked every row and found no problem both report no findings.
// The counts tell the two apart.
function countChecked(auditCtx) {
  const checked = {};
  for (const scope of new Set(RULES.map((r) => r.scope))) {
    checked[scope] = resolveScope(scope, auditCtx).length;
  }
  // The sections the roster requires on the board, one per profile.
  checked["storyboard-sections"] = auditCtx.roster.length;
  return checked;
}

function renderChecked(checked) {
  const parts = Object.entries(checked).map(([scope, n]) => `${scope} ${n}`);
  return `checked: ${parts.join(", ")}\n`;
}

/** Run the wiki audit and emit findings plus the per-scope subject counts. Use --format json for JSON. */
export function runAuditCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const { findings, checked, projectRoot } = auditWiki(ctx);

  if (options.format === "json") {
    const doc = JSON.parse(emitFindingsJson(findings));
    doc.checked = checked;
    runtime.proc.stdout.write(`${JSON.stringify(doc, null, 2)}\n`);
  } else {
    runtime.proc.stdout.write(
      emitFindingsText(findings, {
        cwd: projectRoot,
        passMessage: "wiki audit passed",
      }) + renderChecked(checked),
    );
  }

  if (findings.some((f) => f.level === "fail")) return { ok: false, code: 1 };
  return { ok: true };
}
