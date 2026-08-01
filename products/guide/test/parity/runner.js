#!/usr/bin/env node
/**
 * Parity rubric runner — evaluates Guide fixtures across surfaces.
 *
 * Usage:
 *   node runner.js --surface cli     # Test via fit-guide CLI
 *   node runner.js --surface mcp     # Test via direct MCP tool calls
 *
 * This runner needs a live Guide stack and ANTHROPIC_API_KEY.
 * Evaluate the Claude Chat surface manually (document steps).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(
  readFileSync(join(__dirname, "fixtures.json"), "utf8"),
);

const surface = process.argv.includes("--surface")
  ? process.argv[process.argv.indexOf("--surface") + 1]
  : "cli";

async function runFixtureCli(fixture) {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const exec = promisify(execFile);

  const result = await exec("node", [
    join(__dirname, "..", "..", "bin", "fit-guide.js"),
    fixture.question,
  ]);
  return { answer: result.stdout, toolCalls: [] };
}

async function runFixtureMcp(fixture) {
  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const config = await createServiceConfig("mcp");
  const mcpUrl = config.url;
  const mcpToken = config.mcpToken();

  // Call each expected tool directly via MCP JSON-RPC
  const toolResults = [];
  for (const toolName of fixture.expected_tools) {
    const res = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mcpToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: toolName, arguments: {} },
      }),
    });
    if (res.ok) {
      const body = await res.json();
      toolResults.push({ tool: toolName, result: body });
    }
  }

  return {
    answer: toolResults.map((t) => JSON.stringify(t.result)).join("\n"),
    toolCalls: toolResults.map((t) => t.tool),
  };
}

async function evaluateFixture(fixture, result) {
  const toolCoverage = fixture.expected_tools.every((t) =>
    result.toolCalls.includes(t),
  );

  const hasSubstance = result.answer && result.answer.length > 10;

  return {
    id: fixture.id,
    toolCoverage: toolCoverage ? "pass" : "fail",
    substance: hasSubstance ? "pass" : "needs-llm-judge",
    answer_length: result.answer?.length || 0,
  };
}

async function main() {
  console.log(`Running parity fixtures on surface: ${surface}\n`);

  const results = [];
  for (const fixture of fixtures) {
    process.stdout.write(`  ${fixture.id}... `);
    try {
      const result =
        surface === "mcp"
          ? await runFixtureMcp(fixture)
          : await runFixtureCli(fixture);

      const evaluation = await evaluateFixture(fixture, result);
      results.push(evaluation);
      console.log(
        `tools=${evaluation.toolCoverage} substance=${evaluation.substance}`,
      );
    } catch (err) {
      results.push({ id: fixture.id, error: err.message });
      console.log(`error: ${err.message}`);
    }
  }

  console.log(`\nResults: ${results.length}/${fixtures.length} evaluated`);
  const passes = results.filter(
    (r) => r.toolCoverage === "pass" && r.substance !== "fail",
  );
  console.log(`Passing: ${passes.length}/${results.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
