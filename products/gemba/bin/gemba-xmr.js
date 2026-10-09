#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";

import { runAnalyzeCommand } from "@forwardimpact/libxmr/commands/analyze.js";
import { runListCommand } from "@forwardimpact/libxmr/commands/list.js";
import { runValidateCommand } from "@forwardimpact/libxmr/commands/validate.js";
import { runChartCommand } from "@forwardimpact/libxmr/commands/chart.js";
import { runSummarizeCommand } from "@forwardimpact/libxmr/commands/summarize.js";
import { runRecordCommand } from "@forwardimpact/libxmr/commands/record.js";

const runtime = createDefaultRuntime();

// One option object for the four read commands, so the rule reads the same
// on each: the slice is the caller's, else the file's sole value.
const readEventTypeOpt = {
  "event-type": {
    type: "string",
    description:
      "Slice to read: an event_type value, or '*' for all rows. Without it, the file's sole value is read; a file with several values needs the flag",
  },
};

const definition = {
  name: "gemba-xmr",
  description: "Wheeler/Vacanti XmR control charts for time-series CSV metrics",
  commands: [
    {
      name: "analyze",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description:
        "Full XmR control-chart report: chart, limits, signals, classification",
      options: {
        metric: {
          type: "string",
          short: "m",
          description: "Filter to a single metric by name",
        },
        ...readEventTypeOpt,
        "prior-read": {
          type: "string",
          description:
            "Prior-read anchor date (YYYY-MM-DD). The report stamps each fired signal with recomputation-revealed or new-point provenance",
        },
        route: {
          type: "string",
          description: "Partition to rows whose recorded route_taken matches",
        },
        "routes-eligible-includes": {
          type: "string",
          description:
            "Partition to rows whose routes_eligible set includes this id",
        },
      },
      handler: runAnalyzeCommand,
    },
    {
      name: "chart",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description:
        "Render the 14-line Wheeler/Vacanti XmR chart for a single metric",
      options: {
        metric: {
          type: "string",
          short: "m",
          description:
            "Metric name (optional when the CSV carries exactly one metric)",
        },
        ...readEventTypeOpt,
      },
      handler: runChartCommand,
    },
    {
      name: "list",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description: "List metrics with counts and date ranges",
      options: {
        ...readEventTypeOpt,
      },
      handler: runListCommand,
    },
    {
      name: "validate",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description: "Validate CSV against the metrics schema",
      handler: runValidateCommand,
    },
    {
      name: "summarize",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description:
        "Compact markdown table of XmR stats and classification per metric",
      options: {
        metric: {
          type: "string",
          short: "m",
          description: "Filter to a single metric by name",
        },
        ...readEventTypeOpt,
      },
      handler: runSummarizeCommand,
    },
    {
      name: "record",
      description:
        "Append a metric row to the skill's CSV and print a one-line XmR summary",
      options: {
        skill: {
          type: "string",
          description: "Skill name (falls back to LIBHARNESS_SKILL env var)",
        },
        metric: {
          type: "string",
          short: "m",
          description: "Metric name",
        },
        value: {
          type: "string",
          description: "Numeric value to record",
        },
        unit: {
          type: "string",
          description: "Unit of measurement (default: count)",
        },
        run: {
          type: "string",
          description: "Run identifier (optional)",
        },
        note: {
          type: "string",
          description: "Contextual note (optional)",
        },
        route: {
          type: "string",
          description:
            "Route taken (required for route-bearing metrics, e.g. implementations_shipped)",
        },
        "routes-eligible": {
          type: "string",
          description:
            "Comma-separated route ids that were eligible-but-not-taken",
        },
        "event-type": {
          type: "string",
          description:
            "Stream the row belongs to (default: the host workflow's filename from $GITHUB_WORKFLOW_REF, else the reserved value interactive)",
        },
        date: {
          type: "string",
          description: "ISO date (default: today)",
        },
        "wiki-root": {
          type: "string",
          description: "Override wiki root directory (default: auto-detected)",
        },
      },
      handler: runRecordCommand,
    },
  ],
  globalOptions: {
    format: {
      type: "string",
      description:
        "Command output format: text (default) or json. Charts are text-only.",
    },
    ascii: {
      type: "boolean",
      description: "Render charts with ASCII glyphs instead of Unicode",
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
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type nightly-review",
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count",
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type '*' --format json",
    "gemba-xmr chart wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count",
    "gemba-xmr chart wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count --ascii",
    "gemba-xmr list wiki/metrics/code-review/2026.csv --event-type '*'",
    "gemba-xmr validate wiki/metrics/code-review/2026.csv",
    "gemba-xmr summarize wiki/metrics/code-review/2026.csv --event-type nightly-review",
    "gemba-xmr summarize wiki/metrics/code-review/2026.csv --event-type nightly-review --format json",
    "gemba-xmr record --skill code-review --metric findings_count --value 3",
    "gemba-xmr record --skill code-review --metric findings_count --value 3 --event-type nightly-review",
  ],
  documentation: [
    {
      title: "Operate a Predictable Agent Team",
      url: "https://www.gemba.team/docs/predictable-team/index.md",
      description:
        "End-to-end guide to wiki memory, XmR charts, and team coordination.",
    },
    {
      title: "Chart a Metric and Check Variation",
      url: "https://www.gemba.team/docs/predictable-team/xmr-analysis/index.md",
      description:
        "CSV schema, the three detection rules, the 14-line chart, and how to read the report.",
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
