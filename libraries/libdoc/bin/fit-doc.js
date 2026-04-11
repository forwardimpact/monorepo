#!/usr/bin/env node
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
import { DocsBuilder, DocsServer } from "../index.js";
import { parseFrontMatter } from "../frontmatter.js";

const { version: VERSION } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

const definition = {
  name: "fit-doc",
  version: VERSION,
  description: "Build and serve documentation sites from markdown",
  commands: [
    {
      name: "build",
      description: "Build documentation site from markdown files",
    },
    {
      name: "serve",
      description: "Build and serve documentation with optional watch mode",
    },
  ],
  options: {
    src: {
      type: "string",
      default: "website",
      description: "Source directory (default: website)",
    },
    out: {
      type: "string",
      default: "dist",
      description: "Output directory (default: dist)",
    },
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
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: ["fit-doc build", "fit-doc serve --watch --port 8080"],
};

const cli = createCli(definition);
const logger = createLogger("doc");

/**
 * @param {import("../builder.js").DocsBuilder} builder
 * @param {string} docsDir
 * @param {string} distDir
 * @param {string} [baseUrl]
 */
async function runBuild(builder, docsDir, distDir, baseUrl) {
  if (!fs.existsSync(docsDir)) {
    cli.error(`source directory not found: ${docsDir}`);
    process.exit(1);
  }

  await builder.build(docsDir, distDir, baseUrl);
}

/**
 * @param {import("../builder.js").DocsBuilder} builder
 * @param {import("../server.js").DocsServer} server
 * @param {string} docsDir
 * @param {string} distDir
 * @param {{ port: number, watch: boolean, baseUrl: string }} options
 */
async function runServe(builder, server, docsDir, distDir, options) {
  if (!fs.existsSync(docsDir)) {
    cli.error(`source directory not found: ${docsDir}`);
    process.exit(1);
  }

  await builder.build(docsDir, distDir, options.baseUrl);

  if (options.watch) {
    server.watch(docsDir, distDir);
  }

  server.serve(distDir, { port: options.port, hostname: "0.0.0.0" });
  process.stdout.write(formatBullet("Press Ctrl+C to stop") + "\n");
}

async function main() {
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
  const docsDir = path.join(workingDir, values.src);
  const distDir = path.join(workingDir, values.out);
  const baseUrl = values["base-url"];

  const builder = new DocsBuilder(
    fs,
    path,
    marked,
    parseFrontMatter,
    mustache.render,
    prettier,
  );

  try {
    if (command === "build") {
      await runBuild(builder, docsDir, distDir, baseUrl);
    } else {
      const server = new DocsServer(fs, Hono, serve, builder);
      await runServe(builder, server, docsDir, distDir, {
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
