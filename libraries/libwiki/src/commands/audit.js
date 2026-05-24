import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import { runAudit } from "../audit/engine.js";
import { RULES } from "../audit/rules.js";
import { buildContext } from "../audit/scopes.js";
import { emitJson, emitText } from "../audit/format.js";

/** Run the wiki audit and emit findings. JSON via --format json. */
export function runAuditCommand(values, _args, _cli) {
  const finder = new Finder(fsAsync, { debug() {} }, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);
  const graceUntil = process.env.FIT_WIKI_AUDIT_GRACE_UNTIL || null;

  const ctx = buildContext({ wikiRoot, today, graceUntil });
  const findings = runAudit(RULES, ctx);

  process.stdout.write(
    values.format === "json" ? emitJson(findings, ctx) : emitText(findings),
  );

  if (findings.some((f) => f.level === "fail")) process.exit(1);
}
