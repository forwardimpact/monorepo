#!/usr/bin/env node
// Check every package under products/, services/, libraries/ for conformance
// to the allowed-root-subdirs contract (spec 390).

import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ALLOWED_SUBDIRS = new Set([
  "bin",
  "config",
  "macos",
  "pkg",
  "proto",
  "schema",
  "src",
  "starter",
  "supabase",
  "templates",
  "test",
]);

// Dirs the working tree may contain but that are gitignored / out of scope.
// `generated` is created by `fit-codegen` (it symlinks the root ./generated/
// dir into libraries/libtype and libraries/librpc); it's gitignored, so the
// layout check should ignore it too.
const IGNORED_SUBDIRS = new Set(["node_modules", "generated"]);

const TIERS = ["products", "services", "libraries"];
const strict = !process.argv.includes("--no-strict");

const violations = [];
const rootSourceFiles = [];
const missingSrcIndex = [];

for (const tier of TIERS) {
  for (const pkgName of readdirSync(tier)) {
    const pkgDir = join(tier, pkgName);
    if (!statSync(pkgDir).isDirectory()) continue;

    // Every non-service package must have src/index.js (spec 390 #4).
    if (tier !== "services" && !existsSync(join(pkgDir, "src", "index.js"))) {
      missingSrcIndex.push(pkgDir);
    }

    for (const entry of readdirSync(pkgDir)) {
      const entryPath = join(pkgDir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        if (IGNORED_SUBDIRS.has(entry)) continue;
        if (!ALLOWED_SUBDIRS.has(entry)) {
          violations.push({ pkg: pkgDir, subdir: entry });
        }
        continue;
      }

      // Root-level source files.
      if (entry.endsWith(".js") || entry.endsWith(".ts")) {
        // Services are allowed exactly two: index.js and server.js.
        if (tier === "services") {
          if (entry !== "index.js" && entry !== "server.js") {
            rootSourceFiles.push({ pkg: pkgDir, file: entry });
          }
        } else {
          rootSourceFiles.push({ pkg: pkgDir, file: entry });
        }
      }
    }
  }
}

if (violations.length || rootSourceFiles.length || missingSrcIndex.length) {
  console.error("Package layout drift detected (spec 390):\n");

  if (violations.length) {
    console.error("  Non-allowed root subdirectories:");
    for (const v of violations) {
      console.error(`    ${v.pkg}/${v.subdir}/`);
    }
    console.error(
      "\n  Allowed: " + [...ALLOWED_SUBDIRS].sort().join(", ") + "\n",
    );
  }

  if (rootSourceFiles.length) {
    console.error("  Root-level source files (move into src/):");
    for (const f of rootSourceFiles) {
      console.error(`    ${f.pkg}/${f.file}`);
    }
    console.error(
      "\n  Services may keep only index.js and server.js at the root.\n",
    );
  }

  if (missingSrcIndex.length) {
    console.error(
      "  Missing src/index.js (required for non-service packages):",
    );
    for (const pkg of missingSrcIndex) {
      console.error(`    ${pkg}/src/index.js`);
    }
    console.error("");
  }

  if (strict) {
    process.exit(1);
  }
  console.error("  (Permissive mode — not failing. Pass --no-strict to skip.)");
}
