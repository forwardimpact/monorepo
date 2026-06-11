import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runRules } from "@forwardimpact/libutil";

// The conventional rules location, relative to the project root.
export const INVARIANTS_DIR = ".coaligned/invariants";

/**
 * Resolve the root whose `.coaligned/invariants/` applies to the working
 * directory. The nearest `package.json` is not enough — inside a monorepo
 * every workspace package has one — so search upward for the rules directory
 * itself, falling back to the nearest project root so the loader's error
 * names the expected location.
 *
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime
 * @returns {string} Project root directory path.
 */
export function findInvariantsRoot(runtime) {
  const found = runtime.finder.findUpward(
    runtime.proc.cwd(),
    INVARIANTS_DIR,
    8,
  );
  return found ? resolve(found, "../..") : runtime.finder.findProjectRoot();
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
// `build` walks the repo and returns plain subjects per scope; `rules` are the
// declarative checks `runRules` applies over them. The repository owns its
// rule modules — this host only discovers, loads, and runs them, so the
// policies themselves never ship with the CLI.

function assertModuleShape(mod, fileName) {
  const ok =
    mod &&
    typeof mod.name === "string" &&
    typeof mod.build === "function" &&
    Array.isArray(mod.rules);
  if (!ok) {
    throw new Error(
      `${fileName}: default export must be { name, build, rules }`,
    );
  }
}

/**
 * Discover and import every rule module under `rulesDir` (sorted by file
 * name for a stable run order).
 *
 * @param {{ root: string, rulesDir: string, runtime: import('@forwardimpact/libutil/runtime').Runtime }} options
 * @returns {Promise<object[]>} The modules' default exports.
 */
export async function loadRuleModules({
  root,
  rulesDir = INVARIANTS_DIR,
  runtime,
}) {
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
  const modules = [];
  for (const name of names) {
    const mod = (await import(pathToFileURL(resolve(dir, name)).href)).default;
    assertModuleShape(mod, name);
    modules.push(mod);
  }
  return modules;
}

/**
 * Run already-loaded rule modules: build each module's subjects, then apply
 * its rule catalogue through the shared rules engine.
 *
 * @param {object[]} modules - Rule-module default exports.
 * @param {{ root: string, runtime: import('@forwardimpact/libutil/runtime').Runtime }} options
 * @returns {Promise<object[]>} Structured findings; empty when conformant.
 */
export async function runRuleModules(modules, { root, runtime }) {
  const findings = [];
  for (const mod of modules) {
    const { subjects, ctx = {} } = await mod.build({ root, runtime });
    findings.push(
      ...runRules(
        mod.rules,
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
 * @returns {Promise<object[]>} Structured findings; empty when conformant.
 *   Each finding is `{ id, level, path, lineNo?, message, hint? }` for use
 *   with `emitFindingsText` / `emitFindingsJson` from libutil.
 */
export async function checkInvariants({
  root,
  rulesDir = INVARIANTS_DIR,
  runtime,
}) {
  if (!runtime) throw new Error("runtime is required");
  const modules = await loadRuleModules({ root, rulesDir, runtime });
  return runRuleModules(modules, { root, runtime });
}
