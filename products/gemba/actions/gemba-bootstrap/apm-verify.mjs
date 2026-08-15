// Verify that every pack declared in apm.yml resolved and deployed.
//
// `apm install` exits 0 even when a declared pack fails to resolve, so its exit
// code cannot gate the run. This script reconciles the packs declared under
// apm.yml `dependencies.apm` against the post-install apm.lock.yaml (matched by
// repo_url). It also reconciles them against the on-disk deployed files. It
// exits nonzero on any gap (SC4).
//
// Run this script with Bun from the consumer checkout root. It reads apm.yml
// and apm.lock.yaml from process.cwd(). It parses them with the runtime's
// built-in Bun.YAML.parse. That adds no dependency, because the script runs
// inside an arbitrary consumer checkout where the monorepo's node_modules is
// absent.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Reduce a pack reference to its `owner/repo` identity so the declared
// `owner/repo#sha` form and the lockfile's `owner/repo` repo_url compare equal.
function normalizeRepo(ref) {
  return String(ref)
    .trim()
    .replace(/#.*$/, "") // drop a #<ref> pin suffix
    .replace(/^https?:\/\/[^/]+\//, "") // drop a https://<host>/ prefix
    .replace(/^git@[^:]+:/, "") // drop a git@<host>: prefix
    .replace(/\.git$/, ""); // drop a trailing .git
}

function parseYamlFile(path) {
  return Bun.YAML.parse(readFileSync(path, "utf8"));
}

const cwd = process.cwd();
const apmYmlPath = join(cwd, "apm.yml");
const lockPath = join(cwd, "apm.lock.yaml");

const apmYml = parseYamlFile(apmYmlPath);
const declared = apmYml?.dependencies?.apm;

// If nothing is declared under dependencies.apm, there is nothing to verify.
if (!Array.isArray(declared) || declared.length === 0) {
  console.log("apm-verify: no packs declared under apm.yml dependencies.apm.");
  process.exit(0);
}

const errors = [];

if (!existsSync(lockPath)) {
  console.log("::error::apm-verify: apm.lock.yaml is missing. Declared packs are unresolved.");
  process.exit(1);
}

const lock = parseYamlFile(lockPath);
const lockDeps = Array.isArray(lock?.dependencies) ? lock.dependencies : [];

// Index lockfile entries by normalized repo_url so the loop below can join a
// declared pack to its resolved entry.
const byRepo = new Map();
for (const entry of lockDeps) {
  const key = normalizeRepo(entry?.repo_url ?? "");
  if (!byRepo.has(key)) byRepo.set(key, []);
  byRepo.get(key).push(entry);
}

const verified = [];

// Anchor on the declared set. Do not anchor on the deployed_files present. The
// script then catches a pack that never resolved (no lockfile entry) instead of
// a blind pass.
for (const decl of declared) {
  const repo = normalizeRepo(decl);
  const matches = byRepo.get(repo) ?? [];

  if (matches.length === 0) {
    errors.push(`declared pack '${decl}' has no entry in apm.lock.yaml (unresolved).`);
    continue;
  }
  if (matches.length > 1) {
    errors.push(`declared pack '${decl}' matches ${matches.length} apm.lock.yaml entries. Expected exactly one.`);
    continue;
  }

  const entry = matches[0];
  const deployed = entry.deployed_files;
  if (!Array.isArray(deployed) || deployed.length === 0) {
    errors.push(`declared pack '${decl}' resolved but deployed no files (empty deployed_files).`);
    continue;
  }

  const missing = deployed.filter((rel) => !existsSync(join(cwd, rel)));
  if (missing.length > 0) {
    for (const rel of missing) {
      errors.push(`declared pack '${decl}' is missing a deployed file on disk: ${rel}`);
    }
    continue;
  }

  verified.push(repo);
}

if (errors.length > 0) {
  for (const message of errors) {
    console.log(`::error::apm-verify: ${message}`);
  }
  process.exit(1);
}

console.log(`apm-verify: verified ${verified.length} pack(s): ${verified.join(", ")}.`);
