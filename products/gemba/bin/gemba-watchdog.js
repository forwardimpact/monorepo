#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";

import { runAssessCommand } from "@forwardimpact/libwatchdog/commands/assess.js";
import { runEngageCommand } from "@forwardimpact/libwatchdog/commands/engage.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "gemba-watchdog",
  description:
    "Count repository activity over a window and engage an operator latch on a breach",
  commands: [
    {
      name: "assess",
      description:
        "Count every activity signal over the window and report the verdict",
      options: {
        repo: {
          type: "string",
          description: "owner/repo (falls back to $GITHUB_REPOSITORY)",
        },
        "default-branch": {
          type: "string",
          description: "Branch the commit counter reads (default: main)",
        },
        threshold: {
          type: "string",
          description: "Breach threshold, one number for every counter",
        },
        "window-hours": {
          type: "string",
          description: "Window the counters cover, in hours",
        },
        "killswitch-value": {
          type: "string",
          description: "The caller's own latch reading, for the summary only",
        },
      },
      handler: runAssessCommand,
    },
    {
      name: "engage",
      description:
        "Write the latch variable when the policy allows it. It never clears it",
      options: {
        repo: {
          type: "string",
          description: "owner/repo (falls back to $GITHUB_REPOSITORY)",
        },
        variable: {
          type: "string",
          description: "Name of the latch variable to write",
        },
        reason: {
          type: "string",
          description: "The encoded reason. An empty value is refused",
        },
        "window-hours": {
          type: "string",
          description: "Window the resume rule measures, in hours",
        },
        "dry-run": {
          type: "boolean",
          description: "Read both latch scopes and write nothing",
        },
      },
      handler: runEngageCommand,
    },
  ],
  globalOptions: {
    format: {
      type: "string",
      description: "Command output format: text (default) or json",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: {
      type: "boolean",
      description:
        "Render the --help output itself as JSON (separate from --format)",
    },
  },
  examples: [
    "gemba-watchdog assess --threshold 32 --window-hours 2",
    "gemba-watchdog assess --threshold 32 --window-hours 2 --format json",
    'gemba-watchdog engage --variable MY_KILLSWITCH --reason "$REASON" --window-hours 2',
    "gemba-watchdog engage --variable MY_KILLSWITCH --reason watchdog --window-hours 2 --dry-run",
  ],
  documentation: [
    {
      title: "Guard an Agent Team's Activity",
      url: "https://www.gemba.team/docs/guard-activity/index.md",
      description:
        "The four counters, the threshold and window, the latch contract, the clearing rule, the CI wiring, and the exit codes.",
    },
  ],
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

async function main() {
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) return runtime.proc.exit(0);

  const { positionals } = parsed;

  if (positionals.length === 0) {
    cli.showHelp();
    return runtime.proc.exit(0);
  }

  const result = await cli.dispatch(parsed, { deps: { runtime } });

  const envelope = result ?? { ok: true };
  if (!envelope.ok && envelope.error) cli.usageError(envelope.error);
  runtime.proc.exit(envelope.ok ? 0 : (envelope.code ?? 1));
}

main();
