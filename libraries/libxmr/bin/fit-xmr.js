#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createCli } from "@forwardimpact/libcli";

import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { runListCommand } from "../src/commands/list.js";
import { runValidateCommand } from "../src/commands/validate.js";
import { runChartCommand } from "../src/commands/chart.js";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { runRecordCommand } from "../src/commands/record.js";

const runtime = createDefaultRuntime();

const definition = {
  name: "fit-xmr",
  description: "Wheeler/Vacanti XmR control charts for time-series CSV metrics",
  commands: [
    {
      name: "analyze",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description:
        "Full XmR control chart report — chart, limits, signals, classification",
      options: {
        metric: {
          type: "string",
          short: "m",
          description: "Filter to a single metric by name",
        },
        "event-type": {
          type: "string",
          description:
            "Filter rows by event_type machine name; use '*' for all rows",
        },
        "prior-read": {
          type: "string",
          description:
            "Prior-read anchor date (YYYY-MM-DD) — stamps each fired signal with recomputation-revealed or new-point provenance",
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
        "event-type": {
          type: "string",
          description:
            "Filter rows by event_type machine name; use '*' for all rows",
        },
      },
      handler: runChartCommand,
    },
    {
      name: "list",
      args: ["csv-path"],
      argsUsage: "<csv-path>",
      description: "List metrics with counts and date ranges",
      options: {
        "event-type": {
          type: "string",
          description:
            "Filter rows by event_type machine name; use '*' for all rows",
        },
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
        "event-type": {
          type: "string",
          description:
            "Filter rows by event_type machine name; use '*' for all rows",
        },
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
            "Workflow machine name; falls back to $GITHUB_WORKFLOW_REF basename",
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
    "fit-xmr analyze wiki/metrics/kata-security-audit/2026.csv",
    "fit-xmr analyze wiki/metrics/kata-security-audit/2026.csv --metric findings_count",
    "fit-xmr analyze wiki/metrics/kata-security-audit/2026.csv --format json",
    "fit-xmr chart wiki/metrics/kata-security-audit/2026.csv --metric findings_count",
    "fit-xmr chart wiki/metrics/kata-security-audit/2026.csv --metric findings_count --ascii",
    "fit-xmr list wiki/metrics/kata-security-audit/2026.csv",
    "fit-xmr validate wiki/metrics/kata-security-audit/2026.csv",
    "fit-xmr summarize wiki/metrics/kata-security-audit/2026.csv",
    "fit-xmr summarize wiki/metrics/kata-security-audit/2026.csv --format json",
    "fit-xmr record --skill kata-product-issue --metric issues_triaged --value 3",
    "fit-xmr analyze wiki/metrics/staff-engineer/2026.csv --event-type kata-shift",
    "fit-xmr record --skill kata-spec --metric specs_drafted --value 1 --event-type kata-dispatch",
  ],
  documentation: [
    {
      title: "Operate a Predictable Agent Team",
      url: "https://www.forwardimpact.team/docs/libraries/predictable-team/index.md",
      description:
        "End-to-end guide to wiki memory, XmR charts, and team coordination.",
    },
    {
      title: "Chart a Metric and Check Variation",
      url: "https://www.forwardimpact.team/docs/libraries/predictable-team/xmr-analysis/index.md",
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
