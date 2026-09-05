// Invariant: every relative link in an instruction layer must resolve to a
// file that exists, in this repository and in the published skill pack.
//
// An instruction layer lives at `<root>/agents/*.md` or
// `<root>/skills/<name>/**`, and `fit-pack` stages it into a sibling repo at
// `.apm/agents/` or `.apm/skills/`. A link therefore resolves from two
// different directories. A path that is right in one place can dangle in the
// other, and nothing at read time reports it. Three shapes have already gone
// out that way: a repo-root path that resolves from neither location
// (`.claude/agents/x-memory-protocol.md`), a depth error that resolves here
// and escapes the pack root (`../../../JTBD.md`), and a link to a profile,
// which stages under a different name (`<stem>.agent.md`).
//
// The rules check the path shape. They do not check pack membership, because
// `fit-pack` owns that: it stages the references a pack cites and fails the
// stage when a citation it cannot parse would dangle.
//
// Out of scope: `assets/` trees. Those files are copied into a target
// repository, so their links resolve where the agent writes them, not here.

const SOURCES = [".claude", "products/outpost/templates/.claude"];
const DIRS = SOURCES.flatMap((root) => [`${root}/agents`, `${root}/skills`]);
const SKIP = ["assets", "node_modules"];

// Claude Code's agent loader reads a file with both `name` and `description`
// frontmatter as a profile. `fit-pack` applies the same test, and renames a
// profile to `<stem>.agent.md`. Everything else in `agents/` is a reference
// and keeps its name.
const isProfile = (text) =>
  /^name:[ \t]*\S/m.test(text) && /^description:[ \t]*\S/m.test(text);

// Blank fenced blocks and inline code spans, and keep every newline, so a
// documented example never counts as a link and line numbers stay true. A
// code span may wrap across lines, so the span pattern spans them too.
function blankCode(text) {
  let inFence = false;
  const unfenced = text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
  return unfenced.replace(/`[^`]*`/g, (m) => m.replace(/[^\n]/g, " "));
}

// Inline links, link definitions, and raw HTML anchors. Markdown allows all
// three, and this repository writes all three.
const LINK_PATTERNS = [
  /\]\(\s*(?:<([^<>\n]*)>|([^\s)]*))\s*(?:["'][^"'\n]*["']\s*)?\)/g,
  /^[ \t]*\[[^\]]+\]:[ \t]*<?([^\s>]+)>?/gm,
  /<a\s[^>]*href\s*=\s*["']([^"']*)["']/gi,
];

/** Every relative link target in `text`, with the line it sits on. */
function linkTargets(text) {
  const body = blankCode(text);
  const found = [];
  for (const re of LINK_PATTERNS) {
    for (const m of body.matchAll(re)) {
      const raw = (m[1] ?? m[2] ?? "").trim();
      // A scheme reaches the network. A bare fragment stays in the file.
      if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#")) {
        continue;
      }
      const target = raw.replace(/[#?].*$/, "");
      if (!target) continue;
      found.push({
        target,
        lineNo: body.slice(0, m.index).split("\n").length,
      });
    }
  }
  return found;
}

/**
 * Resolve `target` against the directory holding `fromRel`. Return null when
 * it climbs above the tree root, which is itself the violation.
 */
function resolveFrom(fromRel, target) {
  const parts = fromRel.split("/").slice(0, -1);
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

/** Split a scanned file into its source root and the path below it. */
function split(rel) {
  const root = SOURCES.find((r) => rel.startsWith(`${r}/`));
  return root ? { root, below: rel.slice(root.length + 1) } : null;
}

/** Where `fit-pack` stages this file, or null when it stages nothing. */
function packRel(rel, text) {
  const parts = split(rel);
  if (!parts) return null;
  const agent = parts.below.match(/^agents\/([^/]+)\.md$/);
  if (agent) {
    const stem = agent[1];
    return isProfile(text)
      ? `.apm/agents/${stem}.agent.md`
      : `.apm/agents/${stem}.md`;
  }
  // Only a file inside a skill directory ships. A file directly under
  // `skills/` is repository guidance and stays behind.
  const skill = parts.below.match(/^skills\/[^/]+\/.+$/);
  return skill ? `.apm/skills/${parts.below.slice("skills/".length)}` : null;
}

/**
 * The repo file a staged path came from, or null when nothing stages there.
 *
 * The agents rename is load-bearing in both directions. A profile stages as
 * `<stem>.agent.md`, so a link to `<stem>.md` finds nothing in the pack. A
 * reference keeps its name, so a link to `<stem>.agent.md` finds nothing
 * either. `profiles` answers which one a repo file is.
 */
function packToRepo(packPath, root, profiles) {
  const agent = packPath.match(/^\.apm\/agents\/(.+)\.md$/);
  if (agent) {
    const named = agent[1];
    const asProfile = named.endsWith(".agent");
    const stem = asProfile ? named.slice(0, -".agent".length) : named;
    const repoPath = `${root}/agents/${stem}.md`;
    return profiles.get(repoPath) === asProfile ? repoPath : null;
  }
  const skill = packPath.match(/^\.apm\/skills\/(.+)$/);
  return skill ? `${root}/skills/${skill[1]}` : null;
}

/** Memoized existence check. Many links point at the same few files. */
function existenceCache(readText) {
  const seen = new Map();
  return (path) => {
    if (!seen.has(path)) seen.set(path, readText(path) !== null);
    return seen.get(path);
  };
}

/** Which agents files carry agent frontmatter, keyed by repo path. */
function collectProfiles(files) {
  const profiles = new Map();
  for (const { rel, text } of files) {
    if (/(^|\/)agents\/[^/]+\.md$/.test(rel)) {
      profiles.set(rel, isProfile(text));
    }
  }
  return profiles;
}

/** Does the link resolve from the file's own directory in this repository? */
function resolvesHere(rel, target, present) {
  const here = resolveFrom(rel, target);
  return here !== null && present(here);
}

/** Does the link resolve from the file's staged directory in the pack? */
function resolvesInPack(staged, root, target, profiles, present) {
  const there = resolveFrom(staged, target);
  if (there === null) return false;
  const source = packToRepo(there, root, profiles);
  return source !== null && present(source);
}

function subjects({ scan, readText }) {
  const files = scan({
    dirs: DIRS,
    skip: SKIP,
    match: (name) => name.endsWith(".md"),
  });
  // The pack rule needs to know which files are profiles before it resolves
  // any link, so collect that first.
  const profiles = collectProfiles(files);
  const present = existenceCache(readText);
  const repo = [];
  const pack = [];

  for (const { rel, text } of files) {
    const staged = packRel(rel, text);
    const root = split(rel)?.root;
    for (const link of linkTargets(text)) {
      if (!resolvesHere(rel, link.target, present)) {
        repo.push({ path: rel, ...link });
      }
      if (
        staged &&
        !resolvesInPack(staged, root, link.target, profiles, present)
      ) {
        pack.push({ path: rel, ...link, staged });
      }
    }
  }
  return { repo, pack };
}

export default {
  name: "instruction-links",

  build(kit) {
    const { repo, pack } = subjects(kit);
    return { subjects: { "repo-link": repo, "pack-link": pack } };
  },

  rules: ({ failAll }) => [
    failAll("repo-link", {
      id: "instruction-links.repo",
      message: (s) => `link target does not resolve here [${s.target}]`,
      hint:
        "write the path relative to the file that holds the link, or cite " +
        "the canonical https://github.com/... URL when the target ships in " +
        "neither tree",
    }),
    failAll("pack-link", {
      id: "instruction-links.pack",
      message: (s) =>
        `link target does not resolve in the pack, from ${s.staged} ` +
        `[${s.target}]`,
      hint:
        "use a path that holds in both trees: a bare filename between " +
        "agents files, ../agents/ or ../skills/ across them, and the " +
        "canonical https://github.com/... URL for anything outside them",
    }),
  ],
};
