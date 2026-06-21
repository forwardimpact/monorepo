// Flag monorepo-specific content in the published pack. The pack syncs
// unchanged into consuming repositories — APM installs the kata-* skills and
// the agent profiles plus their references together — so every line must hold
// in a repo that installed the pack yesterday (.claude/skills/CLAUDE.md
// § Generic by design). Three rule groups guard the classes that creep back:
//
// 1. Internal-only tooling — bun, bunx, and just are internal contributor
//    tooling (root CLAUDE.md § Distribution Model); external users run Node
//    + npx. Skills say "the repository's check / test / format command" or
//    invoke fit-* CLIs via npx.
// 2. Monorepo identifiers and snapshots — the @forwardimpact workspace
//    scope, internal site names under websites/, hardcoded gh api repo
//    paths, metrics years, lockfile names, and dated snapshots assume this
//    monorepo's state. Skills use placeholder forms — @<scope>/<pkg>,
//    websites/<site>, repos/{owner}/{repo}, {YYYY}, <lockfile> — and derive
//    data live.
// 3. Links broken in the published pack — relative links to surfaces the
//    pack does not ship, and issue/PR provenance links that rot.
//
// Fully-qualified https://github.com/forwardimpact/monorepo/blob/main/...
// links are sanctioned (canonical-protocol references) and do not match
// these rules. fit-* and coaligned-* skills are out of scope: they document
// their own published CLIs and legitimately name @forwardimpact packages and
// tool integrations. Only kata-* skills (plus the agent references) are
// scanned — see the glob in build().

const PATTERNS = [
  // --- Group 1: internal-only tooling ---
  {
    pattern: "\\bbun run ",
    reason: 'internal runner — say "the repository\'s <task> command"',
  },
  {
    pattern: "\\bbunx ",
    reason: "internal runner — invoke fit-* CLIs via npx",
  },
  {
    pattern: "\\bbun (install|pm|test|audit)\\b",
    reason: 'internal runner — say "the package manager\'s <task>"',
  },
  // `just` is also an adverb; match only command-shaped forms — backticked,
  // chained after &&, or alone on a line inside a fenced block.
  {
    pattern: "`just [a-z-]",
    reason: "internal runner — just recipes are internal-only",
  },
  {
    pattern: "&& just [a-z-]",
    reason: "internal runner — just recipes are internal-only",
  },
  {
    pattern: "^\\s*just [a-z][a-z-]*\\s*$",
    reason: "internal runner — just recipes are internal-only",
  },
  // --- Group 2: monorepo identifiers ---
  {
    pattern: "@forwardimpact/",
    reason: "workspace scope — use @<scope>/<pkg>",
  },
  {
    pattern: "websites/(fit|kata|coaligned|monorepo)\\b",
    reason: "internal site name — use websites/<site>",
  },
  {
    pattern: "repos/forwardimpact/monorepo",
    reason: "hardcoded repo path — use repos/{owner}/{repo}",
  },
  {
    pattern: "metrics/[a-z-]+/20[0-9]{2}",
    reason: "hardcoded metrics year — use {YYYY}",
  },
  {
    pattern:
      "\\b(bun\\.lockb?|package-lock\\.json|pnpm-lock\\.yaml|yarn\\.lock)\\b",
    reason: "package-manager lockfile name — use <lockfile>",
  },
  // Snapshots dated "as of" a real day rot the moment the source changes;
  // skills derive data live. Placeholder forms (YYYY-MM-DD) do not match.
  {
    pattern: "\\b20[0-9]{2}-[0-1][0-9]-[0-3][0-9]\\b",
    reason: "hardcoded date — derive the data live or use YYYY-MM-DD",
  },
  // --- Group 3: links broken in the published pack ---
  // The pack ships skills/kata-*/ and the agent profiles plus their
  // references, so relative links among them resolve in a consuming install.
  // Root TRUST.md and the fit-* skills (a separate pack) are not synced, so
  // relative links to them dangle. Guaranteed surfaces (CONTRIBUTING.md,
  // JTBD.md, KATA.md) stay relative — the consuming repo carries its own.
  // Links to this monorepo's issues and PRs are provenance that rots — the
  // skill must stand on its own.
  {
    pattern: "\\]\\((\\.\\./)+TRUST\\.md",
    reason: "TRUST.md is not shipped with the pack — use the full GitHub URL",
  },
  {
    pattern: "\\]\\((\\.\\./)+fit-",
    reason: "fit-* skills ship in a separate pack — use the full GitHub URL",
  },
  {
    pattern: "forwardimpact/monorepo/(issues|pull|discussions)/",
    reason: "issue/PR provenance rots — the skill must stand on its own",
  },
];

export default {
  name: "skill-genericity",

  build({ grep }) {
    return {
      subjects: {
        "skill-match": grep({
          patterns: PATTERNS,
          paths: [".claude/skills/", ".claude/agents/references/"],
          globs: [".claude/skills/kata-*/**", ".claude/agents/references/**"],
          caseSensitive: true,
          dedupe: (m) => `${m.raw}|${m.reason}`,
        }),
      },
    };
  },

  rules: ({ failAll }) => [
    failAll("skill-match", {
      id: "skills.monorepo-specific",
      message: (s) => `${s.text.trim()} — ${s.reason}`,
      hint: "published pack content (kata-* skills and agent references) must hold in a repo that installed the pack yesterday (.claude/skills/CLAUDE.md § Generic by design); narrow the rule in .coaligned/invariants/skill-genericity.rules.mjs only for a legitimate generic usage",
    }),
  ],
};
