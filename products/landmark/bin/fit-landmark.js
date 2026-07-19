#!/usr/bin/env node
/**
 * Landmark CLI
 *
 * Analysis and recommendation layer on top of Map activity data.
 *
 * Usage:
 *   npx fit-landmark <command> [options]
 */

import "@forwardimpact/libpreflight/node22";

import { createCli } from "@forwardimpact/libcli";
import { createProductConfig } from "@forwardimpact/libconfig";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { COMMANDS } from "../src/lib/commands-manifest.js";
import { floorPercentText } from "../src/lib/confidence-floor.js";
import { resolveDataDir } from "../src/lib/cli.js";
import { buildContext } from "../src/lib/context.js";
import { SupabaseUnavailableError } from "../src/lib/supabase.js";
import {
  resolveIdentity,
  IdentityUnresolvedError,
} from "../src/lib/identity.js";
import { formatResult } from "../src/formatters/index.js";

// Hidden manifest export consumed by `fit-map substrate stage`'s self-smoke.
// Placed before the top-level createProductConfig() await so introspection
// does not pay the libconfig load cost and is independent of the spawn cwd's
// .env. The branch must sit above the top-level await — if future
// contributors move createProductConfig earlier in this file, the
// products/landmark/test/lib/commands-verb.test.js runtime test fails.
if (process.argv[2] === "_commands") {
  const { SUBCOMMAND_EXPANSIONS, FLAT_SMOKE_OPTIONS } = await import(
    "../src/lib/commands-manifest.js"
  );
  // JSON.stringify drops handler function references — that's intentional:
  // the smoke only needs needsSupabase per entry, which serialises fine.
  process.stdout.write(
    JSON.stringify({
      commands: COMMANDS,
      subcommandExpansions: SUBCOMMAND_EXPANSIONS,
      flatSmokeOptions: FLAT_SMOKE_OPTIONS,
    }) + "\n",
  );
  process.exit(0);
}

const config = await createProductConfig("landmark", { token: undefined });

const definition = {
  name: "fit-landmark",
  description: "Landmark — analysis and recommendations on top of Map data.",
  commands: [
    { name: "org show", description: "Show full organization directory" },
    {
      name: "org team",
      description: "Show hierarchy under a manager",
      options: {
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    { name: "snapshot list", description: "List available snapshots" },
    {
      name: "snapshot show",
      description: "Show factor/driver scores for a snapshot",
      options: {
        snapshot: { type: "string", description: "Snapshot id" },
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    {
      name: "snapshot trend",
      description: "Track item trend across snapshots",
      options: {
        item: { type: "string", description: "Driver/item id for trend" },
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    {
      name: "snapshot compare",
      description: "Compare snapshot against benchmarks",
      options: {
        snapshot: { type: "string", description: "Snapshot id" },
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    {
      name: "evidence",
      description: "Show marker-linked evidence",
      options: {
        skill: { type: "string", description: "Filter by skill id" },
        email: { type: "string", description: "Filter by person email" },
      },
    },
    {
      name: "practice",
      description: "Show practice-pattern aggregates",
      options: {
        skill: { type: "string", description: "Filter by skill id" },
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    {
      name: "marker",
      args: "<skill>",
      description: "Show marker definitions for a skill",
      options: {
        level: { type: "string", description: "Filter by level" },
      },
    },
    {
      name: "health",
      description: "Show health view with driver scores and evidence",
      options: {
        manager: {
          type: "string",
          description:
            "Filter by manager email; resolves transitively, so a director " +
            "email rolls up every team beneath it across the department",
        },
        verbose: {
          type: "boolean",
          description:
            "Show every per-driver field including all percentile anchors",
        },
      },
    },
    {
      name: "readiness",
      description: "Show promotion readiness checklist",
      options: {
        email: { type: "string", description: "Filter by person email" },
        target: { type: "string", description: "Readiness target level" },
      },
    },
    {
      name: "timeline",
      description: "Show individual growth timeline",
      options: {
        email: { type: "string", description: "Filter by person email" },
        skill: { type: "string", description: "Filter by skill id" },
      },
    },
    {
      name: "coverage",
      description: "Show evidence coverage metrics",
      options: {
        email: { type: "string", description: "Filter by person email" },
      },
    },
    {
      name: "practiced",
      description: "Show evidenced vs derived capability",
      options: {
        manager: { type: "string", description: "Filter by manager email" },
      },
    },
    {
      name: "voice",
      description: "Surface engineer voice from GetDX comments",
      options: {
        manager: { type: "string", description: "Filter by manager email" },
        email: { type: "string", description: "Filter by person email" },
      },
    },
    {
      name: "sources",
      description: "List activity row classes retained about an engineer",
      options: {
        email: {
          type: "string",
          description: "Email to inventory sources for",
        },
      },
    },
    {
      name: "login",
      description: "Sign in via Supabase magic-link (browser or --otp)",
      options: {
        email: { type: "string", description: "Email to sign in as" },
        otp: {
          type: "boolean",
          description: "Skip the browser; prompt for the 6-digit code instead",
        },
      },
    },
    {
      name: "logout",
      description: "Delete the local credentials file",
    },
  ],
  globalOptions: {
    data: { type: "string", description: "Path to Map data directory" },
    format: {
      type: "string",
      default: "text",
      description: "Output format (text|json|markdown)",
    },
    help: { type: "boolean", short: "h", description: "Show help" },
    version: { type: "boolean", short: "v", description: "Show version" },
  },
  examples: [
    "fit-landmark org show",
    "fit-landmark snapshot list",
    "fit-landmark marker task-completion",
    "fit-landmark health --manager alice@example.com",
    "fit-landmark health --manager zeus@bionova.example",
    "fit-landmark sources --email self@example.com",
  ],
  documentation: [
    {
      title: "Landmark Overview",
      url: "https://www.forwardimpact.team/landmark/index.md",
      description: "Product overview, audience model, and key concepts.",
    },
    {
      title: "Getting Started: Landmark for Leaders",
      url: "https://www.forwardimpact.team/docs/getting-started/leaders/landmark/index.md",
      description: "From zero to your first engineering outcome measurement.",
    },
    {
      title: "Demonstrate Engineering Progress",
      url: "https://www.forwardimpact.team/docs/products/engineering-outcomes/index.md",
      description:
        "Show evidence of engineering progress without blaming individuals.",
    },
    {
      title: "Tell Whether Culture Investments Are Working",
      url: "https://www.forwardimpact.team/docs/products/engineering-outcomes/culture-investments/index.md",
      description: "Track initiative impact through outcome trends.",
    },
    {
      title: "Get Career Guidance Grounded in the Standard",
      url: "https://www.forwardimpact.team/docs/products/growth-areas/index.md",
      description: `Identify gaps and track progress toward the next level. Readiness, timeline, and coverage commands suppress verdicts and frame output as negative-evidence when coverage falls below ${floorPercentText()}.`,
    },
    {
      title: "Check Progress Toward Next Level",
      url: "https://www.forwardimpact.team/docs/products/growth-areas/check-progress/index.md",
      description: "See where you stand against level expectations.",
    },
    {
      title: "List Engineering Data Sources",
      url: "https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md",
      description:
        "List the activity rows retained about an engineer and their fall-off dates.",
    },
    {
      title: "Sign In to Landmark",
      url: "https://www.forwardimpact.team/docs/products/signing-in-to-landmark/index.md",
      description:
        "Sign in via Supabase magic-link so commands resolve your identity automatically.",
    },
  ],
};

async function main() {
  const runtime = createDefaultRuntime();
  const cli = createCli(definition, {
    runtime,
    packageJsonUrl: new URL("../package.json", import.meta.url),
  });
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
    const dataDir = resolveDataDir(values, runtime);
    let identity = null;
    if (entry.needsSupabase)
      identity = await resolveIdentity({ config, runtime });
    const ctx = await buildContext({
      dataDir,
      config,
      options: values,
      needsSupabase: entry.needsSupabase,
      identity,
      runtime,
    });

    const result = await entry.handler({
      args,
      options: values,
      config,
      identity,
      mapData: ctx.mapData,
      supabase: ctx.supabase,
      format: ctx.format,
      runtime,
      // login/logout prompt and print directly; give them a real stdin
      // (a Readable that readline can consume) plus the runtime stdout.
      io: { stdin: process.stdin, stdout: runtime.proc.stdout },
    });

    if (result.meta && command === "health") {
      result.meta.verbose = values.verbose === true;
    }

    const output = formatResult(command, result);
    process.stdout.write(output);

    if (result.meta?.warnings?.length > 0) {
      for (const w of result.meta.warnings) {
        process.stderr.write(`  warning: ${w}\n`);
      }
    }
  } catch (error) {
    exitWithError(cli, error);
  }
}

/** Print the error per its class contract and exit with the matching code. */
function exitWithError(cli, error) {
  if (error instanceof IdentityUnresolvedError) {
    cli.error(error.message);
    process.exit(4);
  }
  if (error instanceof SupabaseUnavailableError) {
    cli.error(error.message);
    process.exit(3);
  }
  cli.error(error.message);
  if (process.env.FIT_DEBUG) {
    process.stderr.write(error.stack + "\n");
  }
  process.exit(1);
}

main();
