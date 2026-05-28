import fsAsync from "node:fs/promises";
import path from "node:path";
import { Writable } from "node:stream";
import { Finder, emitFindingsText, runRules } from "@forwardimpact/libutil";
import {
  createAgentRunner,
  composeProfilePrompt,
  createRedactor,
} from "@forwardimpact/libeval";
import { RULES } from "../audit/rules.js";
import { buildContext, resolveScope } from "../audit/scopes.js";

/** Run the wiki audit and auto-fix findings via a Haiku-powered AgentRunner. */
export async function runFixCommand(values, _args, _cli) {
  const finder = new Finder(fsAsync, { debug() {} }, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);

  const ctx = buildContext({ wikiRoot, today });
  const findings = runRules(RULES, ctx, { resolveScope });

  if (findings.length === 0) {
    process.stdout.write("nothing to fix\n");
    return;
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
  if (result.text) process.stdout.write(result.text + "\n");
  process.exit(result.success ? 0 : 1);
}
