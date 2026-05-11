#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";

import { runBenchmarkRunCommand } from "../src/commands/benchmark-run.js";
import { runBenchmarkScoreCommand } from "../src/commands/benchmark-score.js";
import { runBenchmarkReportCommand } from "../src/commands/benchmark-report.js";

// Matches `bin/fit-eval.js` — `bun build --compile` injects the version via
// --define so the compiled binary never reads package.json (the bunfs mount
// can't open it). Source execution falls through.
const VERSION =
  process.env.FIT_BENCHMARK_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

export const definition = {
  name: "fit-benchmark",
  version: VERSION,
  description:
    "Run a coding-agent task family across multiple runs and aggregate pass@k",
  commands: [
    {
      name: "run",
      args: "",
      description:
        "Execute every task in a family `runs` times and aggregate result records",
      options: {
        family: {
          type: "string",
          description: "Path or git URL to the task family root",
        },
        output: {
          type: "string",
          description:
            "Run-output directory (results.jsonl and per-task traces land here)",
        },
        runs: {
          type: "string",
          description: "Times each task is repeated (default 1)",
        },
        model: {
          type: "string",
          description: "Claude model id (default: opus)",
        },
        "agent-profile": {
          type: "string",
          description: "Agent-under-test profile name",
        },
        "judge-profile": {
          type: "string",
          description: "Judge profile name (supervisor over the judge agent)",
        },
        "max-turns": {
          type: "string",
          description: "Agent-under-test budget (default 50)",
        },
      },
    },
    {
      name: "score",
      args: "",
      description:
        "Re-run a task's scoring against an existing workdir without spending agent cost",
      options: {
        family: { type: "string", description: "Task family root" },
        task: {
          type: "string",
          description: "METR-style task id `task_family/task_name`",
        },
        workdir: {
          type: "string",
          description:
            "Post-run dir whose layout matches WorkdirManager output (`<workdir>/cwd/` is the agent CWD)",
        },
        output: {
          type: "string",
          description: "Write the scoring record to a file (default: stdout)",
        },
      },
    },
    {
      name: "report",
      args: "",
      description: "Compute pass@k from a run-output directory's results.jsonl",
      options: {
        input: {
          type: "string",
          description: "Run-output directory containing results.jsonl",
        },
        k: {
          type: "string",
          description: "Comma-separated k-values (default 1,3,5)",
        },
        format: {
          type: "string",
          description: "Output format (json|text); default json",
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
    "fit-benchmark run --family=./tasks --output=./out --runs=5",
    "fit-benchmark score --family=./tasks --task=todo-api/basic --workdir=./out/runs/todo-api__basic/0",
    "fit-benchmark report --input=./out --k=1,3,5 --format=text",
  ],
  documentation: [
    {
      title: "Run a Benchmark",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-benchmark/index.md",
      description:
        "Author a coding-task family, run a benchmark across multiple runs, and read the pass@k report.",
    },
  ],
};

const COMMANDS = {
  run: runBenchmarkRunCommand,
  score: runBenchmarkScoreCommand,
  report: runBenchmarkReportCommand,
};

async function main() {
  const cli = createCli(definition);
  const logger = createLogger("benchmark");
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
  try {
    await handler(values, args);
  } catch (err) {
    logger.exception("main", err);
    cli.error(err.message);
    process.exit(1);
  }
}

// Run main() only when this file is the entry point — importing the
// `definition` (e.g. from the parity test) must NOT trigger CLI parsing.
const isDirectEntry =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/fit-benchmark.js") ||
  process.argv[1]?.endsWith("/fit-benchmark");
if (isDirectEntry) {
  main();
}
