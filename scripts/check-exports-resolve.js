#!/usr/bin/env node
// Prove that every published subpath export across every @forwardimpact
// package resolves to a file on disk. Used by spec 390 success criterion #9.

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";

const TIERS = ["libraries", "products", "services"];

function collectManifests() {
  const manifests = [];
  for (const tier of TIERS) {
    for (const pkgName of readdirSync(tier)) {
      const pkgDir = join(tier, pkgName);
      if (!statSync(pkgDir).isDirectory()) continue;
      const manifestPath = join(pkgDir, "package.json");
      if (existsSync(manifestPath)) manifests.push(manifestPath);
    }
  }
  return manifests;
}

const manifests = collectManifests();

let failures = 0;
let total = 0;

function walk(exports) {
  if (typeof exports === "string") return [exports];
  if (Array.isArray(exports)) return exports.flatMap(walk);
  if (exports && typeof exports === "object") {
    return Object.values(exports).flatMap(walk);
  }
  return [];
}

for (const manifestPath of manifests) {
  const pkgRoot = dirname(manifestPath);
  const pkg = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (pkg.exports) {
    const targets = walk(pkg.exports);
    for (const target of targets) {
      // Skip wildcard patterns — they are resolved per-consumer and can't be
      // checked without a concrete consumer path.
      if (typeof target !== "string") continue;
      if (target.includes("*")) continue;
      total += 1;
      const resolved = join(pkgRoot, target);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        console.error(`MISSING: ${pkg.name} → ${target}  (${resolved})`);
        failures += 1;
      }
    }
  }

  if (pkg.main) {
    total += 1;
    const resolved = join(pkgRoot, pkg.main);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      console.error(`MISSING main: ${pkg.name} → ${pkg.main}  (${resolved})`);
      failures += 1;
    }
  }

  if (pkg.bin) {
    const entries =
      typeof pkg.bin === "string"
        ? [["default", pkg.bin]]
        : Object.entries(pkg.bin);
    for (const [name, target] of entries) {
      total += 1;
      const resolved = join(pkgRoot, target);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) {
        console.error(
          `MISSING bin[${name}]: ${pkg.name} → ${target}  (${resolved})`,
        );
        failures += 1;
      }
    }
  }
}

console.log(
  `Checked ${total} resolution targets across ${manifests.length} packages.`,
);
if (failures) {
  console.error(`${failures} missing.`);
  process.exit(1);
}
console.log("All exports resolve.");
