#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync, realpathSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";

import { runBenchmarkRunCommand } from "../src/commands/benchmark-run.js";
import { runBenchmarkScoreCommand } from "../src/commands/benchmark-score.js";
import { runBenchmarkReportCommand } from "../src/commands/benchmark-report.js";

// `bun build --compile` injects FIT_BENCHMARK_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_BENCHMARK_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

export const definition = {
  name: "fit-benchmark",
  version: VERSION,
  description:
    "Run coding-agent task families, grade hidden tests, and aggregate pass@k across runs.",
  commands: [
    {
      name: "run",
      args: "",
      description:
        "Run every task in a family for N runs and emit one result record per (task, runIndex).",
      options: {
        family: {
          type: "string",
          description: "Path or git URL to a task family",
        },
        output: {
          type: "string",
          description:
            "Run-output directory (created if missing, default: benchmark-runs)",
        },
        runs: {
          type: "string",
          description: "Runs per task (integer ≥ 1, default: 5)",
        },
        "agent-model": {
          type: "string",
          description:
            "Claude model for the agent-under-test (default: claude-sonnet-4-6)",
        },
        "lead-model": {
          type: "string",
          description:
            "Claude model for the lead role (default: claude-opus-4-7)",
        },
        "judge-model": {
          type: "string",
          description: "Claude model for the judge (default: claude-opus-4-7)",
        },
        "agent-profile": {
          type: "string",
          description: "Agent-under-test profile name",
        },
        "judge-profile": {
          type: "string",
          description: "Judge profile name",
        },
        "max-turns": {
          type: "string",
          description:
            "Agent-under-test turn budget (default: 50, 0 = unlimited)",
        },
        "allowed-tools": {
          type: "string",
          description:
            "Comma-separated tool allowlist for the agent-under-test (default: Bash,Read,Glob,Grep,Write,Edit,Agent,TodoWrite)",
        },
      },
    },
    {
      name: "score",
      args: "",
      description:
        "Score a single task against a post-run workdir without invoking an agent.",
      options: {
        family: {
          type: "string",
          description: "Path or git URL to a task family",
        },
        task: {
          type: "string",
          description: "Task id (directory name under tasks/)",
        },
        workdir: {
          type: "string",
          description:
            "Post-run directory; <workdir>/cwd/ is the agent CWD scoring runs against",
        },
        output: {
          type: "string",
          description: "Output file (defaults to stdout; one JSONL line)",
        },
      },
    },
    {
      name: "report",
      args: "",
      description:
        "Aggregate result records into pass@k via the OpenAI HumanEval estimator.",
      options: {
        input: {
          type: "string",
          description:
            "Run-output directory containing results.jsonl (default: benchmark-runs)",
        },
        k: {
          type: "string",
          description: "Comma-separated k values (default: 1,3,5)",
        },
        format: {
          type: "string",
          description: "Output format (json|text, default: json)",
        },
      },
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-benchmark run --family=./families/coding",
    "fit-benchmark run --family=./families/coding --runs=10 --agent-model=claude-sonnet-4-6",
    "fit-benchmark score --family=./families/coding --task=todo-api --workdir=./benchmark-runs/runs/todo-api/0",
    "fit-benchmark report --format=text",
    "fit-benchmark report --input=./runs/today --k=1,3,5 --format=text",
  ],
  documentation: [
    {
      title: "Run a Benchmark",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md",
      description:
        "Author a coding-task family, run a benchmark across multiple runs, and read the pass@k report.",
    },
    {
      title: "Automate with GitHub Actions",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/ci-workflow/index.md",
      description:
        "Run benchmarks in CI with the forwardimpact/fit-benchmark action.",
    },
  ],
};

const cli = createCli(definition);
const logger = createLogger("benchmark");

const COMMANDS = {
  run: runBenchmarkRunCommand,
  score: runBenchmarkScoreCommand,
  report: runBenchmarkReportCommand,
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

  await handler(values, args);
}

// Run main only when invoked as a CLI. Importing for tests (e.g. parity)
// should not execute the entry point.
if (import.meta.url === `file://${realpathSync(process.argv[1])}`) {
  main().catch((error) => {
    logger.exception("main", error);
    cli.error(error.message);
    process.exit(1);
  });
}
