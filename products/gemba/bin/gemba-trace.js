#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createScriptConfig } from "@forwardimpact/libconfig";
import { createLogger } from "@forwardimpact/libtelemetry";

import {
  runRunsCommand,
  runFindCommand,
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
  runCostCommand,
  runInitCommand,
  runTurnCommand,
  runFilterCommand,
  runSplitCommand,
  runToolCallsCommand,
  runCommandsCommand,
  runPathsCommand,
  runCompareCommand,
} from "@forwardimpact/libharness/commands/trace.js";
import { runAssertCommand } from "@forwardimpact/libharness/commands/assert.js";
import { runByDiscussionCommand } from "@forwardimpact/libharness/commands/by-discussion.js";

// Cross-trace verbs take one or more trace files via repeated `--file`
// (libcli's named-slot `dispatch()` has no variadic positional). A value with
// glob metacharacters is expanded by the handler via `runtime.fsSync.globSync`.
const fileOption = () => ({
  file: {
    type: "string",
    multiple: true,
    description: "Trace file (repeat or pass a quoted glob for several)",
  },
});

const definition = {
  name: "gemba-trace",
  description:
    "Download, query, and analyze agent execution traces — read NDJSON output from gemba-harness as qualitative research",
  commands: [
    {
      name: "runs",
      args: ["pattern"],
      argsUsage: "[pattern]",
      handler: runRunsCommand,
      description:
        "List recent GitHub Actions workflow runs (default pattern: kata|agent|eval|benchmark)",
      options: {
        lookback: {
          type: "string",
          description: "How far back to search (default: 7d)",
        },
        participant: {
          type: "string",
          description:
            "Filter to runs carrying this participant's trace lane; in-progress candidates are labeled, not dropped",
        },
        repo: {
          type: "string",
          description:
            "GitHub repo override (default: $GITHUB_REPOSITORY or 'origin' git remote)",
        },
      },
    },
    {
      name: "find",
      args: ["run-id", "key"],
      argsUsage: "<run-id> <key>",
      handler: runFindCommand,
      description:
        "Resolve a trace lane for a known run id by key — exact filename, case, or participant; ambiguous keys error with the candidates",
      options: {
        dir: {
          type: "string",
          description: "Output directory for a downloaded dispatch artifact",
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
      description:
        "Download a trace artifact and extract its .ndjson members (structured.json is produced only for single-member artifacts); pass --artifact to pick one when a workflow emits multiple `trace--*` artifacts",
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
      args: [],
      handler: runOverviewCommand,
      description: "Metadata, summary, turn count, tool frequency",
      options: fileOption(),
    },
    {
      name: "count",
      args: [],
      handler: runCountCommand,
      description: "Number of turns",
      options: fileOption(),
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
      args: [],
      handler: runHeadCommand,
      description: "First N turns (default 10; set with --lines)",
      options: {
        ...fileOption(),
        lines: { type: "string", description: "Number of turns (default: 10)" },
      },
    },
    {
      name: "tail",
      args: [],
      handler: runTailCommand,
      description: "Last N turns (default 10; set with --lines)",
      options: {
        ...fileOption(),
        lines: { type: "string", description: "Number of turns (default: 10)" },
      },
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
      args: [],
      handler: runToolsCommand,
      description:
        "Tool usage frequency (descending). See also `tool` (turns for one tool) and `tool-calls` (paired use+result records)",
      options: fileOption(),
    },
    {
      name: "tool",
      args: ["file", "name"],
      argsUsage: "<file> <name>",
      handler: runToolCommand,
      description:
        "All turns involving a specific tool. See also `tools` (frequency) and `tool-calls` (paired use+result records)",
    },
    {
      name: "tool-calls",
      args: [],
      handler: runToolCallsCommand,
      description:
        "One record per tool_use block, each paired with its tool_result by toolUseId (orphans emit result:null). See also `tool` and `tools`",
      options: fileOption(),
    },
    {
      name: "commands",
      args: [],
      handler: runCommandsCommand,
      description:
        "One record per Bash tool_use block, carrying the command text",
      options: {
        ...fileOption(),
        match: {
          type: "string",
          description: "Filter to commands whose text matches this regex",
        },
      },
    },
    {
      name: "paths",
      args: [],
      handler: runPathsCommand,
      description:
        "Distinct Read/Edit/Write file_path arguments, frequency-sorted",
      options: {
        ...fileOption(),
        prefix: {
          type: "string",
          description: "Filter to paths beginning with this prefix",
        },
      },
    },
    {
      name: "compare",
      args: ["file-a", "file-b"],
      argsUsage: "<file-a> <file-b>",
      handler: runCompareCommand,
      description:
        "Side-by-side comparison of two traces: turns, tools, paths, cost, and per-tool delta",
    },
    {
      name: "errors",
      args: [],
      handler: runErrorsCommand,
      description: "Tool results with isError=true",
      options: fileOption(),
    },
    {
      name: "reasoning",
      args: [],
      handler: runReasoningCommand,
      description: "Agent reasoning text only",
      options: {
        ...fileOption(),
        from: { type: "string", description: "Start at turn index" },
        to: { type: "string", description: "Stop before turn index" },
      },
    },
    {
      name: "timeline",
      args: [],
      handler: runTimelineCommand,
      description: "Compact one-line-per-turn overview",
      options: fileOption(),
    },
    {
      name: "stats",
      args: [],
      handler: runStatsCommand,
      description: "Token usage and cost breakdown",
      options: {
        ...fileOption(),
        "by-tool": {
          type: "boolean",
          description: "Per-tool token attribution and cost share",
        },
        summary: {
          type: "boolean",
          description: "Totals only (suppress the per-turn array)",
        },
      },
    },
    {
      name: "cost",
      args: ["file"],
      argsUsage: "<file>",
      handler: runCostCommand,
      description:
        "Total run cost across every participant (agent, supervisor, judge, named profiles), with a per-source breakdown",
      options: {
        markdown: {
          type: "boolean",
          description:
            "Emit a GitHub-flavored markdown block (redirect into $GITHUB_STEP_SUMMARY)",
        },
      },
    },
    {
      name: "init",
      args: [],
      handler: runInitCommand,
      description: "Full system/init event",
      options: fileOption(),
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
      args: [],
      handler: runFilterCommand,
      description: "Filter turns by role, tool, or error status",
      options: {
        ...fileOption(),
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
          description: "Execution mode: run, supervise, facilitate, or discuss",
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
        gate: {
          type: "boolean",
          description:
            "Mark the row a gate check (any failing gate fails the run)",
        },
        weight: {
          type: "string",
          description:
            "Attach a numeric weight to the scored row; 0 marks the row diagnostic",
        },
      },
    },
  ],
  globalOptions: {
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: {
      type: "boolean",
      description: "Output help as JSON (use --format json for command output)",
    },
    format: {
      type: "string",
      default: "text",
      description: "Command output format: text (default) or json",
    },
    signatures: {
      type: "boolean",
      description: "Include thinking.signature blobs in output",
    },
  },
  examples: [
    "gemba-trace runs --lookback 7d",
    "gemba-trace runs --participant release-engineer",
    "gemba-trace find 27401632821 release-engineer",
    "gemba-trace find 27401632821 demo-task-r0",
    "gemba-trace download 24497273755",
    "gemba-trace split trace--default.raw.ndjson --mode=facilitate",
    "gemba-trace overview --file trace--default--agent.agent.ndjson",
    "gemba-trace overview --file trace--default--agent.agent.ndjson --format json",
    "gemba-trace timeline --file trace--default--agent.agent.ndjson",
    "gemba-trace stats --file trace--default--agent.agent.ndjson --by-tool",
    "gemba-trace cost trace--default.raw.ndjson",
    "gemba-trace cost trace--default.raw.ndjson --markdown",
    "gemba-trace tool trace--default--agent.agent.ndjson Conclude",
    "gemba-trace tool-calls --file trace--default--agent.agent.ndjson",
    "gemba-trace commands --file trace--default--agent.agent.ndjson --match '^git'",
    "gemba-trace paths --file 'traces/*.ndjson' --prefix /app",
    "gemba-trace compare trace-a.ndjson trace-b.ndjson",
    "gemba-trace search trace--default--agent.agent.ndjson 'error|fail' --context 1",
    "gemba-trace filter --file trace--default--agent.agent.ndjson --tool Bash --error",
    "gemba-trace turn trace--default--agent.agent.ndjson 3",
    "gemba-trace assert has-heading --grep '^## Problem' spec.md",
    "gemba-trace assert no-leak --not --grep 'password' output.log",
    "gemba-trace assert file-present --exists path/to/spec.md",
    "gemba-trace assert cites-jtbd --cites-job jtbd-excerpt.md spec.md",
    "gemba-trace assert used-edit --query \"[?type=='assistant'].message.content[] | [?name=='Edit']\" trace.ndjson",
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
        "How `gemba-harness supervise` produces the traces this skill analyzes.",
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
const NEEDS_CONFIG = new Set(["runs", "find", "download"]);

async function main() {
  const cli = createCli(definition, {
    runtime,
    packageJsonUrl: new URL("../package.json", import.meta.url),
  });
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
