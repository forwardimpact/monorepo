// Triangulate the Node.js floor across four surface families:
//   - every package.json#engines.node lower bound parses to a major ≥ 22
//   - every file referenced by a published package.json#bin includes
//     `import "@forwardimpact/libpreflight/nodeNN"` as its first import,
//     with NN equal to the owning manifest's engines.node lower-bound major
//   - every getting-started/{leaders,engineers}/**/index.md that names
//     "Node.js" names "Node.js 22+" and no other major
//   - the floor literal at one doc page, one manifest, and the libpreflight
//     node22.js body all agree on the same integer
//
// Discovery-based: future bins, packages, and pages land under the check
// without amending this module.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { collectFiles, readJsonOrNull } from "./lib/walk.mjs";

const SCOPE_DIRS = ["products", "libraries", "services"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "generated",
  "tmp",
  "dist",
  "worktrees",
]);
const REQUIRED_FLOOR = 22;
const DOC_ROOT = "websites/fit/docs/getting-started";
const DOC_AUDIENCES = ["leaders", "engineers"];
const CANONICAL_DOC = `${DOC_ROOT}/leaders/landmark/index.md`;
const PREFLIGHT_ENTRY = "libraries/libpreflight/src/node22.js";

const PREFLIGHT_IMPORT_RE =
  /^import\s+["']@forwardimpact\/libpreflight\/node(\d+)["']/m;
const FIRST_IMPORT_RE = /^import\b/m;
const NODEJS_VERSION_RE = /Node\.js\s+(\d+)\+/g;

// Accept `>=22`, `>=22.0.0`, `^22`, `22.x`, etc. Reject the rest.
function parseLowerBoundMajor(range) {
  const match = /^(?:[>~^]=?|=)?\s*(\d+)/.exec(range);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function lineNoAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function manifestSubjects(root) {
  const subjects = [];
  const files = collectFiles(root, {
    skip: SKIP_DIRS,
    match: (name) => name === "package.json",
  });
  for (const path of files) {
    const pkg = readJsonOrNull(path);
    if (!pkg) {
      subjects.push({ path, parseError: "unparseable package.json" });
      continue;
    }
    const range = pkg.engines?.node;
    if (!range) continue;
    subjects.push({ path, range, major: parseLowerBoundMajor(range) });
  }
  return subjects;
}

function packageBinSubjects(root, pkgDir) {
  const pkg = readJsonOrNull(join(pkgDir, "package.json"));
  if (!pkg?.bin) return [];
  const bins = typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin;
  const floor = parseLowerBoundMajor(pkg.engines?.node ?? "");
  return Object.values(bins).map((binPath) => {
    const path = join(pkgDir, binPath.replace(/^\.\//, ""));
    const subject = { path, pkgDir: relative(root, pkgDir), floor };
    try {
      subject.src = readFileSync(path, "utf8");
    } catch (err) {
      subject.readError = err.message;
    }
    return subject;
  });
}

function binSubjects(root) {
  const subjects = [];
  for (const scope of SCOPE_DIRS) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) continue;
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      subjects.push(...packageBinSubjects(root, join(scopeDir, entry.name)));
    }
  }
  return subjects;
}

function docSubjects(root) {
  const subjects = [];
  for (const audience of DOC_AUDIENCES) {
    const files = collectFiles(join(root, DOC_ROOT, audience), {
      skip: SKIP_DIRS,
      match: (name) => name === "index.md",
    });
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const mentions = [...text.matchAll(NODEJS_VERSION_RE)].map((m) => ({
        lineNo: lineNoAt(text, m.index),
        major: Number.parseInt(m[1], 10),
      }));
      if (mentions.length > 0) subjects.push({ path, mentions });
    }
  }
  return subjects;
}

// The three canonical floor declarations that must agree: the workspace
// manifest, one getting-started page, and the libpreflight entry body.
function floorSources(root) {
  const sources = [];

  const rootPkg = readJsonOrNull(join(root, "package.json"));
  sources.push({
    path: join(root, "package.json"),
    label: "workspace manifest",
    major: rootPkg ? parseLowerBoundMajor(rootPkg.engines?.node ?? "") : null,
    error: rootPkg ? null : "workspace root package.json not parseable",
  });

  const docPath = join(root, CANONICAL_DOC);
  let docMajor = null;
  let docError = null;
  try {
    const m = /Node\.js\s+(\d+)\+/.exec(readFileSync(docPath, "utf8"));
    if (m) docMajor = Number.parseInt(m[1], 10);
    else docError = 'canonical doc page does not name "Node.js N+"';
  } catch {
    docError = "canonical doc page missing";
  }
  sources.push({
    path: docPath,
    label: "doc page",
    major: docMajor,
    error: docError,
  });

  const checkPath = join(root, PREFLIGHT_ENTRY);
  let checkMajor = null;
  let checkError = null;
  try {
    const m = /check\(\s*(\d+)\s*\)/.exec(readFileSync(checkPath, "utf8"));
    if (m) checkMajor = Number.parseInt(m[1], 10);
    else checkError = "libpreflight entry does not call check(N)";
  } catch {
    checkError = "libpreflight node entry missing";
  }
  sources.push({
    path: checkPath,
    label: "libpreflight check",
    major: checkMajor,
    error: checkError,
  });

  return sources;
}

export default {
  name: "node-floor",

  build({ root }) {
    const sources = floorSources(root);
    const agreement = sources.every((s) => s.major !== null)
      ? [{ path: join(root, "package.json"), sources }]
      : [];
    return {
      subjects: {
        manifest: manifestSubjects(root),
        "bin-target": binSubjects(root),
        "doc-page": docSubjects(root),
        "floor-source": sources,
        "floor-agreement": agreement,
      },
    };
  },

  rules: [
    {
      id: "node-floor.manifest-unparseable",
      scope: "manifest",
      severity: "fail",
      check: (s) => (s.parseError ? { msg: s.parseError } : null),
      message: (s, r) => r.msg,
      hint: "fix the JSON so the engines floor can be read",
    },
    {
      id: "node-floor.unparseable-range",
      scope: "manifest",
      severity: "fail",
      when: (s) => !s.parseError,
      check: (s) => (s.major === null ? { range: s.range } : null),
      message: (s, r) => `engines.node "${r.range}" — cannot parse lower bound`,
      hint: "use a range with an explicit numeric lower bound, e.g. >=22.0.0",
    },
    {
      id: "node-floor.below-floor",
      scope: "manifest",
      severity: "fail",
      when: (s) => !s.parseError && s.major !== null,
      check: (s) =>
        s.major < REQUIRED_FLOOR ? { range: s.range, major: s.major } : null,
      message: (s, r) =>
        `engines.node "${r.range}" — lower bound ${r.major} < ${REQUIRED_FLOOR}`,
      hint: `raise the engines.node lower bound to ${REQUIRED_FLOOR}`,
    },
    {
      id: "node-floor.bin-missing-engines",
      scope: "bin-target",
      severity: "fail",
      check: (s) => (s.floor === null ? {} : null),
      message: (s) =>
        `${s.pkgDir}/package.json ships a bin but has no parseable engines.node`,
      hint: "declare engines.node on the publishing manifest",
    },
    {
      id: "node-floor.bin-unreadable",
      scope: "bin-target",
      severity: "fail",
      when: (s) => s.floor !== null,
      check: (s) => (s.readError ? { msg: s.readError } : null),
      message: (s, r) => r.msg,
      hint: "the package.json#bin entry must point at an existing file",
    },
    {
      id: "node-floor.bin-missing-preflight",
      scope: "bin-target",
      severity: "fail",
      when: (s) => s.floor !== null && !s.readError,
      check: (s) => {
        const firstImportIdx = s.src.search(FIRST_IMPORT_RE);
        if (firstImportIdx === -1) return { missing: true };
        const m = PREFLIGHT_IMPORT_RE.exec(s.src.slice(firstImportIdx));
        if (!m || m.index !== 0) return { missing: false };
        return null;
      },
      message: (s, r) =>
        r.missing
          ? `no import statement; missing libpreflight/node${s.floor}`
          : `first import is not "@forwardimpact/libpreflight/node${s.floor}"`,
      hint: "the preflight import must be the bin's first import so the version check runs before any package code",
    },
    {
      id: "node-floor.bin-floor-mismatch",
      scope: "bin-target",
      severity: "fail",
      when: (s) => s.floor !== null && !s.readError,
      check: (s) => {
        const firstImportIdx = s.src.search(FIRST_IMPORT_RE);
        if (firstImportIdx === -1) return null;
        const m = PREFLIGHT_IMPORT_RE.exec(s.src.slice(firstImportIdx));
        if (!m || m.index !== 0) return null;
        const imported = Number.parseInt(m[1], 10);
        return imported === s.floor ? null : { imported };
      },
      message: (s, r) =>
        `imports libpreflight/node${r.imported} but engines.node lower bound is ${s.floor}`,
      hint: "align the preflight import with the manifest's engines.node lower bound",
    },
    {
      id: "node-floor.doc-version",
      scope: "doc-page",
      severity: "fail",
      check: (s) => {
        const off = s.mentions.filter((m) => m.major !== REQUIRED_FLOOR);
        return off.length === 0 ? null : off;
      },
      message: (s, r) =>
        `names "Node.js ${r.major}+" — expected "Node.js ${REQUIRED_FLOOR}+"`,
      hint: "getting-started pages state one Node.js floor; update the page to the required major",
    },
    {
      id: "node-floor.source-error",
      scope: "floor-source",
      severity: "fail",
      check: (s) => (s.error ? { msg: s.error } : null),
      message: (s, r) => `${r.msg} (${s.label})`,
      hint: "each canonical floor declaration must exist and parse",
    },
    {
      id: "node-floor.disagreement",
      scope: "floor-agreement",
      severity: "fail",
      check: (s) => {
        const majors = s.sources.map((x) => x.major);
        const agreed = majors.every((m) => m === REQUIRED_FLOOR);
        return agreed ? null : { sources: s.sources };
      },
      message: (s, r) =>
        `floor disagreement — ${r.sources
          .map((x) => `${x.label}=${x.major}`)
          .join(", ")}, required=${REQUIRED_FLOOR}`,
      hint: "the workspace manifest, the canonical doc page, and the libpreflight entry must all state the same floor",
    },
  ],
};
