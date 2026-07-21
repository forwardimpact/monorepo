// Contributor-side guard. Fails when a source file inside a workspace
// package imports a workspace package (`@forwardimpact/*`) that is not
// declared in the importing package's `package.json` (any of
// `dependencies`, `devDependencies`, `peerDependencies`,
// `optionalDependencies`).
//
// The disease: a static `import { … } from "@forwardimpact/<pkg>"` inside
// a published package. The workspace hoist masks the missing declaration
// in `bun install`; `npm install <published>` doesn't, so a fresh adopter
// hits `Cannot find package …` before any package code runs.
//
// Scope: `products/*`, `libraries/*`, `services/*` — every tree listed in
// the workspace globs of the root `package.json`.

import { join } from "node:path";

const SCOPE_DIRS = ["products", "libraries", "services"];
const SKIP_DIRS = ["node_modules", "dist", "generated", "tmp"];
const WORKSPACE_PREFIX = "@forwardimpact/";

const STATIC_IMPORT_TYPES = new Set([
  "ImportDeclaration",
  "ExportNamedDeclaration",
  "ExportAllDeclaration",
]);

// Static `import … from "X"`, `export … from "X"`, and dynamic `import("X")`.
function importFromNode(node) {
  if (
    STATIC_IMPORT_TYPES.has(node.type) &&
    node.source &&
    typeof node.source.value === "string" &&
    node.source.value.startsWith(WORKSPACE_PREFIX)
  ) {
    return { spec: node.source.value, line: node.source.loc.start.line };
  }
  if (
    node.type === "ImportExpression" &&
    node.source &&
    node.source.type === "Literal" &&
    typeof node.source.value === "string" &&
    node.source.value.startsWith(WORKSPACE_PREFIX)
  ) {
    return { spec: node.source.value, line: node.source.loc.start.line };
  }
  return null;
}

// "@forwardimpact/libconfig/sub" → "@forwardimpact/libconfig"
function packageName(spec) {
  return spec.split("/").slice(0, 2).join("/");
}

function workspaceImports(ast, walk) {
  const found = [];
  walk(ast, (node) => {
    const imp = importFromNode(node);
    if (imp) found.push({ pkg: packageName(imp.spec), line: imp.line });
  });
  return found;
}

function declaredDeps(manifest) {
  const out = new Set();
  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    for (const key of Object.keys(manifest[field] ?? {})) out.add(key);
  }
  return out;
}

// <scope>/<pkg>/... → repo-relative path to <scope>/<pkg>, or null when the
// file sits outside a workspace package.
function packageDirFor(rel) {
  const parts = rel.split("/");
  if (!SCOPE_DIRS.includes(parts[0]) || parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

export default {
  name: "workspace-imports",

  build({ root, scanAst, walk, readJson }) {
    const manifests = new Map();
    const manifestFor = (packageDir) => {
      if (!manifests.has(packageDir)) {
        manifests.set(packageDir, readJson(`${packageDir}/package.json`));
      }
      return manifests.get(packageDir);
    };

    const subjects = [];
    const scanned = scanAst({
      dirs: SCOPE_DIRS,
      skip: SKIP_DIRS,
      match: (name) => name.endsWith(".js"),
      locations: true,
      extract: (ast) => ({ imports: workspaceImports(ast, walk) }),
    });
    for (const s of scanned) {
      const packageDir = packageDirFor(s.rel);
      if (!packageDir) continue;
      const manifest = manifestFor(packageDir);
      if (!manifest) continue;
      const subject = {
        path: s.path,
        packageDir,
        selfName: manifest.name,
        declared: declaredDeps(manifest),
      };
      if (s.parseError) subject.parseError = s.parseError;
      else subject.imports = s.imports;
      subjects.push(subject);
    }

    // A package whose manifest is missing or malformed can't be checked at
    // all — surface that loudly (once per package) instead of silently
    // skipping its files.
    const manifestGaps = [...manifests.entries()]
      .filter(([, manifest]) => !manifest)
      .map(([packageDir]) => ({
        path: join(root, packageDir, "package.json"),
        packageDir,
      }));
    const workspacePackages = new Set(
      [...manifests.values()]
        .map((m) => m?.name)
        .filter((n) => typeof n === "string"),
    );
    return {
      subjects: { "package-file": subjects, "manifest-gap": manifestGaps },
      ctx: { workspacePackages },
    };
  },

  rules: ({ parseError, failAll }) => [
    failAll("manifest-gap", {
      id: "workspace.manifest-unreadable",
      message: (s) =>
        `${s.packageDir} contains source files but its package.json is missing or malformed`,
      hint: "fix the manifest so the package's imports can be checked against its declared dependencies",
    }),
    parseError("package-file", {
      id: "workspace.parse-error",
      hint: "fix the syntax error so the import scan can parse the module",
    }),
    {
      id: "workspace.undeclared-import",
      scope: "package-file",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s, c) => {
        const undeclared = s.imports.filter(
          (i) =>
            // Self-import: Node resolves it via the package's own `exports`.
            i.pkg !== s.selfName &&
            // Non-workspace import: Node's resolver catches it at runtime.
            c.workspacePackages.has(i.pkg) &&
            !s.declared.has(i.pkg),
        );
        return undeclared.length === 0
          ? null
          : undeclared.map((i) => ({ lineNo: i.line, pkg: i.pkg }));
      },
      message: (s, r) =>
        `imports "${r.pkg}" but it is not declared in ${s.packageDir}/package.json`,
      hint: "declare the workspace package in the importing package's dependencies — the workspace hoist masks the gap locally, npm installs of the published package break",
    },
  ],
};
