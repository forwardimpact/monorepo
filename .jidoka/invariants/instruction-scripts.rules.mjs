// Invariant: an instruction layer must only run a script that ships with it.
//
// `fit-pack` stages the agent profiles and the skill directories, and nothing
// else. The repository root stays behind. A layer that runs
// `node scripts/x.mjs` therefore works here and fails in every installation,
// because the root `scripts/` tree never travels. One such reference already
// went out: `.claude/agents/staff-engineer.md` ran a root script at boot.
//
// The rules read invocations, not prose. A runner in front of a path is a call
// the agent makes. A path without one names a file, and these layers document
// repository skeletons that they never run themselves.
//
// A layer may address its script three ways, and all three ship: from the
// installation root (`.claude/skills/<name>/scripts/x.mjs`), from the skill
// root (`scripts/x.mjs`), and from the file that holds the line (`./x.sh`).
// The target must land inside the packaged `agents/` or `skills/` tree, and
// the file must exist. Everything else is a dependency the pack cannot carry.

const SOURCES = [".claude", "products/outpost/templates/.claude"];
const DIRS = SOURCES.flatMap((root) => [`${root}/agents`, `${root}/skills`]);
const SKIP = ["assets", "node_modules"];

const EXT = "(?:mjs|cjs|js|ts|sh|py)";
const SEGMENT = "[^\\s`\"'|;&()<>]+";
const RUNNER = "(?:node|bun|bunx|npx|deno|bash|sh|zsh|python3?)";

const INVOCATIONS = [
  // A runner and its script, with any flags between the two.
  new RegExp(
    `\\b${RUNNER}\\s+(?:-{1,2}[\\w-]+(?:=\\S+)?\\s+)*(${SEGMENT}\\.${EXT})(?![\\w.])`,
    "g",
  ),
  // A path the shell runs directly.
  new RegExp(`(?<![\\w.])(\\.{1,2}/${SEGMENT}\\.${EXT})(?![\\w.])`, "g"),
];

/** Every script a file tells the agent to run, with the line it sits on. */
function invocations(text) {
  const found = new Map();
  for (const re of INVOCATIONS) {
    for (const m of text.matchAll(re)) {
      const target = m[1];
      // A URL is a download, not a path into this tree.
      if (target.includes("://")) continue;
      const lineNo = text.slice(0, m.index).split("\n").length;
      found.set(`${lineNo}:${target}`, { target, lineNo });
    }
  }
  return [...found.values()];
}

/**
 * Resolve `target` against the directory `from`. Return null when it climbs
 * above the repository root, which is itself the violation.
 */
function resolveFrom(from, target) {
  const parts = from === "" ? [] : from.split("/");
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg !== "..") {
      parts.push(seg);
      continue;
    }
    if (parts.length === 0) return null;
    parts.pop();
  }
  return parts.join("/");
}

/** The directory holding `rel`. */
const dirOf = (rel) => rel.split("/").slice(0, -1).join("/");

/** The source root that holds `rel`, or null when none does. */
const sourceOf = (rel) => SOURCES.find((r) => rel.startsWith(`${r}/`)) ?? null;

/**
 * The directory that ships with the file. A skill travels as its whole
 * `skills/<name>` tree. An agent profile and an agent reference each travel as
 * one file, so they carry no directory of their own.
 */
function layerDir(rel, root) {
  const skill = rel.slice(root.length + 1).match(/^skills\/([^/]+)\//);
  return skill ? `${root}/skills/${skill[1]}` : null;
}

/** The three directories a layer writes a script path against. */
function bases(rel, root, dir) {
  // The installation root holds `.claude/`, so it is the source root's parent.
  const install = dirOf(root);
  return dir ? [install, dir, dirOf(rel)] : [install, dirOf(rel)];
}

/** Does the resolved path sit in the packaged instruction tree? */
const packaged = (path, root) =>
  path.startsWith(`${root}/agents/`) || path.startsWith(`${root}/skills/`);

/** Does the target name a file the pack carries? */
function ships(rel, root, dir, target, present) {
  return bases(rel, root, dir).some((base) => {
    const resolved = resolveFrom(base, target);
    return resolved !== null && packaged(resolved, root) && present(resolved);
  });
}

/** Memoized existence check. Many invocations name the same few scripts. */
function existenceCache(readText) {
  const seen = new Map();
  return (path) => {
    if (!seen.has(path)) seen.set(path, readText(path) !== null);
    return seen.get(path);
  };
}

/** Is this invocation exempt, per the co-located allow list? */
const allowed = (allow, rel, target) => (allow[rel] ?? []).includes(target);

function subjects({ scan, readText, config }) {
  const allow = config("instruction-scripts.allow.yml", {}) ?? {};
  const present = existenceCache(readText);
  const violations = [];

  for (const { rel, text } of scan({
    dirs: DIRS,
    skip: SKIP,
    match: (name) => name.endsWith(".md"),
  })) {
    const root = sourceOf(rel);
    const dir = layerDir(rel, root);
    for (const { target, lineNo } of invocations(text)) {
      if (allowed(allow, rel, target)) continue;
      if (ships(rel, root, dir, target, present)) continue;
      violations.push({ path: rel, lineNo, target, root });
    }
  }
  return violations;
}

export default {
  name: "instruction-scripts",

  build(kit) {
    return { subjects: { "script-run": subjects(kit) } };
  },

  rules: ({ failAll }) => [
    failAll("script-run", {
      id: "instruction-scripts.outside-pack",
      message: (s) => `runs a script the pack does not carry [${s.target}]`,
      hint:
        "move the script under the skill's own scripts/ directory, or ship " +
        "it as a published CLI and call the command by name. A path into " +
        "the repository root resolves here and nowhere else",
    }),
  ],
};
