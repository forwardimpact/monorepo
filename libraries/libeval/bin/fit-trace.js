#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";

import {
  runRunsCommand,
  runDownloadCommand,
  runOverviewCommand,
  runCountCommand,
  runBatchCommand,
  runHeadCommand,
  runTailCommand,
  runSearchCommand,
  runToolsCommand,
  runToolCommand,
  runErrorsCommand,
  runReasoningCommand,
  runTimelineCommand,
  runStatsCommand,
  runInitCommand,
  runTurnCommand,
  runFilterCommand,
  runSplitCommand,
} from "../src/commands/trace.js";

// `bun build --compile` injects FIT_TRACE_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_TRACE_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-trace",
  version: VERSION,
  description:
    "Download, query, and analyze agent execution traces — read NDJSON output from fit-eval as qualitative research",
  commands: [
    {
      name: "runs",
      args: "[pattern]",
      description:
        "List recent GitHub Actions workflow runs (default pattern: agent)",
      options: {
        lookback: {
          type: "string",
          description: "How far back to search (default: 7d)",
        },
        repo: {
          type: "string",
          description:
            "GitHub repo override (default: $GITHUB_REPOSITORY or 'origin' git remote)",
        },
      },
    },
    {
      name: "download",
      args: "<run-id>",
      description: "Download trace artifact and convert to structured JSON",
      options: {
        dir: { type: "string", description: "Output directory" },
        artifact: { type: "string", description: "Artifact name override" },
        repo: {
          type: "string",
          description:
            "GitHub repo override (default: $GITHUB_REPOSITORY or 'origin' git remote)",
        },
      },
    },
    {
      name: "overview",
      args: "<file>",
      description: "Metadata, summary, turn count, tool frequency",
    },
    {
      name: "count",
      args: "<file>",
      description: "Number of turns",
    },
    {
      name: "batch",
      args: "<file> <from> <to>",
      description: "Turns in range [from, to) (zero-indexed)",
    },
    {
      name: "head",
      args: "<file> [N]",
      description: "First N turns (default 10)",
    },
    {
      name: "tail",
      args: "<file> [N]",
      description: "Last N turns (default 10)",
    },
    {
      name: "search",
      args: "<file> <pattern>",
      description: "Search all content for regex pattern",
      options: {
        limit: {
          type: "string",
          description: "Max results (default: 50)",
        },
        context: {
          type: "string",
          description: "Surrounding turns per hit (default: 0)",
        },
        full: {
          type: "boolean",
          description: "Full content block in match descriptions",
        },
      },
    },
    {
      name: "tools",
      args: "<file>",
      description: "Tool usage frequency (descending)",
    },
    {
      name: "tool",
      args: "<file> <name>",
      description: "All turns involving a specific tool",
    },
    {
      name: "errors",
      args: "<file>",
      description: "Tool results with isError=true",
    },
    {
      name: "reasoning",
      args: "<file>",
      description: "Agent reasoning text only",
      options: {
        from: { type: "string", description: "Start at turn index" },
        to: { type: "string", description: "Stop before turn index" },
      },
    },
    {
      name: "timeline",
      args: "<file>",
      description: "Compact one-line-per-turn overview",
    },
    {
      name: "stats",
      args: "<file>",
      description: "Token usage and cost breakdown",
    },
    {
      name: "init",
      args: "<file>",
      description: "Full system/init event",
    },
    {
      name: "turn",
      args: "<file> <index>",
      description: "Single turn by index",
    },
    {
      name: "filter",
      args: "<file>",
      description: "Filter turns by role, tool, or error status",
      options: {
        role: {
          type: "string",
          description: "Turn role (system, user, assistant, tool_result)",
        },
        tool: {
          type: "string",
          description: "Tool name (matches assistant turns)",
        },
        error: {
          type: "boolean",
          description: "Error tool_result turns only",
        },
      },
    },
    {
      name: "split",
      args: "<file>",
      description:
        "Split a combined trace into per-source files following the `trace--<case>--<participant>.<role>.ndjson` convention",
      options: {
        mode: {
          type: "string",
          description: "Execution mode: run, supervise, or facilitate",
        },
        case: {
          type: "string",
          description:
            "Case identifier embedded in output filenames (default: default)",
        },
        "output-dir": {
          type: "string",
          description: "Output directory (default: same as input)",
        },
      },
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
    signatures: {
      type: "boolean",
      description: "Include thinking.signature blobs in output",
    },
  },
  examples: [
    "fit-trace runs --lookback 7d",
    "fit-trace download 24497273755",
    "fit-trace split structured.json --mode=facilitate",
    "fit-trace overview structured.json",
    "fit-trace timeline structured.json",
    "fit-trace stats structured.json",
    "fit-trace tool structured.json Conclude",
    "fit-trace search structured.json 'error|fail' --context 1",
    "fit-trace filter structured.json --tool Bash --error",
    "fit-trace turn structured.json 3",
  ],
  documentation: [
    {
      title: "Analyze Traces",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md",
      description:
        "The full method walkthrough with worked examples (an eval that failed, a multi-agent session that stalled).",
    },
    {
      title: "Run an Eval",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md",
      description:
        "How `fit-eval supervise` produces the traces this skill analyzes.",
    },
    {
      title: "Prove Agent Changes",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/index.md",
      description:
        "End-to-end workflow including multi-agent collaboration; `split` is the bridge into per-source trace files.",
    },
  ],
};

const cli = createCli(definition);
const logger = createLogger("trace");

const COMMANDS = {
  runs: runRunsCommand,
  download: runDownloadCommand,
  overview: runOverviewCommand,
  count: runCountCommand,
  batch: runBatchCommand,
  head: runHeadCommand,
  tail: runTailCommand,
  search: runSearchCommand,
  tools: runToolsCommand,
  tool: runToolCommand,
  errors: runErrorsCommand,
  reasoning: runReasoningCommand,
  timeline: runTimelineCommand,
  stats: runStatsCommand,
  init: runInitCommand,
  turn: runTurnCommand,
  filter: runFilterCommand,
  split: runSplitCommand,
};

async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;

  if (positionals.length === 0) {
    cli.usageError("no command specified");
    process.exit(2);
  }

  const [command, ...args] = positionals;
  const handler = COMMANDS[command];

  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  const config = await createScriptConfig("eval");
  await handler(values, args, { config });
}

main().catch((error) => {
  logger.exception("main", error);
  cli.error(error.message);
  process.exit(1);
});
