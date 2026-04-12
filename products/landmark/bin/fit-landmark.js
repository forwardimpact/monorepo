#!/usr/bin/env node
/**
 * Landmark CLI
 *
 * Analysis and recommendation layer on top of Map activity data.
 *
 * Usage:
 *   npx fit-landmark <command> [options]
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCli } from "@forwardimpact/libcli";

import { runOrgCommand } from "../src/commands/org.js";
import { runSnapshotCommand } from "../src/commands/snapshot.js";
import { runMarkerCommand } from "../src/commands/marker.js";
import { runEvidenceCommand } from "../src/commands/evidence.js";
import { runReadinessCommand } from "../src/commands/readiness.js";
import { runTimelineCommand } from "../src/commands/timeline.js";
import { runCoverageCommand } from "../src/commands/coverage.js";
import { runPracticeCommand } from "../src/commands/practice.js";
import { runPracticedCommand } from "../src/commands/practiced.js";
import { runHealthCommand } from "../src/commands/health.js";
import { runVoiceCommand } from "../src/commands/voice.js";
import { runInitiativeCommand } from "../src/commands/initiative.js";
import { resolveDataDir } from "../src/lib/cli.js";
import { buildContext } from "../src/lib/context.js";
import { SupabaseUnavailableError } from "../src/lib/supabase.js";
import { formatResult } from "../src/formatters/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

const COMMANDS = {
  org: { handler: runOrgCommand, needsSupabase: true },
  snapshot: { handler: runSnapshotCommand, needsSupabase: true },
  marker: { handler: runMarkerCommand, needsSupabase: false },
  evidence: { handler: runEvidenceCommand, needsSupabase: true },
  readiness: { handler: runReadinessCommand, needsSupabase: true },
  timeline: { handler: runTimelineCommand, needsSupabase: true },
  coverage: { handler: runCoverageCommand, needsSupabase: true },
  practice: { handler: runPracticeCommand, needsSupabase: true },
  practiced: { handler: runPracticedCommand, needsSupabase: true },
  health: { handler: runHealthCommand, needsSupabase: true },
  voice: { handler: runVoiceCommand, needsSupabase: true },
  initiative: { handler: runInitiativeCommand, needsSupabase: true },
};

const definition = {
  name: "fit-landmark",
  version: VERSION,
  description: "Landmark — analysis and recommendations on top of Map data.",
  commands: [
    { name: "org show", description: "Show full organization directory" },
    {
      name: "org team",
      args: "--manager <email>",
      description: "Show hierarchy under a manager",
    },
    { name: "snapshot list", description: "List available snapshots" },
    {
      name: "snapshot show",
      args: "--snapshot <id> [--manager <email>]",
      description: "Show factor/driver scores for a snapshot",
    },
    {
      name: "snapshot trend",
      args: "--item <item_id> [--manager <email>]",
      description: "Track item trend across snapshots",
    },
    {
      name: "snapshot compare",
      args: "--snapshot <id> [--manager <email>]",
      description: "Compare snapshot against benchmarks",
    },
    {
      name: "evidence",
      args: "[--skill <id>] [--email <email>]",
      description: "Show marker-linked evidence",
    },
    {
      name: "practice",
      args: "[--skill <id>] [--manager <email>]",
      description: "Show practice-pattern aggregates",
    },
    {
      name: "marker",
      args: "<skill> [--level <level>]",
      description: "Show marker definitions for a skill",
    },
    {
      name: "health",
      args: "[--manager <email>]",
      description: "Show health view with driver scores and evidence",
    },
    {
      name: "readiness",
      args: "--email <email> [--target <level>]",
      description: "Show promotion readiness checklist",
    },
    {
      name: "timeline",
      args: "--email <email> [--skill <id>]",
      description: "Show individual growth timeline",
    },
    {
      name: "initiative list",
      args: "[--manager <email>]",
      description: "List active initiatives",
    },
    {
      name: "initiative show",
      args: "--id <id>",
      description: "Show initiative detail",
    },
    {
      name: "initiative impact",
      args: "[--manager <email>]",
      description: "Show initiative impact on scores",
    },
    {
      name: "coverage",
      args: "--email <email>",
      description: "Show evidence coverage metrics",
    },
    {
      name: "practiced",
      args: "--manager <email>",
      description: "Show evidenced vs derived capability",
    },
    {
      name: "voice",
      args: "--manager <email> | --email <email>",
      description: "Surface engineer voice from GetDX comments",
    },
  ],
  options: {
    data: { type: "string", description: "Path to Map data directory" },
    format: {
      type: "string",
      default: "text",
      description: "Output format (text|json|markdown)",
    },
    manager: { type: "string", description: "Filter by manager email" },
    email: { type: "string", description: "Filter by person email" },
    skill: { type: "string", description: "Filter by skill id" },
    level: { type: "string", description: "Target or filter level" },
    target: { type: "string", description: "Readiness target level" },
    snapshot: { type: "string", description: "Snapshot id" },
    item: { type: "string", description: "Driver/item id for trend" },
    id: { type: "string", description: "Entity id (initiative, etc.)" },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-landmark org show",
    "fit-landmark snapshot list",
    "fit-landmark marker task_completion",
    "fit-landmark health --manager alice@example.com",
  ],
};

async function main() {
  const cli = createCli(definition);
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, ...args] = positionals;

  if (!command) {
    cli.showHelp();
    process.exit(0);
  }

  const entry = COMMANDS[command];
  if (!entry) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  try {
    const dataDir = resolveDataDir(values);
    const ctx = await buildContext({
      dataDir,
      options: values,
      needsSupabase: entry.needsSupabase,
    });

    const result = await entry.handler({
      args,
      options: values,
      mapData: ctx.mapData,
      supabase: ctx.supabase,
      format: ctx.format,
    });

    const output = formatResult(command, result);
    process.stdout.write(output);

    if (result.meta?.warnings?.length > 0) {
      for (const w of result.meta.warnings) {
        process.stderr.write(`  warning: ${w}\n`);
      }
    }
  } catch (error) {
    if (error instanceof SupabaseUnavailableError) {
      cli.error(error.message);
      process.exit(3);
    }
    cli.error(error.message);
    process.exit(1);
  }
}

main();
