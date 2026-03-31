#!/usr/bin/env node
/**
 * Analyze NDJSON logs from Guide product setup test.
 *
 * Reads *.ndjson files from the logs directory and produces a structured
 * report covering: tool usage, cost, timing, error patterns, documentation
 * coverage, and downstream Claude's reasoning quality.
 *
 * Usage:
 *   node analyze.mjs ./logs
 *   ./run.sh --analyze
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const logsDir = process.argv[2] || "./logs";

// ── Parse all NDJSON files ──────────────────────────────────────────────

function parseNdjson(filePath) {
  const lines = readFileSync(filePath, "utf8").trim().split("\n");
  const events = [];
  for (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

function analyzeStep(filePath) {
  const events = parseNdjson(filePath);
  const step = basename(filePath, ".ndjson");

  const analysis = {
    step,
    toolCalls: [],
    webFetches: [],
    bashCommands: [],
    writes: [],
    errors: [],
    assistantTexts: [],
    cost: 0,
    durationMs: 0,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreateTokens: 0,
    modelUsage: {},
    permissionDenials: [],
  };

  for (const event of events) {
    switch (event.type) {
      case "assistant": {
        const content = event.message?.content || [];
        for (const c of content) {
          if (c.type === "tool_use") {
            const call = { tool: c.name, id: c.id, input: c.input };
            analysis.toolCalls.push(call);

            if (c.name === "WebFetch") {
              analysis.webFetches.push(c.input?.url || "unknown");
            } else if (c.name === "Bash") {
              analysis.bashCommands.push(
                c.input?.command?.slice(0, 120) || "unknown",
              );
            } else if (c.name === "Write") {
              analysis.writes.push(c.input?.file_path || "unknown");
            }
          } else if (c.type === "text" && c.text) {
            analysis.assistantTexts.push(c.text);
          }
        }
        // Token tracking per turn
        const usage = event.message?.usage;
        if (usage) {
          analysis.inputTokens += usage.input_tokens || 0;
          analysis.outputTokens += usage.output_tokens || 0;
          analysis.cacheReadTokens += usage.cache_read_input_tokens || 0;
          analysis.cacheCreateTokens += usage.cache_creation_input_tokens || 0;
        }
        break;
      }
      case "user": {
        const content = event.message?.content || [];
        for (const c of content) {
          if (c.type === "tool_result" && c.is_error) {
            analysis.errors.push({
              toolUseId: c.tool_use_id,
              content:
                typeof c.content === "string"
                  ? c.content.slice(0, 200)
                  : JSON.stringify(c.content).slice(0, 200),
            });
          }
        }
        break;
      }
      case "result": {
        analysis.cost = event.total_cost_usd || 0;
        analysis.durationMs = event.duration_ms || 0;
        analysis.turns = event.num_turns || 0;
        analysis.isError = event.is_error || false;
        analysis.stopReason = event.stop_reason || "unknown";
        analysis.modelUsage = event.modelUsage || {};
        analysis.permissionDenials = event.permission_denials || [];
        break;
      }
    }
  }

  return analysis;
}

// ── Aggregate and report ────────────────────────────────────────────────

const ndjsonFiles = readdirSync(logsDir)
  .filter((f) => f.endsWith(".ndjson"))
  .sort()
  .map((f) => join(logsDir, f));

if (ndjsonFiles.length === 0) {
  console.error("No .ndjson files found in", logsDir);
  process.exit(1);
}

const steps = ndjsonFiles.map(analyzeStep);

// URLs the docs point to
const expectedUrls = [
  "https://www.forwardimpact.team/docs/",
  "https://www.forwardimpact.team/guide/",
  "https://www.forwardimpact.team/docs/getting-started/developers/",
  "https://www.forwardimpact.team/docs/guides/finding-your-bearing/",
  "https://www.forwardimpact.team/docs/internals/guide/",
  "https://www.forwardimpact.team/docs/reference/cli/",
  "https://www.forwardimpact.team/docs/internals/operations/",
  "https://www.forwardimpact.team/docs/reference/yaml-schema/",
  "https://www.forwardimpact.team/docs/reference/model/",
];

const allFetches = steps.flatMap((s) => s.webFetches);
const fetchedUrls = new Set(allFetches);
const missedUrls = expectedUrls.filter((u) => !fetchedUrls.has(u));
const extraUrls = allFetches.filter((u) => !expectedUrls.includes(u));

// Key commands we expect the install/configure steps to try
const expectedCommands = [
  { pattern: /bun init/, label: "bun init" },
  { pattern: /bun install.*@forwardimpact/, label: "bun install @forwardimpact" },
  { pattern: /fit-pathway.*--help/, label: "fit-pathway --help" },
  { pattern: /fit-map.*--help/, label: "fit-map --help" },
  { pattern: /fit-guide.*--help/, label: "fit-guide --help" },
  { pattern: /fit-pathway init/, label: "fit-pathway init" },
  { pattern: /fit-pathway.*discipline/, label: "fit-pathway discipline" },
  { pattern: /fit-pathway.*level/, label: "fit-pathway level" },
  { pattern: /fit-pathway.*job/, label: "fit-pathway job" },
  { pattern: /fit-pathway.*agent/, label: "fit-pathway agent" },
  { pattern: /fit-map.*validate/, label: "fit-map validate" },
];

const allBashCmds = steps.flatMap((s) => s.bashCommands);
const cmdCoverage = expectedCommands.map((ec) => ({
  label: ec.label,
  found: allBashCmds.some((cmd) => ec.pattern.test(cmd)),
}));

// ── Print report ────────────────────────────────────────────────────────

const totalCost = steps.reduce((s, x) => s + x.cost, 0);
const totalDuration = steps.reduce((s, x) => s + x.durationMs, 0);
const totalTools = steps.reduce((s, x) => s + x.toolCalls.length, 0);
const totalErrors = steps.reduce((s, x) => s + x.errors.length, 0);
const totalTurns = steps.reduce((s, x) => s + x.turns, 0);

const report = [];
const log = (s = "") => report.push(s);

log("# Guide Product Setup Test — Analysis Report");
log();
log("## Summary");
log();
log(`| Metric | Value |`);
log(`|--------|-------|`);
log(`| Steps completed | ${steps.length} |`);
log(`| Total cost | $${totalCost.toFixed(4)} |`);
log(`| Total duration | ${(totalDuration / 1000).toFixed(1)}s |`);
log(`| Total turns | ${totalTurns} |`);
log(`| Total tool calls | ${totalTools} |`);
log(`| Total errors | ${totalErrors} |`);
log(`| URLs fetched | ${fetchedUrls.size}/${expectedUrls.length} expected |`);
log(
  `| Command coverage | ${cmdCoverage.filter((c) => c.found).length}/${cmdCoverage.length} |`,
);
log();

log("## Per-Step Breakdown");
log();
for (const s of steps) {
  log(`### ${s.step}`);
  log();
  log(`- **Duration:** ${(s.durationMs / 1000).toFixed(1)}s`);
  log(`- **Cost:** $${s.cost.toFixed(4)}`);
  log(`- **Turns:** ${s.turns}`);
  log(`- **Tool calls:** ${s.toolCalls.length}`);
  log(
    `- **Tokens:** ${s.inputTokens} in / ${s.outputTokens} out / ${s.cacheReadTokens} cache-read / ${s.cacheCreateTokens} cache-create`,
  );
  log(`- **Errors:** ${s.errors.length}`);
  log(`- **Result:** ${s.isError ? "FAIL" : "PASS"} (${s.stopReason})`);
  if (s.webFetches.length > 0) {
    log(`- **URLs fetched:**`);
    for (const u of s.webFetches) log(`  - ${u}`);
  }
  if (s.bashCommands.length > 0) {
    log(`- **Bash commands:** ${s.bashCommands.length}`);
    for (const c of s.bashCommands) log(`  - \`${c}\``);
  }
  if (s.writes.length > 0) {
    log(`- **Files written:**`);
    for (const w of s.writes) log(`  - ${w}`);
  }
  if (s.errors.length > 0) {
    log(`- **Error details:**`);
    for (const e of s.errors) log(`  - ${e.content}`);
  }
  if (s.permissionDenials.length > 0) {
    log(`- **Permission denials:** ${s.permissionDenials.length}`);
  }
  log();
}

log("## Documentation Coverage");
log();
log("### Expected URLs");
log();
for (const u of expectedUrls) {
  const hit = fetchedUrls.has(u) ? "FETCHED" : "MISSED";
  log(`- [${hit}] ${u}`);
}
log();
if (extraUrls.length > 0) {
  log("### Extra URLs fetched (not in expected set)");
  log();
  for (const u of [...new Set(extraUrls)]) log(`- ${u}`);
  log();
}
if (missedUrls.length > 0) {
  log("### Missed URLs (expected but not fetched)");
  log();
  for (const u of missedUrls) log(`- ${u}`);
  log();
}

log("## Command Coverage");
log();
for (const c of cmdCoverage) {
  log(`- [${c.found ? "RAN" : "MISSED"}] ${c.label}`);
}
log();

log("## Tool Usage Distribution");
log();
const toolCounts = {};
for (const s of steps) {
  for (const tc of s.toolCalls) {
    toolCounts[tc.tool] = (toolCounts[tc.tool] || 0) + 1;
  }
}
log(`| Tool | Calls |`);
log(`|------|-------|`);
for (const [tool, count] of Object.entries(toolCounts).sort(
  (a, b) => b[1] - a[1],
)) {
  log(`| ${tool} | ${count} |`);
}
log();

if (totalErrors > 0) {
  log("## Errors");
  log();
  for (const s of steps) {
    for (const e of s.errors) {
      log(`- **${s.step}:** ${e.content}`);
    }
  }
  log();
}

const reportText = report.join("\n");
console.log(reportText);

// Also write as JSON for programmatic consumption
const jsonReport = {
  timestamp: new Date().toISOString(),
  summary: {
    steps: steps.length,
    totalCost: totalCost,
    totalDurationMs: totalDuration,
    totalTurns: totalTurns,
    totalToolCalls: totalTools,
    totalErrors: totalErrors,
    urlCoverage: `${fetchedUrls.size}/${expectedUrls.length}`,
    cmdCoverage: `${cmdCoverage.filter((c) => c.found).length}/${cmdCoverage.length}`,
  },
  steps: steps.map((s) => ({
    step: s.step,
    cost: s.cost,
    durationMs: s.durationMs,
    turns: s.turns,
    toolCalls: s.toolCalls.length,
    errors: s.errors.length,
    isError: s.isError,
    webFetches: s.webFetches,
    bashCommands: s.bashCommands,
    writes: s.writes,
  })),
  docCoverage: { expected: expectedUrls, fetched: [...fetchedUrls], missed: missedUrls, extra: [...new Set(extraUrls)] },
  cmdCoverage,
  toolCounts,
};

const jsonPath = join(logsDir, "analysis.json");
const mdPath = join(logsDir, "analysis.md");
writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
writeFileSync(mdPath, reportText);
console.log(`\nWritten: ${mdPath}`);
console.log(`Written: ${jsonPath}`);
