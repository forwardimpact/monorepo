#!/usr/bin/env node
// Invariant: the hosted control plane never reads the customer's Anthropic
// API key. BYOK (bring-your-own-key) is a constraint — every kata workflow
// runs in the customer's runner against the customer's ANTHROPIC_API_KEY
// secret, and no control-plane process touches it.
//
// For every directory in the hosted control-plane manifest below, this check
// asserts none of:
//   - a top-level runtime dependency under `@anthropic-ai/*` in package.json
//     (transitive deps are out of scope — the bun.lock audit covers them);
//   - a `.js` / `.mjs` import from `@anthropic-ai/*`;
//   - a read of `process.env.ANTHROPIC_` or `process.env["ANTHROPIC_`.
//
// It also scans the hosted-path workflow YAML emitted by kata-setup (the
// fenced blocks in .claude/skills/kata-setup/references/workflow-*.md) for the
// same code-level patterns. `secrets.ANTHROPIC_API_KEY` in YAML is the
// expected BYOK reference (the customer's runner reads its own secret) and is
// NOT a violation — only `process.env.ANTHROPIC_` and `@anthropic-ai` imports
// are flagged there.
//
// The manifest is the single source of truth for the control-plane directory
// list, populated from the design's components table.
//
// Usage:
//   node scripts/check-byok-boundary.mjs   # non-zero exit on any violation

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Hosted control-plane directories (design § Components).
export const CONTROL_PLANE_DIRS = [
  "services/ghserver",
  "services/oidc",
  "services/tenancy",
  "services/ghbridge",
  "services/msbridge",
  "services/bridge",
  "libraries/libbridge",
];

const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);

const ANTHROPIC_IMPORT = /@anthropic-ai\//;
// Catch every shape that reads an ANTHROPIC_* env var:
//   - dotted member access:        process.env.ANTHROPIC_API_KEY
//   - double-quoted bracket access: process.env["ANTHROPIC_API_KEY"]
//   - single-quoted bracket access: process.env['ANTHROPIC_API_KEY']
//   - destructuring of a named key: const { ANTHROPIC_API_KEY } = process.env
//
// The destructuring alternative is anchored to an `ANTHROPIC_`-prefixed name
// inside the braces so a legitimate `const { port } = process.env` is not a
// false positive (`s` flag lets the brace group span lines).
const ANTHROPIC_ENV =
  /process\.env\.ANTHROPIC_|process\.env\[["']ANTHROPIC_|\{[^}]*\bANTHROPIC_[^}]*\}\s*=\s*process\.env/s;

/**
 * Collect every `.js`/`.mjs` source file under `dir` (recursively), skipping
 * generated / vendored directories.
 *
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectSourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectSourceFiles(full));
    else if (entry.endsWith(".js") || entry.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/**
 * Scan one control-plane directory for BYOK-boundary violations. Returns a
 * list of `{ file, reason }` entries (empty when clean).
 *
 * @param {string} dir - Absolute or root-relative directory path
 * @returns {Array<{file: string, reason: string}>}
 */
export function scanDir(dir) {
  const abs = resolve(ROOT, dir);
  const violations = [];

  const pkgPath = join(abs, "package.json");
  if (existsSync(pkgPath)) {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    } catch (err) {
      violations.push({
        file: relative(ROOT, pkgPath),
        reason: `unparseable package.json: ${err.message}`,
      });
      pkg = null;
    }
    for (const dep of Object.keys(pkg?.dependencies ?? {})) {
      if (dep.startsWith("@anthropic-ai/")) {
        violations.push({
          file: relative(ROOT, pkgPath),
          reason: `top-level @anthropic-ai dependency: ${dep}`,
        });
      }
    }
  }

  for (const file of collectSourceFiles(abs)) {
    const src = readFileSync(file, "utf8");
    if (ANTHROPIC_IMPORT.test(src)) {
      violations.push({
        file: relative(ROOT, file),
        reason: "imports from @anthropic-ai/*",
      });
    }
    if (ANTHROPIC_ENV.test(src)) {
      violations.push({
        file: relative(ROOT, file),
        reason: "reads an ANTHROPIC_* environment variable",
      });
    }
  }

  return violations;
}

/**
 * Scan a kata-setup workflow markdown file's fenced YAML blocks for the
 * code-level BYOK patterns. `secrets.ANTHROPIC_API_KEY` is the expected BYOK
 * reference and is deliberately ignored — only `process.env.ANTHROPIC_` reads
 * and `@anthropic-ai` imports are flagged.
 *
 * @param {string} file - Absolute or root-relative markdown path
 * @returns {Array<{file: string, reason: string}>}
 */
export function scanWorkflowMarkdown(file) {
  const abs = resolve(ROOT, file);
  const violations = [];
  if (!existsSync(abs)) return violations;
  const text = readFileSync(abs, "utf8");
  const rel = relative(ROOT, abs);

  // Extract fenced code blocks (```yaml / ```yml / bare ```), join their bodies.
  const fenced = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  for (const block of fenced) {
    if (ANTHROPIC_IMPORT.test(block)) {
      violations.push({
        file: rel,
        reason: "fenced block imports @anthropic-ai/*",
      });
    }
    if (ANTHROPIC_ENV.test(block)) {
      violations.push({
        file: rel,
        reason: "fenced block reads an ANTHROPIC_* environment variable",
      });
    }
  }
  return violations;
}

/**
 * Discover the hosted-path workflow markdown files kata-setup emits.
 *
 * @returns {string[]} absolute paths
 */
function workflowMarkdownFiles() {
  const dir = join(ROOT, ".claude/skills/kata-setup/references");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => /^workflow-.*\.md$/.test(e))
    .map((e) => join(dir, e));
}

/**
 * Run the full BYOK-boundary check.
 *
 * @returns {Array<{file: string, reason: string}>} all violations
 */
export function runCheck() {
  const violations = [];
  for (const dir of CONTROL_PLANE_DIRS) violations.push(...scanDir(dir));
  for (const file of workflowMarkdownFiles()) {
    violations.push(...scanWorkflowMarkdown(file));
  }
  return violations;
}

function main() {
  const violations = runCheck();
  if (violations.length === 0) return;
  for (const v of violations) {
    console.error(`error: ${v.file} — ${v.reason} (BYOK boundary breach)`);
  }
  process.exitCode = 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main();
}
