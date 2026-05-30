import path from "node:path";
import { Writable } from "node:stream";
import { emitFindingsText, runRules } from "@forwardimpact/libutil";
import {
  createAgentRunner,
  composeProfilePrompt,
  createRedactor,
} from "@forwardimpact/libeval";
import { RULES } from "../audit/rules.js";
import { buildContext, resolveScope } from "../audit/scopes.js";
import { currentDayIso } from "../util/clock.js";
import { resolveProjectRoot } from "../util/wiki-dir.js";

/** Run the wiki audit and auto-fix findings via a Haiku-powered AgentRunner. */
export async function runFixCommand(ctx) {
  const { runtime } = ctx.deps;
  const options = ctx.options;
  const projectRoot = resolveProjectRoot(runtime);
  const wikiRoot = options["wiki-root"] || path.join(projectRoot, "wiki");
  const today = options.today || currentDayIso(runtime);

  const auditCtx = buildContext({ wikiRoot, today, fs: runtime.fsSync });
  const findings = runRules(RULES, auditCtx, { resolveScope });

  if (findings.length === 0) {
    runtime.proc.stdout.write("nothing to fix\n");
    return { ok: true };
  }

  const auditText = emitFindingsText(findings, { cwd: projectRoot });
  const redactor = createRedactor();
  const devNull = new Writable({
    write(_c, _e, cb) {
      cb();
    },
  });

  const systemPrompt = composeProfilePrompt("technical-writer", {
    profilesDir: path.resolve(projectRoot, ".claude/agents"),
  });

  const { query } = await import("@anthropic-ai/claude-agent-sdk");

  const runner = createAgentRunner({
    cwd: projectRoot,
    query,
    output: devNull,
    model: "claude-haiku-4-5-20251001",
    maxTurns: 15,
    allowedTools: ["Read", "Write", "Edit"],
    settingSources: ["project"],
    systemPrompt,
    redactor,
  });

  const task = [
    `Fix these wiki audit findings.`,
    `The wiki root is ${wikiRoot}.`,
    ``,
    auditText,
  ].join("\n");

  const result = await runner.run(task);
  if (result.text) runtime.proc.stdout.write(result.text + "\n");
  return { ok: result.success, code: result.success ? 0 : 1 };
}
