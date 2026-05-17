#!/usr/bin/env node

/**
 * fit-map CLI
 *
 * Map validation, index generation, export, and activity management
 * for Engineering Pathway data.
 */

import fs from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createProductConfig } from "@forwardimpact/libconfig";
import { findDataDir } from "../src/lib/data-dir.js";
import {
  createCli,
  SummaryRenderer,
  formatHeader,
  formatSubheader,
  formatSuccess,
  formatError,
  formatWarning,
  formatBullet,
} from "@forwardimpact/libcli";

const summary = new SummaryRenderer({ process });
const config = await createProductConfig("map");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// `bun build --compile` injects FIT_MAP_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_MAP_VERSION ||
  JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
    .version;

const definition = {
  name: "fit-map",
  version: VERSION,
  description: "Data validation and management for Engineering Pathway",
  commands: [
    {
      name: "init",
      description: "Create ./data/pathway/ with starter standard data",
    },
    {
      name: "validate",
      description: "Run validation (default: JSON schema)",
      options: {
        shacl: { type: "boolean", description: "SHACL schema validation" },
      },
    },
    { name: "generate-index", description: "Generate _index.yaml files" },
    {
      name: "export",
      description: "Render base entities to HTML microdata",
      options: {
        output: { type: "string", description: "Output directory for export" },
      },
    },
    {
      name: "people",
      args: "<validate|push|provision> [file]",
      description:
        "Validate or push people files, or provision auth.users from the roster",
    },
    {
      name: "activity",
      args: "<start|stop|status|migrate|transform|verify|seed>",
      description: "Manage activity stack",
    },
    {
      name: "getdx",
      args: "sync",
      description: "Extract + transform GetDX snapshots",
      options: {
        "base-url": { type: "string", description: "GetDX API base URL" },
      },
    },
    {
      name: "auth",
      args: "issue",
      description: "Issue a Supabase-shaped JWT for an existing roster row",
      options: {
        email: { type: "string", description: "Caller email to issue for" },
        ttl: {
          type: "string",
          description: "Token lifetime, e.g. 8760h (1y), 30d. Default 8760h.",
        },
      },
    },
    {
      name: "substrate stage",
      description:
        "Provision a Landmark substrate (init + stack + migrate + seed + provision + self-smoke)",
      options: {
        cwd: {
          type: "string",
          description: "Target dir for the init bootstrap (default: cwd)",
        },
      },
    },
    {
      name: "substrate roster",
      description:
        "List invariant-satisfying personas from the seeded substrate",
      options: {
        format: { type: "string", description: "Output format (text|json)" },
      },
    },
    {
      name: "substrate issue",
      description:
        "Atomically write .env (JWT) and .substrate.json (discovery vector) into a target dir",
      options: {
        email: { type: "string", description: "Persona email" },
        cwd: { type: "string", description: "Target dir for the atomic write" },
        ttl: {
          type: "string",
          description: "JWT TTL (e.g. 1h, 30d). Default 1h.",
        },
        stash: {
          type: "string",
          description:
            "Optional second path to write the bare JWT to (workflow-private; not for external operators)",
        },
      },
    },
  ],
  globalOptions: {
    data: { type: "string", description: "Path to data directory" },
    json: { type: "boolean", description: "Output as JSON" },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    "fit-map init",
    "fit-map validate",
    "fit-map validate --shacl",
    "fit-map people validate ./org/people.yaml",
    "fit-map activity start",
  ],
  documentation: [
    {
      title: "Map Overview",
      url: "https://www.forwardimpact.team/map/index.md",
      description: "Product overview, audience model, and key concepts.",
    },
    {
      title: "Getting Started: Map for Leaders",
      url: "https://www.forwardimpact.team/docs/getting-started/leaders/map/index.md",
      description: "From zero to a validated engineering standard.",
    },
    {
      title: "Authoring Agent-Aligned Engineering Standards",
      url: "https://www.forwardimpact.team/docs/products/authoring-standards/index.md",
      description:
        "End-to-end guide to defining your engineering standard in YAML.",
    },
    {
      title: "Validate and Update the Standard",
      url: "https://www.forwardimpact.team/docs/products/authoring-standards/update-standard/index.md",
      description: "Run validation, interpret errors, and update safely.",
    },
    {
      title: "Define a New Role",
      url: "https://www.forwardimpact.team/docs/products/authoring-standards/define-role/index.md",
      description: "Add a discipline, track, or capability to the standard.",
    },
    {
      title: "YAML Schema Reference",
      url: "https://www.forwardimpact.team/docs/reference/yaml-schema/index.md",
      description: "File format reference for every entity type.",
    },
    {
      title: "Provision Engineer Auth Users",
      url: "https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md",
      description:
        "Reconcile auth.users against the roster so identity-derived RLS works.",
    },
    {
      title: "Issue Service-Account Tokens",
      url: "https://www.forwardimpact.team/docs/products/issuing-service-account-tokens/index.md",
      description: "Mint long-lived Supabase JWTs for unattended agents.",
    },
  ],
};

const cli = createCli(definition);

/**
 * Format validation results for display using libcli helpers.
 * @param {{valid: boolean, errors: Array, warnings?: Array}} result
 * @returns {string}
 */
function formatValidationResults(result) {
  const lines = [];

  if (result.valid) {
    lines.push(formatSuccess("Validation passed"));
  } else {
    lines.push(formatError("Validation failed"));
    lines.push("");
    lines.push(formatSubheader("Errors"));
    for (const error of result.errors) {
      const path = error.path ? ` (${error.path})` : "";
      lines.push(formatBullet(`${error.type}: ${error.message}${path}`, 0));
    }
  }

  if (result.warnings?.length > 0) {
    lines.push("");
    lines.push(formatSubheader("Warnings"));
    for (const warning of result.warnings) {
      const path = warning.path ? ` (${warning.path})` : "";
      lines.push(formatBullet(`${warning.type}: ${warning.message}${path}`, 0));
    }
  }

  return lines.join("\n");
}

/**
 * Validate command
 */
async function runValidate(dataDir) {
  process.stdout.write(formatHeader(`Validating data in: ${dataDir}`) + "\n\n");

  const { createDataLoader, createSchemaValidator } = await import(
    "../src/index.js"
  );

  const loader = createDataLoader();
  const validator = createSchemaValidator();

  const data = await loader.loadAllData(dataDir);
  const result = await validator.runFullValidation(dataDir, data);

  process.stdout.write(formatValidationResults(result) + "\n");

  summary.render({
    title: formatHeader("Data Summary"),
    ok: result.valid,
    items: [
      { label: "Skills", description: String(data.skills?.length || 0) },
      {
        label: "Behaviours",
        description: String(data.behaviours?.length || 0),
      },
      {
        label: "Disciplines",
        description: String(data.disciplines?.length || 0),
      },
      { label: "Tracks", description: String(data.tracks?.length || 0) },
      { label: "Levels", description: String(data.levels?.length || 0) },
      { label: "Drivers", description: String(data.drivers?.length || 0) },
    ],
  });

  return result.valid ? 0 : 1;
}

/**
 * Resolve the output directory for `fit-map export`.
 * @param {string|undefined} providedPath
 * @returns {Promise<string>}
 */
async function findOutputDir(providedPath) {
  if (providedPath) return resolve(providedPath);
  const logger = createLogger("map");
  const finder = new Finder(fs, logger, process);
  const dataRoot = finder.findData("data", homedir());
  return join(dataRoot, "knowledge");
}

/**
 * Export command — render every base entity to HTML microdata.
 */
async function runExport(dataDir, outputDir) {
  process.stdout.write(
    formatHeader(`Exporting standard to: ${outputDir}`) + "\n\n",
  );

  const { createDataLoader, createExporter, createRenderer } = await import(
    "../src/index.js"
  );

  const loader = createDataLoader();
  const data = await loader.loadAllData(dataDir);

  const exporter = await createExporter({ renderer: createRenderer() });
  const result = await exporter.exportAll({ data, outputDir });

  const counts = {};
  for (const path of result.written) {
    const segments = path.split("/");
    const type = segments[segments.length - 2];
    counts[type] = (counts[type] || 0) + 1;
  }

  process.stdout.write(formatSuccess("Export complete") + "\n");
  summary.render({
    title: formatSubheader("By type"),
    ok: result.errors.length === 0,
    items: [
      ...Object.entries(counts)
        .sort()
        .map(([type, count]) => ({
          label: type,
          description: String(count),
        })),
      { label: "total", description: String(result.written.length) },
    ],
  });

  if (result.errors.length > 0) {
    process.stderr.write("\n" + formatError("Errors:") + "\n");
    for (const err of result.errors) {
      process.stderr.write(formatBullet(`${err.path}: ${err.error}`, 1) + "\n");
    }
    return 1;
  }

  return 0;
}

/**
 * Generate index command
 */
async function runGenerateIndex(dataDir) {
  process.stdout.write(
    formatHeader(`Generating index files in: ${dataDir}`) + "\n\n",
  );

  const { createIndexGenerator } = await import("../src/index.js");

  const generator = createIndexGenerator();
  const results = await generator.generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      process.stdout.write(
        formatBullet(`${dir}/_index.yaml: ${files.error}`, 0) + "\n",
      );
    } else {
      process.stdout.write(
        formatBullet(`${dir}/_index.yaml (${files.length} files)`, 0) + "\n",
      );
    }
  }

  return 0;
}

// ── Dispatchers ──────────────────────────────────────────────────────────────

async function mapClient() {
  const { createMapClient } = await import("../src/lib/client.js");
  return createMapClient({ config });
}

async function dispatchPeople(subcommand, rest, values) {
  const people = await import("../src/commands/people.js");
  switch (subcommand) {
    case "validate": {
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people validate requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    case "push": {
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people push requires a file path");
        return 1;
      }
      const supabase = await mapClient();
      return people.push(filePath, supabase);
    }
    case "provision": {
      const supabase = await mapClient();
      const { runProvisionCommand } = await import(
        "../src/commands/people-provision.js"
      );
      await runProvisionCommand({ supabase });
      return 0;
    }
    case "import": {
      process.stderr.write(
        formatWarning(
          "`fit-map people import` is deprecated. Use " +
            "`fit-map people validate` to validate locally or " +
            "`fit-map people push` to push to the database.",
        ) + "\n",
      );
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people import requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    default:
      cli.usageError(`unknown people subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchActivity(subcommand, rest, values) {
  const activity = await import("../src/commands/activity.js");
  switch (subcommand) {
    case "start":
      return activity.start();
    case "stop":
      return activity.stop();
    case "status":
      return activity.status();
    case "migrate":
      return activity.migrate();
    case "transform":
      return activity.transform(rest[0] ?? "all", await mapClient());
    case "verify":
      return activity.verify(await mapClient());
    case "seed": {
      const dataDir = await findDataDir(values.data);
      // findDataDir returns .../pathway; seed needs the parent data/ dir
      const data = dirname(dataDir);
      return activity.seed({ data, supabase: await mapClient() });
    }
    default:
      cli.usageError(`unknown activity subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchGetdx(subcommand, rest, values) {
  const getdx = await import("../src/commands/getdx.js");
  switch (subcommand) {
    case "sync":
      return getdx.sync(await mapClient(), {
        baseUrl: values["base-url"],
      });
    default:
      cli.usageError(`unknown getdx subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchAuth(subcommand, _rest, values) {
  switch (subcommand) {
    case "issue": {
      const supabase = await mapClient();
      const { runAuthIssueCommand } = await import(
        "../src/commands/auth-issue.js"
      );
      await runAuthIssueCommand({
        supabase,
        config,
        options: { email: values.email, ttl: values.ttl },
      });
      return 0;
    }
    default:
      cli.usageError(`unknown auth subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchSubstrate(subcommand, _rest, values) {
  switch (subcommand) {
    case "stage": {
      const { runStageCommand } = await import(
        "../src/commands/substrate-stage.js"
      );
      return runStageCommand({ config, target: values.cwd });
    }
    case "roster": {
      const supabase = await mapClient();
      const { runRosterCommand } = await import(
        "../src/commands/substrate-roster.js"
      );
      return runRosterCommand({
        supabase,
        options: { format: values.format },
      });
    }
    case "issue": {
      const supabase = await mapClient();
      const { runSubstrateIssueCommand } = await import(
        "../src/commands/substrate-issue.js"
      );
      return runSubstrateIssueCommand({
        supabase,
        config,
        options: {
          email: values.email,
          cwd: values.cwd,
          ttl: values.ttl,
          stash: values.stash,
        },
      });
    }
    default:
      cli.usageError(`unknown substrate subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

/**
 * Main entry point
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, subcommand, ...rest] = positionals;

  if (!command) {
    cli.showHelp();
    process.exit(0);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "init": {
        const { runInit } = await import("../src/commands/init.js");
        await runInit(positionals[1]);
        exitCode = 0;
        break;
      }
      case "validate": {
        if (values.shacl) {
          const { runValidateShacl } = await import(
            "../src/commands/validate-shacl.js"
          );
          exitCode = await runValidateShacl();
        } else {
          const dataDir = await findDataDir(values.data);
          exitCode = await runValidate(dataDir);
        }
        break;
      }
      case "generate-index": {
        const dataDir = await findDataDir(values.data);
        exitCode = await runGenerateIndex(dataDir);
        break;
      }
      case "export": {
        const dataDir = await findDataDir(values.data);
        const outputDir = await findOutputDir(values.output);
        exitCode = await runExport(dataDir, outputDir);
        break;
      }
      case "people":
        exitCode = await dispatchPeople(subcommand, rest, values);
        break;
      case "activity":
        exitCode = await dispatchActivity(subcommand, rest, values);
        break;
      case "getdx":
        exitCode = await dispatchGetdx(subcommand, rest, values);
        break;
      case "auth":
        exitCode = await dispatchAuth(subcommand, rest, values);
        break;
      case "substrate":
        exitCode = await dispatchSubstrate(subcommand, rest, values);
        break;
      default:
        cli.usageError(`unknown command "${command}"`);
        exitCode = 2;
    }

    process.exit(exitCode);
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}

main();
