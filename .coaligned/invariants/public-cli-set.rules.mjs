// Public-CLI launcher alignment. A CLI is "public" when an external doc, a
// published skill pack, or a published composite action invokes it as
// `npx`/`bunx fit-<name>` AND that name is a real `bin` in a non-private
// workspace package. Every public CLI must have a matching launcher package
// under `launchers/` (npm name = invoked name), and nothing else may live
// there — the launcher set is computed from the rule, never hand-maintained.
// Nearly all public CLIs are `fit-*`; the rare non-fit public CLI (coaligned,
// invoked as `npx coaligned …` in the published setup skills) is named in
// PUBLISHED_NON_FIT_CLIS, since the fit-only invocation scan cannot see it.
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

import { join } from "node:path";

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
  "fit-harness",
  "fit-trace",
  "fit-wiki",
];

// Public CLIs the fit-only invocation scan cannot capture. coaligned ships to
// external users via `apm` and is invoked as `npx coaligned …` in the published
// setup skills, but INVOKE_RE matches only fit-* names and the skill scan only
// walks fit-*/kata-* dirs — so it is named here to stay public, the same escape
// hatch SIBLING_ACTION_CLIS gives action-only CLIs.
export const PUBLISHED_NON_FIT_CLIS = ["coaligned"];

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
 * @param {string} srcName - Scoped source package, e.g. "@forwardimpact/libharness".
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
  const deps = Object.keys(manifest.dependencies ?? {});
  const files = manifest.files;
  const violations = [
    [
      manifest.name !== launcher.dir,
      `name must equal the invoked name "${launcher.dir}" — found "${manifest.name}" (npm publishes under name, every other guard keys on the dir)`,
    ],
    [
      manifest.type !== "module",
      `type must be "module" — the two-line launcher bin is ESM`,
    ],
    ...Object.keys(manifest)
      .filter((key) => !ALLOWED_KEYS.has(key))
      .map((key) => [true, `key "${key}" is outside the allowed set`]),
    ...REQUIRED_KEYS.filter((key) => !(key in manifest)).map((key) => [
      true,
      `required key "${key}" is missing`,
    ]),
    [
      deps.length !== 1 || deps[0] !== src.srcName,
      `dependencies must be exactly {"${src.srcName}": …} — found [${deps.join(", ")}]`,
    ],
    [
      !Array.isArray(files) || files.length !== 1 || files[0] !== "bin/",
      `files must be exactly ["bin/"]`,
    ],
    [
      Object.keys(manifest.bin ?? {}).length !== 1,
      "bin must have exactly one key",
    ],
  ];
  for (const [violated, message] of violations) {
    if (violated) problems.push({ kind: "schema", path, message });
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

function collectInvokedNames({ listDir, scan }) {
  const names = new Set([...SIBLING_ACTION_CLIS, ...PUBLISHED_NON_FIT_CLIS]);
  const dirs = ["websites/fit/docs"];
  for (const entry of listDir(".claude/skills")) {
    if (/^(fit|kata)-/.test(entry)) dirs.push(`.claude/skills/${entry}`);
  }
  for (const { text } of scan({
    dirs,
    skip: SKIP_DIRS,
    match: (name) => name.endsWith(".md"),
  })) {
    for (const m of text.matchAll(INVOKE_RE)) names.add(m[1]);
  }
  return names;
}

function collectWorkspacePackages({ listDir, readJson }) {
  const packages = [];
  for (const scope of SCOPE_DIRS) {
    for (const name of listDir(scope, { dirsOnly: true })) {
      if (SKIP_DIRS.has(name)) continue;
      const dir = `${scope}/${name}`;
      const manifest = readJson(`${dir}/package.json`);
      if (manifest) packages.push({ ...manifest, dir });
    }
  }
  return packages;
}

function collectLaunchers({ listDir, readJson, readText }) {
  const launchers = [];
  for (const dir of listDir("launchers", { dirsOnly: true })) {
    // No bin/ dir — binFiles stays empty and the shape check reports it.
    const binFiles = listDir(`launchers/${dir}/bin`).sort();
    const binContent =
      binFiles.length === 1
        ? readText(`launchers/${dir}/bin/${binFiles[0]}`)
        : null;
    launchers.push({
      dir,
      manifest: readJson(`launchers/${dir}/package.json`),
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

  build(kit) {
    const problems = checkPublicCliSet({
      invokedNames: collectInvokedNames(kit),
      packages: collectWorkspacePackages(kit),
      launchers: collectLaunchers(kit),
    });
    return {
      subjects: {
        "public-cli-problem": problems.map((p) => ({
          ...p,
          path: join(kit.root, p.path),
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
