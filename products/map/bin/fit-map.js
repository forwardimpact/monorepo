#!/usr/bin/env node

/**
 * fit-map CLI
 *
 * Map validation, index generation, export, and activity management
 * for Engineering Pathway data.
 */

import "@forwardimpact/libpreflight/node22";

import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "node:url";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { createProductConfig } from "@forwardimpact/libconfig";
import { findDataDir } from "../src/lib/data-dir.js";
import { dispatchSubstrate as _dispatchSubstrate } from "./dispatch-substrate.js";
import { dispatchAuth as _dispatchAuth } from "./dispatch-auth.js";
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

// The bin is the sole construction site for the injected runtime bag and the
// only caller of runtime.proc.exit (design Decision 4).
const runtime = createDefaultRuntime();
const summary = new SummaryRenderer({ process: runtime.proc });
const config = await createProductConfig("map");

const definition = {
  name: "fit-map",
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
      args: "<validate|push> [file]",
      description: "Validate or push people files",
    },
    {
      name: "activity",
      args: "<start|stop|status|migrate|transform|verify|seed|bundle-standard-data>",
      description: "Manage activity stack",
      options: { out: { type: "string", description: "bundle output path" } },
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
        "emit-env": {
          type: "string",
          description:
            "Append SUPABASE_URL= / SUPABASE_ANON_KEY= lines to this path after url-discovery (e.g. $GITHUB_ENV)",
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
      title: "Issue Service-Account Tokens",
      url: "https://www.forwardimpact.team/docs/products/issuing-service-account-tokens/index.md",
      description: "Mint long-lived Supabase JWTs for unattended agents.",
    },
  ],
};

const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

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
  runtime.proc.stdout.write(
    formatHeader(`Validating data in: ${dataDir}`) + "\n\n",
  );

  const { createDataLoader, createSchemaValidator } = await import(
    "../src/index.js"
  );

  const loader = createDataLoader(runtime);
  const validator = createSchemaValidator(runtime);

  const data = await loader.loadAllData(dataDir);
  const result = await validator.runFullValidation(dataDir, data);

  runtime.proc.stdout.write(formatValidationResults(result) + "\n");

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
  const dataRoot = runtime.finder.findData("data", homedir());
  return join(dataRoot, "knowledge");
}

/**
 * Export command — render every base entity to HTML microdata.
 */
async function runExport(dataDir, outputDir) {
  runtime.proc.stdout.write(
    formatHeader(`Exporting standard to: ${outputDir}`) + "\n\n",
  );

  const { createDataLoader, createExporter, createRenderer } = await import(
    "../src/index.js"
  );

  const loader = createDataLoader(runtime);
  const data = await loader.loadAllData(dataDir);

  const exporter = await createExporter({
    runtime,
    renderer: createRenderer(runtime),
  });
  const result = await exporter.exportAll({ data, outputDir });

  const counts = {};
  for (const path of result.written) {
    const segments = path.split("/");
    const type = segments[segments.length - 2];
    counts[type] = (counts[type] || 0) + 1;
  }

  runtime.proc.stdout.write(formatSuccess("Export complete") + "\n");
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
    runtime.proc.stderr.write("\n" + formatError("Errors:") + "\n");
    for (const err of result.errors) {
      runtime.proc.stderr.write(
        formatBullet(`${err.path}: ${err.error}`, 1) + "\n",
      );
    }
    return 1;
  }

  return 0;
}

/**
 * Generate index command
 */
async function runGenerateIndex(dataDir) {
  runtime.proc.stdout.write(
    formatHeader(`Generating index files in: ${dataDir}`) + "\n\n",
  );

  const { createIndexGenerator } = await import("../src/index.js");

  const generator = createIndexGenerator(runtime);
  const results = await generator.generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      runtime.proc.stdout.write(
        formatBullet(`${dir}/_index.yaml: ${files.error}`, 0) + "\n",
      );
    } else {
      runtime.proc.stdout.write(
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
      const dataDir = await findDataDir(values.data, runtime);
      return people.validate(filePath, dataDir, runtime);
    }
    case "push": {
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people push requires a file path");
        return 1;
      }
      const supabase = await mapClient();
      return people.push(filePath, supabase, runtime);
    }
    case "import": {
      runtime.proc.stderr.write(
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
      const dataDir = await findDataDir(values.data, runtime);
      return people.validate(filePath, dataDir, runtime);
    }
    default:
      cli.usageError(`unknown people subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function loadMapDataFor(values) {
  const dataDir = await findDataDir(values.data, runtime);
  const { createDataLoader } = await import("../src/index.js");
  const mapData = await createDataLoader(runtime).loadAllData(dataDir);
  return { dataDir, mapData };
}

async function dispatchActivity(subcommand, rest, values) {
  const activity = await import("../src/commands/activity.js");
  switch (subcommand) {
    case "start":
      return activity.start({ runtime });
    case "stop":
      return activity.stop({ runtime });
    case "status":
      return activity.status({ runtime });
    case "migrate":
      return activity.migrate({ runtime });
    case "transform": {
      const target = rest[0] ?? "all";
      let mapData;
      if (target === "all" || target === "evidence-artifact") {
        ({ mapData } = await loadMapDataFor(values));
      }
      return activity.transform(target, await mapClient(), runtime, {
        mapData,
      });
    }
    case "bundle-standard-data": {
      const { mapData } = await loadMapDataFor(values);
      const rel = "../supabase/functions/_shared/activity/standard-data.json";
      const outPath =
        values.out ?? fileURLToPath(new URL(rel, import.meta.url));
      return activity.bundleStandardData({ runtime, mapData, outPath });
    }
    case "verify":
      return activity.verify(await mapClient(), runtime);
    case "seed": {
      const { dataDir, mapData } = await loadMapDataFor(values);
      // findDataDir returns .../pathway; seed needs the parent data/ dir
      return activity.seed({
        data: dirname(dataDir),
        supabase: await mapClient(),
        runtime,
        mapData,
      });
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
        runtime,
      });
    default:
      cli.usageError(`unknown getdx subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchAuth(subcommand, _rest, values) {
  return _dispatchAuth(subcommand, _rest, values, {
    config,
    mapClient,
    cli,
    runtime,
  });
}

async function dispatchSubstrate(subcommand, _rest, values) {
  return _dispatchSubstrate(subcommand, _rest, values, {
    config,
    cli,
    runtime,
  });
}

/**
 * Main entry point
 */
async function main() {
  const parsed = cli.parse(runtime.proc.argv.slice(2));
  if (!parsed) runtime.proc.exit(0);

  const { values, positionals } = parsed;
  const [command, subcommand, ...rest] = positionals;

  if (!command) {
    cli.showHelp();
    runtime.proc.exit(0);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "init": {
        const { runInit } = await import("../src/commands/init.js");
        const result = await runInit(positionals[1], runtime);
        exitCode = result.ok ? 0 : (result.code ?? 1);
        break;
      }
      case "validate": {
        if (values.shacl) {
          const { runValidateShacl } = await import(
            "../src/commands/validate-shacl.js"
          );
          exitCode = await runValidateShacl(runtime);
        } else {
          const dataDir = await findDataDir(values.data, runtime);
          exitCode = await runValidate(dataDir);
        }
        break;
      }
      case "generate-index": {
        const dataDir = await findDataDir(values.data, runtime);
        exitCode = await runGenerateIndex(dataDir);
        break;
      }
      case "export": {
        const dataDir = await findDataDir(values.data, runtime);
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

    runtime.proc.exit(exitCode);
  } catch (error) {
    cli.error(error.message);
    runtime.proc.exit(1);
  }
}

main();
