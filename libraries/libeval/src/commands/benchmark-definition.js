/**
 * `fit-benchmark` CLI definition. Lives in `src/` so the bin stays an
 * execute-on-import entry point (spec 1670 launcher contract) while tests
 * import the definition without running the CLI.
 */

import { runBenchmarkRunCommand } from "./benchmark-run.js";
import { runBenchmarkInvariantsCommand } from "./benchmark-invariants.js";
import { runBenchmarkReportCommand } from "./benchmark-report.js";
import {
  BENCHMARK_AGENT_MODEL,
  LEAD_MODEL,
} from "@forwardimpact/libutil/models";

export const definition = {
  name: "fit-benchmark",
  description:
    "Run coding-agent task families, grade hidden tests, and aggregate pass@k across runs.",
  commands: [
    {
      name: "run",
      args: [],
      handler: runBenchmarkRunCommand,
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
          description: `Claude model for the agent-under-test (default: ${BENCHMARK_AGENT_MODEL})`,
        },
        "lead-model": {
          type: "string",
          description: `Claude model for the lead role (default: ${LEAD_MODEL})`,
        },
        "judge-model": {
          type: "string",
          description: `Claude model for the judge (default: ${LEAD_MODEL})`,
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
      name: "invariants",
      args: [],
      handler: runBenchmarkInvariantsCommand,
      description:
        "Check a single task's invariants against a post-run workdir without invoking an agent.",
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
            "Post-run directory; <workdir>/cwd/ is the agent CWD invariants run against",
        },
        output: {
          type: "string",
          description: "Output file (defaults to stdout; one JSONL line)",
        },
      },
    },
    {
      name: "report",
      args: [],
      handler: runBenchmarkReportCommand,
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
    `fit-benchmark run --family=./families/coding --runs=10 --agent-model=${BENCHMARK_AGENT_MODEL}`,
    "fit-benchmark invariants --family=./families/coding --task=todo-api --workdir=./benchmark-runs/runs/todo-api/0",
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
