#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createLogger } from "@forwardimpact/libtelemetry";

import { runOutputCommand } from "../src/commands/output.js";
import { runTeeCommand } from "../src/commands/tee.js";
import { runRunCommand } from "../src/commands/run.js";
import { runSuperviseCommand } from "../src/commands/supervise.js";
import { runFacilitateCommand } from "../src/commands/facilitate.js";
import { runDiscussCommand } from "../src/commands/discuss.js";
import { runCallbackCommand } from "../src/commands/callback.js";

// `bun build --compile` injects FIT_EVAL_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_EVAL_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const LEAD_OPTIONS = {
  "lead-profile": {
    type: "string",
    description: "Lead role profile name (supervisor / facilitator / chair)",
  },
  "lead-model": {
    type: "string",
    description:
      "Claude model for the lead role (default: claude-opus-4-7[1m])",
  },
};

// Shared task-input flags: --task-file (path), --task-text (inline), and
// --task-event (path to native GitHub event JSON composed into a task via
// libeval/src/events/github.js). Exactly one of the three is required.
const TASK_INPUT_OPTIONS = {
  "task-file": {
    type: "string",
    description: "Path to a markdown task file",
  },
  "task-text": {
    type: "string",
    description: "Inline task text (alternative to --task-file)",
  },
  "task-event": {
    type: "string",
    description:
      "Path to a native GitHub event payload JSON, composed into the task via libeval/src/events/github.js (reads $GITHUB_EVENT_NAME)",
  },
  "task-amend": {
    type: "string",
    description: "Additional text appended to the task",
  },
};

const definition = {
  name: "fit-eval",
  version: VERSION,
  description:
    "Run agents and capture NDJSON traces — for agent evaluations or multi-agent collaboration",
  commands: [
    {
      name: "run",
      args: [],
      argsUsage: "",
      handler: runRunCommand,
      description: "Run a single agent autonomously on a defined task",
      options: {
        ...TASK_INPUT_OPTIONS,
        "agent-model": {
          type: "string",
          description:
            "Claude model for the agent (default: claude-opus-4-7[1m])",
        },
        "max-turns": {
          type: "string",
          description: "Max agentic turns (default: 50, 0 = unlimited)",
        },
        output: {
          type: "string",
          description: "Write the NDJSON trace to a file",
        },
        cwd: { type: "string", description: "Working directory for the agent" },
        "agent-profile": {
          type: "string",
          description: "Agent profile name to load",
        },
        "allowed-tools": {
          type: "string",
          description: "Comma-separated tool allowlist",
        },
        "mcp-server": {
          type: "string",
          description:
            "Connect to the MCP service (e.g. --mcp-server=guide); adds mcp__<name>__* to allowed tools",
        },
      },
    },
    {
      name: "supervise",
      args: [],
      argsUsage: "",
      handler: runSuperviseCommand,
      description:
        "Run a supervisor–agent relay — typical shape for agent-as-judge evaluations",
      options: {
        ...TASK_INPUT_OPTIONS,
        "agent-model": {
          type: "string",
          description:
            "Claude model for the agent (default: claude-opus-4-7[1m])",
        },
        ...LEAD_OPTIONS,
        "max-turns": {
          type: "string",
          description:
            "Max agentic turns per runner invocation (default: 200, 0 = unlimited)",
        },
        output: {
          type: "string",
          description: "Write the NDJSON trace to a file",
        },
        "agent-profile": { type: "string", description: "Agent profile name" },
        "allowed-tools": {
          type: "string",
          description: "Agent tool allowlist",
        },
        "supervisor-cwd": {
          type: "string",
          description: "Supervisor working directory",
        },
        "agent-cwd": { type: "string", description: "Agent working directory" },
        "supervisor-allowed-tools": {
          type: "string",
          description: "Supervisor tool allowlist",
        },
        "mcp-server": {
          type: "string",
          description:
            "Connect to the MCP service (e.g. --mcp-server=guide); adds mcp__<name>__* to allowed tools",
        },
      },
    },
    {
      name: "facilitate",
      args: [],
      argsUsage: "",
      handler: runFacilitateCommand,
      description:
        "Run a facilitator with N participants — typical shape for multi-agent collaboration",
      options: {
        ...TASK_INPUT_OPTIONS,
        "agent-model": {
          type: "string",
          description: "Claude model for agents (default: claude-opus-4-7[1m])",
        },
        ...LEAD_OPTIONS,
        "max-turns": {
          type: "string",
          description: "Max agentic turns (default: 20, 0 = unlimited)",
        },
        output: {
          type: "string",
          description: "Write the NDJSON trace to a file",
        },
        "facilitator-cwd": {
          type: "string",
          description: "Facilitator working directory",
        },
        "agent-profiles": {
          type: "string",
          description:
            "Comma-separated list of participant profile names (required)",
        },
        "agent-cwd": {
          type: "string",
          description: "Working directory shared by participants (default: .)",
        },
      },
    },
    {
      name: "discuss",
      args: [],
      argsUsage: "",
      handler: runDiscussCommand,
      description:
        "Run an async, suspendable discussion — Chair + N participants + bridge callback",
      options: {
        ...TASK_INPUT_OPTIONS,
        "agent-model": {
          type: "string",
          description: "Claude model for agents (default: claude-opus-4-7[1m])",
        },
        ...LEAD_OPTIONS,
        "max-turns": {
          type: "string",
          description: "Max agentic turns (default: 40, 0 = unlimited)",
        },
        output: {
          type: "string",
          description: "Write the NDJSON trace to a file",
        },
        "agent-profiles": {
          type: "string",
          description: "Comma-separated participant profile names (optional)",
        },
        "agent-cwd": {
          type: "string",
          description: "Working directory shared by participants (default: .)",
        },
        "discussion-id": {
          type: "string",
          description:
            "Stable id for the threaded conversation; carried through traces for linking",
        },
        "resume-context": {
          type: "string",
          description: "JSON-serialized prior state for a resumed run",
        },
      },
    },
    {
      name: "output",
      args: [],
      argsUsage: "",
      handler: runOutputCommand,
      description:
        "Read NDJSON from stdin and emit a structured or readable form",
    },
    {
      name: "tee",
      args: ["output"],
      argsUsage: "[output.ndjson]",
      handler: runTeeCommand,
      description:
        "Stream readable text to stdout while saving raw NDJSON to a file",
    },
    {
      name: "callback",
      args: [],
      argsUsage: "",
      handler: runCallbackCommand,
      description:
        "Extract the terminal summary from an NDJSON trace and POST it to a callback URL",
      options: {
        "trace-file": {
          type: "string",
          description: "Path to the NDJSON trace file",
        },
        "callback-url": {
          type: "string",
          description: "URL to POST the summary to",
        },
        "correlation-id": {
          type: "string",
          description: "Correlation ID to include in the payload",
        },
        "run-url": {
          type: "string",
          description: "GitHub Actions run URL (optional)",
        },
        "discussion-id": {
          type: "string",
          description:
            "Discussion id (fallback when the trace lacks a meta event)",
        },
      },
    },
  ],
  globalOptions: {
    format: { type: "string", description: "Output format (json|text)" },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "fit-eval run --task-file=task.md --output=trace.ndjson",
    "fit-eval supervise --task-file=task.md --lead-profile=judge --agent-profile=coder --output=trace.ndjson",
    'fit-eval facilitate --task-file=task.md --lead-profile=lead --agent-profiles="security-engineer,technical-writer" --output=trace.ndjson',
    'fit-eval discuss --task-file=task.md --lead-profile=release-engineer --agent-profiles="staff-engineer,security-engineer" --discussion-id=GD_kw...',
    "fit-eval output --format=text < trace.ndjson",
  ],
  documentation: [
    {
      title: "Run an Eval",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/run-eval/index.md",
      description:
        "Author a judge profile, run an eval locally, wire it into CI, and inspect the resulting trace.",
    },
    {
      title: "Prove Agent Changes",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/index.md",
      description:
        "End-to-end workflow from dataset generation through evaluation to trace analysis, including multi-agent collaboration sessions.",
    },
    {
      title: "Analyze Traces",
      url: "https://www.forwardimpact.team/docs/libraries/prove-changes/trace-analysis/index.md",
      description:
        "Read the NDJSON traces produced by `fit-eval` with `fit-trace` — grounded-theory method and worked examples.",
    },
    {
      title: "Agent Teams",
      url: "https://www.forwardimpact.team/docs/products/agent-teams/index.md",
      description:
        "How to author the profiles consumed by --agent-profile, --lead-profile, and --agent-profiles.",
    },
  ],
};

const runtime = createDefaultRuntime();
const logger = createLogger("eval", runtime);

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

  const result = await cli.dispatch(parsed, { deps: { runtime } });
  const envelope = result ?? { ok: true };
  if (!envelope.ok && envelope.error) cli.error(envelope.error);
  runtime.proc.exit(envelope.ok ? 0 : (envelope.code ?? 1));
}

main().catch((error) => {
  logger.exception("main", error);
  createCli(definition, { runtime }).error(error.message);
  process.exit(1);
});
