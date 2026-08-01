import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as yaml from "yaml";
import * as acorn from "acorn";
import { LIBCLI_IS_COMPILED } from "@forwardimpact/libcli";
import { runRules } from "@forwardimpact/libutil";
import { createBuildKit, RULE_KIT } from "./invariant-kit.js";

// The loader imports rule modules dynamically at runtime. So a compiled binary
// cannot bundle their bare imports. The standalone executable also has no
// node_modules to resolve them from, so a rule module's `import "yaml"` would
// fail. Expose the third-party packages libinvariant already bundles as virtual
// modules. A compiled rule module then resolves them to the embedded copies.
// Under node/bunx this is a no-op, because node_modules resolves them normally.
// A rule module that imports a package beyond this set must run through the
// package. It cannot run through the binary.
let bundledRuleDepsRegistered = false;
function registerBundledRuleDeps() {
  if (bundledRuleDepsRegistered) return;
  // Only the standalone binary needs this. node/bunx resolve from node_modules.
  if (!LIBCLI_IS_COMPILED || typeof Bun === "undefined") {
    return;
  }
  Bun.plugin({
    name: "invariant-rule-deps",
    setup(build) {
      build.module("yaml", () => ({ exports: yaml, loader: "object" }));
      build.module("acorn", () => ({ exports: acorn, loader: "object" }));
    },
  });
  bundledRuleDepsRegistered = true;
}

/**
 * Resolve the root whose rules directory applies to the working directory.
 * The nearest `package.json` is not enough. Inside a monorepo every workspace
 * package has one. So search upward for the caller-supplied rules directory
 * itself. Fall back to the nearest project root so the loader's error names
 * the expected location.
 *
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @param {string} rulesDir - Rules directory relative to the project root.
 * @returns {string} Path of the project root directory.
 */
export function findInvariantsRoot(runtime, rulesDir) {
  const found = runtime.finder.findUpward(runtime.proc.cwd(), rulesDir, 8);
  if (!found) return runtime.finder.findProjectRoot();
  // Climb back out of the found rules directory to the project root that
  // contains it. Use one level for each segment of the caller-supplied path.
  const climb = rulesDir
    .split("/")
    .filter(Boolean)
    .map(() => "..");
  return resolve(found, ...climb);
}

// Generic host for repo-local invariant rule modules. A rule module is a
// `*.rules.mjs` (or `*.rules.js`) file whose default export is:
//
//   {
//     name:  "ambient-deps",
//     build: async ({ root, runtime }) =>
//              ({ subjects: { "<scope>": [subject, …] }, ctx? }),
//     rules: [{ id, scope, severity, when?, check, message, hint? }, …],
//     seed?: async ({ root, runtime }) => "text",   // e.g. a refreshed deny-list
//   }
//
// `build` walks the repo and returns plain subjects for each scope. `rules`
// are the declarative checks that `runRules` applies over them. The repository
// owns its rule modules. This host only discovers, loads, and runs them. So
// the policies themselves never ship with the CLI.

function assertModuleShape(mod, fileName) {
  const ok =
    mod &&
    typeof mod.name === "string" &&
    typeof mod.build === "function" &&
    (Array.isArray(mod.rules) || typeof mod.rules === "function");
  if (!ok) {
    throw new Error(
      `${fileName}: default export must be { name, build, rules } (rules is an array or a (ruleKit) => array)`,
    );
  }
}

// A module's rules are either a static array or a `(ruleKit) => array` factory
// that builds them from the shared rule helpers.
function resolveRules(mod) {
  return typeof mod.rules === "function" ? mod.rules(RULE_KIT) : mod.rules;
}

/**
 * Discover and import every rule module under `rulesDir`. Sort by file name
 * for a stable run order.
 *
 * @param {{ root: string, rulesDir: string, runtime: import('@forwardimpact/libutil/runtime').Runtime }} options
 *   `rulesDir` is the rules directory relative to `root`. The caller supplies
 *   it. The library carries no discovery default.
 * @returns {Promise<object[]>} The modules' default exports.
 */
export async function loadRuleModules({ root, rulesDir, runtime }) {
  const dir = resolve(root, rulesDir);
  let entries;
  try {
    entries = await runtime.fs.readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`rules directory not found: ${dir}`);
  }
  const names = entries
    .filter((e) => e.isFile() && /\.rules\.m?js$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (names.length === 0) {
    throw new Error(`no *.rules.mjs modules found in ${dir}`);
  }
  registerBundledRuleDeps();
  const modules = [];
  for (const name of names) {
    const mod = (await import(pathToFileURL(resolve(dir, name)).href)).default;
    assertModuleShape(mod, name);
    modules.push(mod);
  }
  return modules;
}

/**
 * Run already-loaded rule modules. Inject the build kit. Build each module's
 * subjects. Then apply its rule catalogue through the shared rules engine.
 *
 * @param {object[]} modules - Rule-module default exports.
 * @param {{ root: string, runtime: import('@forwardimpact/libutil/runtime').Runtime, dir: string }} options
 *   `dir` is the modules' directory for co-located config. The caller supplies
 *   it with the rules it loaded.
 * @returns {Promise<object[]>} Structured findings, empty when conformant.
 */
export async function runRuleModules(modules, { root, runtime, dir }) {
  const findings = [];
  for (const mod of modules) {
    const kit = createBuildKit({ root, dir, runtime });
    const { subjects, ctx = {} } = await mod.build(kit);
    findings.push(
      ...runRules(
        resolveRules(mod),
        { ...ctx, subjects },
        { resolveScope: (key, c) => c.subjects[key] ?? [] },
      ),
    );
  }
  return findings;
}

/**
 * Load every rule module under `root`/`rulesDir` and run it.
 *
 * @param {{ root: string, rulesDir: string, runtime: import('@forwardimpact/libutil/runtime').Runtime }} options
 * @returns {Promise<object[]>} Structured findings, empty when conformant.
 *   Each finding is `{ id, level, path, lineNo?, message, hint? }` for use
 *   with `emitFindingsText` / `emitFindingsJson` from libutil.
 */
export async function checkInvariants({ root, rulesDir, runtime }) {
  if (!runtime) throw new Error("runtime is required");
  const dir = resolve(root, rulesDir);
  const modules = await loadRuleModules({ root, rulesDir, runtime });
  return runRuleModules(modules, { root, runtime, dir });
}
