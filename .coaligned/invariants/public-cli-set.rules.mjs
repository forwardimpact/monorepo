// Public-CLI launcher alignment. A CLI is "public" when an external doc, a
// published skill pack, or a published composite action invokes it as
// `npx`/`bunx fit-<name>` AND that name is a real `bin` in a non-private
// workspace package. Every public CLI must have a matching launcher package
// under `launchers/` (npm name = invoked name), and nothing else may live
// there — the launcher set is computed from the rule, never hand-maintained.
// See launchers/README.md for the published contract.
//
// Checks, each failing CI with a message naming the offending dir/file:
//   (a) `launchers/` subdirectories ≠ rule output (either direction)
//   (b) launcher bin key/file strays from the canonical two-line shape, or
//       the source package stops exporting the bin subpath the launcher
//       imports — byte-exact content equality, not import parsing, because
//       `files: ["bin/"]` ships the whole dir and pinning package.json alone
//       stops neither appended code nor a second file
//   (c) launcher `version` or dependency pin ≠ the `0.0.0` placeholder —
//       publish-npm.yml stamps real versions; nothing else writes them
//   (d) launcher package.json strays from the allowed-keys schema — launchers
//       publish verbatim from the working tree, so this pins the full
//       published surface (no smuggled deps, scripts, or extra files)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { collectFiles, readJsonOrNull } from "./lib/walk.mjs";

const SCOPE_DIRS = ["libraries", "products", "services"];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "tmp"]);

// Known forward-drift gap: forms like `npx --package=…/fit-x` or `bunx --bun
// fit-x` are not matched and would silently under-count if docs ever adopt
// them; today's tree uses none.
const INVOKE_RE = /\b(?:npx|bunx)\s+(?:-y\s+|--yes\s+)?(fit-[a-z][a-z-]*)/g;

// CLIs the published sibling composite actions invoke. Their sources live
// outside this checkout — see .github/CLAUDE.md § the sibling-repo table.
// Subsumed by docs/skills today; kept so an action-only CLI stays public.
export const SIBLING_ACTION_CLIS = [
  "fit-benchmark",
  "fit-eval",
  "fit-trace",
  "fit-wiki",
];

const REQUIRED_KEYS = [
  "name",
  "version",
  "type",
  "bin",
  "files",
  "dependencies",
];
const ALLOWED_KEYS = new Set([
  ...REQUIRED_KEYS,
  "description",
  "homepage",
  "repository",
  "license",
  "author",
  "engines",
  "publishConfig",
]);

/**
 * The canonical launcher bin file — byte-exact, LF, single trailing newline.
 *
 * @param {string} cli - Invoked name, e.g. "fit-trace".
 * @param {string} srcName - Scoped source package, e.g. "@forwardimpact/libeval".
 * @returns {string}
 */
export function canonicalBinContent(cli, srcName) {
  return `#!/usr/bin/env node\nimport "${srcName}/bin/${cli}.js";\n`;
}

/**
 * The rule's output: invoked names ∩ non-private workspace bins, per bin.
 *
 * @param {{ invokedNames: Set<string>, packages: Array<{name: string, dir: string, private?: boolean, bin?: object, exports?: object}> }} inputs
 * @returns {Map<string, {srcName: string, srcDir: string, exportsOk: boolean}>}
 *   Keyed by invoked name.
 */
export function computePublicCliSet({ invokedNames, packages }) {
  const set = new Map();
  for (const pkg of packages) {
    if (pkg.private) continue;
    for (const cli of Object.keys(pkg.bin ?? {})) {
      if (!invokedNames.has(cli)) continue;
      set.set(cli, {
        srcName: pkg.name,
        srcDir: pkg.dir,
        exportsOk: `./bin/${cli}.js` in (pkg.exports ?? {}),
      });
    }
  }
  return set;
}

function checkLauncherShape(launcher, src, problems) {
  const cli = launcher.dir;
  const binPath = `launchers/${cli}/bin/${cli}.js`;
  if (launcher.manifest.bin?.[cli] !== `./bin/${cli}.js`) {
    problems.push({
      kind: "shape",
      path: `launchers/${cli}/package.json`,
      message: `bin must be exactly {"${cli}": "./bin/${cli}.js"}`,
    });
  }
  if (launcher.binFiles.length !== 1 || launcher.binFiles[0] !== `${cli}.js`) {
    problems.push({
      kind: "shape",
      path: `launchers/${cli}/bin`,
      message: `bin/ must contain exactly one file, ${cli}.js — found [${launcher.binFiles.join(", ")}]`,
    });
  } else if (launcher.binContent !== canonicalBinContent(cli, src.srcName)) {
    problems.push({
      kind: "shape",
      path: binPath,
      message: `not byte-exact to the canonical two-line launcher (shebang + import "${src.srcName}/bin/${cli}.js", LF, single trailing newline)`,
    });
  }
  if (!src.exportsOk) {
    problems.push({
      kind: "shape",
      path: `${src.srcDir}/package.json`,
      message: `exports lacks the "./bin/${cli}.js" subpath the ${cli} launcher imports`,
    });
  }
}

function checkLauncherPlaceholders(launcher, src, problems) {
  const path = `launchers/${launcher.dir}/package.json`;
  if (launcher.manifest.version !== "0.0.0") {
    problems.push({
      kind: "placeholder",
      path,
      message: `version must be the "0.0.0" placeholder — found "${launcher.manifest.version}"`,
    });
  }
  const pin = launcher.manifest.dependencies?.[src.srcName];
  if (pin !== undefined && pin !== "0.0.0") {
    problems.push({
      kind: "placeholder",
      path,
      message: `dependency pin on ${src.srcName} must be the "0.0.0" placeholder — found "${pin}"`,
    });
  }
}

function checkLauncherSchema(launcher, src, problems) {
  const path = `launchers/${launcher.dir}/package.json`;
  const manifest = launcher.manifest;
  const fail = (message) => problems.push({ kind: "schema", path, message });
  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_KEYS.has(key)) fail(`key "${key}" is outside the allowed set`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in manifest)) fail(`required key "${key}" is missing`);
  }
  const deps = Object.keys(manifest.dependencies ?? {});
  if (deps.length !== 1 || deps[0] !== src.srcName) {
    fail(
      `dependencies must be exactly {"${src.srcName}": …} — found [${deps.join(", ")}]`,
    );
  }
  const files = manifest.files;
  if (!Array.isArray(files) || files.length !== 1 || files[0] !== "bin/") {
    fail(`files must be exactly ["bin/"]`);
  }
  if (Object.keys(manifest.bin ?? {}).length !== 1) {
    fail("bin must have exactly one key");
  }
}

/**
 * Pure core: compare the rule's output against the launcher dirs and return
 * every alignment problem. In-memory inputs so tests need no fixture tree.
 *
 * @param {{ invokedNames: Set<string>, packages: object[], launchers: Array<{dir: string, manifest: object|null, binFiles: string[], binContent: string|null}> }} inputs
 * @returns {Array<{kind: string, path: string, message: string}>}
 */
export function checkPublicCliSet({ invokedNames, packages, launchers }) {
  const problems = [];
  const expected = computePublicCliSet({ invokedNames, packages });
  const dirs = new Set(launchers.map((l) => l.dir));

  for (const [cli, src] of expected) {
    if (!dirs.has(cli)) {
      problems.push({
        kind: "drift",
        path: "launchers",
        message: `public CLI ${cli} (bin of ${src.srcName}) has no launchers/${cli}/ dir`,
      });
    }
  }
  for (const launcher of launchers) {
    if (!expected.has(launcher.dir)) {
      problems.push({
        kind: "drift",
        path: `launchers/${launcher.dir}`,
        message: `launcher dir is not in the rule's output — no doc, published skill, or sibling action invokes ${launcher.dir} against a non-private bin`,
      });
      continue;
    }
    const src = expected.get(launcher.dir);
    if (!launcher.manifest) {
      problems.push({
        kind: "schema",
        path: `launchers/${launcher.dir}/package.json`,
        message: "missing or malformed package.json",
      });
      continue;
    }
    checkLauncherShape(launcher, src, problems);
    checkLauncherPlaceholders(launcher, src, problems);
    checkLauncherSchema(launcher, src, problems);
  }
  return problems;
}

function collectInvokedNames(root) {
  const names = new Set(SIBLING_ACTION_CLIS);
  const dirs = [join(root, "websites/fit/docs")];
  const skillsRoot = join(root, ".claude/skills");
  for (const entry of readdirSync(skillsRoot)) {
    if (/^(fit|kata)-/.test(entry)) dirs.push(join(skillsRoot, entry));
  }
  for (const dir of dirs) {
    const files = collectFiles(dir, {
      skip: SKIP_DIRS,
      match: (name) => name.endsWith(".md"),
    });
    for (const file of files) {
      for (const m of readFileSync(file, "utf8").matchAll(INVOKE_RE)) {
        names.add(m[1]);
      }
    }
  }
  return names;
}

function collectWorkspacePackages(root) {
  const packages = [];
  for (const scope of SCOPE_DIRS) {
    for (const entry of readdirSync(join(root, scope), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const dir = `${scope}/${entry.name}`;
      const manifest = readJsonOrNull(join(root, dir, "package.json"));
      if (manifest) packages.push({ ...manifest, dir });
    }
  }
  return packages;
}

function collectLaunchers(root) {
  const launchersRoot = join(root, "launchers");
  const launchers = [];
  for (const entry of readdirSync(launchersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = entry.name;
    let binFiles = [];
    let binContent = null;
    try {
      binFiles = readdirSync(join(launchersRoot, dir, "bin")).sort();
    } catch {
      // no bin/ dir — binFiles stays empty and the shape check reports it
    }
    if (binFiles.length === 1) {
      binContent = readFileSync(
        join(launchersRoot, dir, "bin", binFiles[0]),
        "utf8",
      );
    }
    launchers.push({
      dir,
      manifest: readJsonOrNull(join(launchersRoot, dir, "package.json")),
      binFiles,
      binContent,
    });
  }
  return launchers;
}

const HINTS = {
  drift:
    "add or delete the launcher dir — the set is computed, not hand-maintained; see launchers/README.md",
  shape:
    "restore the canonical two-line bin and the source's bin-subpath export; see launchers/README.md",
  placeholder:
    "keep the 0.0.0 placeholders — publish-npm.yml stamps the source's real version at publish time",
  schema:
    "launchers publish verbatim from the working tree; only the canonical metadata set may ride along",
};

export default {
  name: "public-cli-set",

  build({ root }) {
    const problems = checkPublicCliSet({
      invokedNames: collectInvokedNames(root),
      packages: collectWorkspacePackages(root),
      launchers: collectLaunchers(root),
    });
    return {
      subjects: {
        "public-cli-problem": problems.map((p) => ({
          ...p,
          path: join(root, p.path),
        })),
      },
    };
  },

  rules: ["drift", "shape", "placeholder", "schema"].map((kind) => ({
    id: `public-cli.${kind}`,
    scope: "public-cli-problem",
    severity: "fail",
    when: (s) => s.kind === kind,
    check: () => ({}),
    message: (s) => s.message,
    hint: HINTS[kind],
  })),
};
