#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { marked } from "marked";
import mustache from "mustache";
import prettier from "prettier";

import { createCli, formatBullet } from "@forwardimpact/libcli";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { PagesBuilder, PagesServer } from "../src/index.js";
import { parseFrontMatter } from "../src/frontmatter.js";

// `bun build --compile` injects FIT_DOC_VERSION via --define, eliminating
// the readFileSync branch in the compiled binary (which would ENOENT against
// the bunfs virtual mount). Source execution falls through to package.json.
const VERSION =
  process.env.FIT_DOC_VERSION ||
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
    .version;

const definition = {
  name: "fit-doc",
  version: VERSION,
  description: "Build and serve documentation sites from markdown",
  commands: [
    {
      name: "build",
      description: "Build documentation site from markdown files",
      options: {
        "base-url": {
          type: "string",
          description: "Base URL for sitemap, canonical links, and llms.txt",
        },
      },
    },
    {
      name: "serve",
      description: "Build and serve documentation with optional watch mode",
      options: {
        "base-url": {
          type: "string",
          description: "Base URL for sitemap, canonical links, and llms.txt",
        },
        port: {
          type: "string",
          short: "p",
          description: "Port to serve on (default: 3000)",
        },
        watch: {
          type: "boolean",
          short: "w",
          description: "Watch for changes and rebuild",
        },
      },
    },
  ],
  globalOptions: {
    src: {
      type: "string",
      default: "public",
      description: "Source directory (default: public)",
    },
    out: {
      type: "string",
      default: "dist",
      description: "Output directory (default: dist)",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-doc build", "fit-doc serve --watch --port 8080"],
};

const cli = createCli(definition);
const logger = createLogger("doc");

/**
 * @param {import("../builder.js").PagesBuilder} builder
 * @param {string} pagesDir
 * @param {string} distDir
 * @param {string} [baseUrl]
 */
function runPreBuildHook(pagesDir) {
  const justfilePath = path.join(pagesDir, "justfile");
  if (!fs.existsSync(justfilePath)) return;

  logger.info("Running pre-build hook (justfile)...");

  try {
    execFileSync("just", ["build"], { cwd: pagesDir, stdio: "pipe" });
    logger.info("  ✓ pre-build hook complete");
  } catch (err) {
    if (err.code === "ENOENT") {
      logger.warn("  ⚠ just not found — skipping pre-build hook");
      return;
    }
    throw new Error(
      `Pre-build hook failed: ${err.stderr?.toString().trim() || err.message}`,
      { cause: err },
    );
  }
}

async function runBuild(builder, pagesDir, distDir, baseUrl) {
  if (!fs.existsSync(pagesDir)) {
    cli.error(`source directory not found: ${pagesDir}`);
    process.exit(1);
  }

  runPreBuildHook(pagesDir);
  await builder.build(pagesDir, distDir, baseUrl);
}

/**
 * @param {import("../builder.js").PagesBuilder} builder
 * @param {import("../server.js").PagesServer} server
 * @param {string} pagesDir
 * @param {string} distDir
 * @param {{ port: number, watch: boolean, baseUrl: string }} options
 */
async function runServe(builder, server, pagesDir, distDir, options) {
  if (!fs.existsSync(pagesDir)) {
    cli.error(`source directory not found: ${pagesDir}`);
    process.exit(1);
  }

  runPreBuildHook(pagesDir);
  await builder.build(pagesDir, distDir, options.baseUrl);

  if (options.watch) {
    server.watch(pagesDir, distDir);
  }

  server.serve(distDir, { port: options.port, hostname: "0.0.0.0" });
  process.stdout.write(formatBullet("Press Ctrl+C to stop") + "\n");
}

async function main() {
  const runtime = createDefaultRuntime();

  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const command = positionals[0];

  if (!command) {
    cli.usageError("no command specified (use build or serve)");
    process.exit(2);
  }

  if (!["build", "serve"].includes(command)) {
    cli.usageError(`unknown command "${command}"`);
    process.exit(2);
  }

  const workingDir = process.env.INIT_CWD || process.cwd();
  const pagesDir = path.resolve(workingDir, values.src);
  const distDir = path.resolve(workingDir, values.out);
  const baseUrl = values["base-url"];

  const builder = new PagesBuilder(
    fs,
    path,
    marked,
    parseFrontMatter,
    mustache.render,
    prettier,
  );

  try {
    if (command === "build") {
      await runBuild(builder, pagesDir, distDir, baseUrl);
    } else {
      const server = new PagesServer(fs, Hono, serve, builder, { runtime });
      await runServe(builder, server, pagesDir, distDir, {
        port: parseInt(values.port || "3000", 10),
        watch: values.watch,
        baseUrl,
      });
    }
  } catch (err) {
    logger.exception("main", err);
    cli.error(err.message);
    process.exit(1);
  }
}

main();
