import fsAsync from "node:fs/promises";
import path from "node:path";
import {
  Finder,
  emitFindingsJson,
  emitFindingsText,
  runRules,
} from "@forwardimpact/libutil";
import { RULES } from "../audit/rules.js";
import { buildContext, resolveScope } from "../audit/scopes.js";

/** Run the wiki audit and emit findings. JSON via --format json. */
export function runAuditCommand(values, _args, _cli) {
  const finder = new Finder(fsAsync, { debug() {} }, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);

  const ctx = buildContext({ wikiRoot, today });
  const findings = runRules(RULES, ctx, { resolveScope });

  process.stdout.write(
    values.format === "json"
      ? emitFindingsJson(findings)
      : emitFindingsText(findings, {
          cwd: projectRoot,
          passMessage: "wiki audit passed",
        }),
  );

  if (findings.some((f) => f.level === "fail")) process.exit(1);
}
