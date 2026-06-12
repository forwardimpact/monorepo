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
// The manifest is the single source of truth for the hosted control-plane
// directory list.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { collectFiles, readJsonOrNull } from "./lib/walk.mjs";

const CONTROL_PLANE_DIRS = [
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

function scanDir(root, dir) {
  const abs = join(root, dir);
  const violations = [];

  const pkgPath = join(abs, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = readJsonOrNull(pkgPath);
    if (!pkg) {
      violations.push({ path: pkgPath, reason: "unparseable package.json" });
    }
    for (const dep of Object.keys(pkg?.dependencies ?? {})) {
      if (dep.startsWith("@anthropic-ai/")) {
        violations.push({
          path: pkgPath,
          reason: `top-level @anthropic-ai dependency: ${dep}`,
        });
      }
    }
  }

  const files = collectFiles(abs, {
    skip: SKIP_DIRS,
    match: (name) => name.endsWith(".js") || name.endsWith(".mjs"),
  });
  for (const path of files) {
    const src = readFileSync(path, "utf8");
    if (ANTHROPIC_IMPORT.test(src)) {
      violations.push({ path, reason: "imports from @anthropic-ai/*" });
    }
    if (ANTHROPIC_ENV.test(src)) {
      violations.push({
        path,
        reason: "reads an ANTHROPIC_* environment variable",
      });
    }
  }

  return violations;
}

// Scan a kata-setup workflow markdown file's fenced code blocks for the
// code-level BYOK patterns.
function scanWorkflowMarkdown(path) {
  const violations = [];
  const text = readFileSync(path, "utf8");
  const fenced = [...text.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map(
    (m) => m[1],
  );
  for (const block of fenced) {
    if (ANTHROPIC_IMPORT.test(block)) {
      violations.push({
        path,
        reason: "fenced block imports @anthropic-ai/*",
      });
    }
    if (ANTHROPIC_ENV.test(block)) {
      violations.push({
        path,
        reason: "fenced block reads an ANTHROPIC_* environment variable",
      });
    }
  }
  return violations;
}

function workflowMarkdownFiles(root) {
  const dir = join(root, ".claude/skills/kata-setup/references");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((e) => /^workflow-.*\.md$/.test(e))
    .map((e) => join(dir, e));
}

export default {
  name: "byok-boundary",

  build({ root }) {
    const subjects = [];
    for (const dir of CONTROL_PLANE_DIRS) {
      subjects.push(...scanDir(root, dir));
    }
    for (const file of workflowMarkdownFiles(root)) {
      subjects.push(...scanWorkflowMarkdown(file));
    }
    return { subjects: { "byok-violation": subjects } };
  },

  rules: [
    {
      id: "byok.boundary",
      scope: "byok-violation",
      severity: "fail",
      check: () => ({}),
      message: (s) => `${s.reason} (BYOK boundary breach)`,
      hint: "the hosted control plane never touches the customer's Anthropic key — move the key read to the customer-runner side",
    },
  ],
};
