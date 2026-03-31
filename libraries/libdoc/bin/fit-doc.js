#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { marked } from "marked";
import mustache from "mustache";
import prettier from "prettier";

import { DocsBuilder, DocsServer } from "../index.js";
import { parseFrontMatter } from "../frontmatter.js";

const USAGE = `
Usage: fit-doc <command> [options]

Commands:
  build    Build documentation site from markdown files
  serve    Build and serve documentation with optional watch mode

Options:
  -h, --help     Show this help message

Build options:
  --src=<dir>       Source directory (default: website)
  --out=<dir>       Output directory (default: dist)
  --base-url=<url>  Base URL for sitemap, canonical links, and llms.txt

Serve options:
  --src=<dir>    Source directory (default: website)
  --out=<dir>    Output directory (default: dist)
  -p, --port     Port to serve on (default: 3000)
  -w, --watch    Watch for changes and rebuild
`;

/**
 * @param {string} message
 */
function error(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/**
 * @param {import("../builder.js").DocsBuilder} builder
 * @param {string} docsDir
 * @param {string} distDir
 * @param {string} [baseUrl]
 */
async function runBuild(builder, docsDir, distDir, baseUrl) {
  if (!fs.existsSync(docsDir)) {
    error(`Source directory not found: ${docsDir}`);
  }

  await builder.build(docsDir, distDir, baseUrl);
}

/**
 * @param {import("../builder.js").DocsBuilder} builder
 * @param {import("../server.js").DocsServer} server
 * @param {string} docsDir
 * @param {string} distDir
 * @param {{ port: number, watch: boolean }} options
 */
async function runServe(builder, server, docsDir, distDir, options) {
  if (!fs.existsSync(docsDir)) {
    error(`Source directory not found: ${docsDir}`);
  }

  await builder.build(docsDir, distDir, options.baseUrl);

  if (options.watch) {
    server.watch(docsDir, distDir);
  }

  server.serve(distDir, { port: options.port, hostname: "0.0.0.0" });
  console.log("Press Ctrl+C to stop");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    console.log(USAGE.trim());
    process.exit(args.length === 0 ? 1 : 0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (!["build", "serve"].includes(command)) {
    error(`Unknown command: ${command}\n\n${USAGE.trim()}`);
  }

  const { values } = parseArgs({
    args: commandArgs,
    options: {
      src: { type: "string", default: "website" },
      out: { type: "string", default: "dist" },
      "base-url": { type: "string" },
      port: { type: "string", short: "p", default: "3000" },
      watch: { type: "boolean", short: "w", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    console.log(USAGE.trim());
    process.exit(0);
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
        port: parseInt(values.port, 10),
        watch: values.watch,
        baseUrl,
      });
    }
  } catch (err) {
    error(err.message);
  }
}

main();
