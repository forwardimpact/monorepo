#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
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
import { runAssertCommand } from "../src/commands/assert.js";
import { runByDiscussionCommand } from "../src/commands/by-discussion.js";

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
      args: ["pattern"],
      argsUsage: "[pattern]",
      handler: runRunsCommand,
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
      args: ["run-id"],
      argsUsage: "<run-id>",
      handler: runDownloadCommand,
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
      args: ["file"],
      argsUsage: "<file>",
      handler: runOverviewCommand,
      description: "Metadata, summary, turn count, tool frequency",
    },
    {
      name: "count",
      args: ["file"],
      argsUsage: "<file>",
      handler: runCountCommand,
      description: "Number of turns",
    },
    {
      name: "batch",
      args: ["file", "from", "to"],
      argsUsage: "<file> <from> <to>",
      handler: runBatchCommand,
      description: "Turns in range [from, to) (zero-indexed)",
    },
    {
      name: "head",
      args: ["file", "n"],
      argsUsage: "<file> [N]",
      handler: runHeadCommand,
      description: "First N turns (default 10)",
    },
    {
      name: "tail",
      args: ["file", "n"],
      argsUsage: "<file> [N]",
      handler: runTailCommand,
      description: "Last N turns (default 10)",
    },
    {
      name: "search",
      args: ["file", "pattern"],
      argsUsage: "<file> <pattern>",
      handler: runSearchCommand,
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
      args: ["file"],
      argsUsage: "<file>",
      handler: runToolsCommand,
      description: "Tool usage frequency (descending)",
    },
    {
      name: "tool",
      args: ["file", "name"],
      argsUsage: "<file> <name>",
      handler: runToolCommand,
      description: "All turns involving a specific tool",
    },
    {
      name: "errors",
      args: ["file"],
      argsUsage: "<file>",
      handler: runErrorsCommand,
      description: "Tool results with isError=true",
    },
    {
      name: "reasoning",
      args: ["file"],
      argsUsage: "<file>",
      handler: runReasoningCommand,
      description: "Agent reasoning text only",
      options: {
        from: { type: "string", description: "Start at turn index" },
        to: { type: "string", description: "Stop before turn index" },
      },
    },
    {
      name: "timeline",
      args: ["file"],
      argsUsage: "<file>",
      handler: runTimelineCommand,
      description: "Compact one-line-per-turn overview",
    },
    {
      name: "stats",
      args: ["file"],
      argsUsage: "<file>",
      handler: runStatsCommand,
      description: "Token usage and cost breakdown",
    },
    {
      name: "init",
      args: ["file"],
      argsUsage: "<file>",
      handler: runInitCommand,
      description: "Full system/init event",
    },
    {
      name: "turn",
      args: ["file", "index"],
      argsUsage: "<file> <index>",
      handler: runTurnCommand,
      description: "Single turn by index",
    },
    {
      name: "by-discussion",
      args: ["discussion-id", "trace-dir"],
      argsUsage: "<discussion-id> [trace-dir]",
      handler: runByDiscussionCommand,
      description:
        "List trace files whose meta header carries the given discussion_id, ordered by first-event timestamp",
      options: {
        "trace-dir": {
          type: "string",
          description: "Directory to scan (default: traces)",
        },
      },
    },
    {
      name: "filter",
      args: ["file"],
      argsUsage: "<file>",
      handler: runFilterCommand,
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
      args: ["file"],
      argsUsage: "<file>",
      handler: runSplitCommand,
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
    {
      name: "assert",
      args: ["test-name", "file"],
      argsUsage: "<test-name> <file>",
      handler: runAssertCommand,
      description:
        "Shell-friendly assertion — outputs structured JSON for invariant hooks",
      options: {
        grep: {
          type: "string",
          description:
            "Pass if extended regex matches file content (case-insensitive)",
        },
        query: {
          type: "string",
          description:
            "Pass if JMESPath expression against JSON/NDJSON yields a truthy result",
        },
        exists: {
          type: "boolean",
          description: "Pass if file exists",
        },
        "cites-job": {
          type: "string",
          description:
            "Pass if <file> contains the canonical citation from a <job> tag in the given JTBD file",
        },
        not: {
          type: "boolean",
          description: "Invert the assertion",
        },
        message: {
          type: "string",
          description: "Custom failure message",
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
    "fit-trace assert has-heading --grep '^## Problem' spec.md",
    "fit-trace assert no-leak --not --grep 'password' output.log",
    "fit-trace assert file-present --exists path/to/spec.md",
    "fit-trace assert cites-jtbd --cites-job jtbd-excerpt.md spec.md",
    "fit-trace assert used-edit --query \"[?type=='assistant'].message.content[] | [?name=='Edit']\" trace.ndjson",
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

const runtime = createDefaultRuntime();
const logger = createLogger("trace", runtime);

// Commands that talk to the GitHub API need a config-backed token resolver;
// the rest only read local trace files through the runtime.
const NEEDS_CONFIG = new Set(["runs", "download"]);

async function main() {
  const cli = createCli(definition, { runtime });
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0);

  const { positionals } = parsed;
  if (positionals.length === 0) {
    cli.usageError("no command specified");
    return runtime.proc.exit(2);
  }

  const command = positionals[0];
  if (!definition.commands.some((c) => c.name === command)) {
    cli.usageError(`unknown command "${command}"`);
    return runtime.proc.exit(2);
  }

  const config = NEEDS_CONFIG.has(command)
    ? await createScriptConfig("eval")
    : undefined;

  const result = await cli.dispatch(parsed, { deps: { runtime, config } });
  const envelope = result ?? { ok: true };
  if (!envelope.ok && envelope.error) cli.error(envelope.error);
  runtime.proc.exit(envelope.ok ? 0 : (envelope.code ?? 1));
}

main().catch((error) => {
  logger.exception("main", error);
  createCli(definition, { runtime }).error(error.message);
  process.exit(1);
});
