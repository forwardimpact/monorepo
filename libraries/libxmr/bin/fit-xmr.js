#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

import { readFileSync } from "node:fs";
import { createCli } from "@forwardimpact/libcli";

import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { runListCommand } from "../src/commands/list.js";
import { runValidateCommand } from "../src/commands/validate.js";
import { runChartCommand } from "../src/commands/chart.js";
import { runSummarizeCommand } from "../src/commands/summarize.js";
import { runRecordCommand } from "../src/commands/record.js";

// `bun build --compile` injects FIT_XMR_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_XMR_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-xmr",
  version: VERSION,
  description: "Wheeler/Vacanti XmR control charts for time-series CSV metrics",
  commands: [
    {
      name: "analyze",
      args: "<csv-path>",
      description:
        "Full XmR control chart report — chart, limits, signals, classification",
      options: {
        metric: {
          type: "string",
          short: "m",
          description: "Filter to a single metric by name",
        },
      },
    },
    {
      name: "chart",
      args: "<csv-path>",
      description:
        "Render the 14-line Wheeler/Vacanti XmR chart for a single metric",
      options: {
        metric: {
          type: "string",
          short: "m",
          description:
            "Metric name (optional when the CSV carries exactly one metric)",
        },
      },
    },
    {
      name: "list",
      args: "<csv-path>",
      description: "List metrics with counts and date ranges",
    },
    {
      name: "validate",
      args: "<csv-path>",
      description: "Validate CSV against the metrics schema",
    },
    {
      name: "summarize",
      args: "<csv-path>",
      description:
        "Compact markdown table of XmR stats and classification per metric",
      options: {
        metric: {
          type: "string",
          short: "m",
          description: "Filter to a single metric by name",
        },
      },
    },
    {
      name: "record",
      description:
        "Append a metric row to the skill's CSV and print a one-line XmR summary",
      options: {
        skill: {
          type: "string",
          description: "Skill name (falls back to LIBEVAL_SKILL env var)",
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
        date: {
          type: "string",
          description: "ISO date (default: today)",
        },
        "wiki-root": {
          type: "string",
          description: "Override wiki root directory (default: auto-detected)",
        },
      },
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

const cli = createCli(definition);

const COMMANDS = {
  analyze: runAnalyzeCommand,
  chart: runChartCommand,
  list: runListCommand,
  validate: runValidateCommand,
  summarize: runSummarizeCommand,
  record: runRecordCommand,
};

function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;

  if (positionals.length === 0) {
    cli.showHelp();
    process.exit(0);
  }

  const [command, ...args] = positionals;
  const handler = COMMANDS[command];

  if (!handler) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  handler(values, args, cli);
}

main();
