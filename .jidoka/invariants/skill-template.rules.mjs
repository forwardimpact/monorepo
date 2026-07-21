// The kata-, jidoka-, and monorepo-pack skills follow the house style
// documented in .claude/skills/CLAUDE.md § House style: one template across
// every pack (descriptive Title Case H1, checklists near the top, a
// `## Process` flow section with `Step N:` headings, `## Documentation`
// last), American spelling with `behaviour` as the only British domain term,
// and bare CLI invocations.
//
// Division of labor with skill-genericity.rules.mjs: that module owns
// monorepo leakage and the bare-CLI rule for kata-* skills and the agent
// references; this module owns the template structure and spelling for all
// three packs, plus the bare-CLI rule for the jidoka-* and monorepo-*
// packs genericity does not scan. fit-* skills are out of scope for both —
// they have not been converged on the template.

const PACK_SKILL =
  /^\.claude\/skills\/(kata|jidoka|monorepo)-[^/]+\/SKILL\.md$/;

const STYLE_PATTERNS = [
  {
    pattern: "judgement",
    reason: "American spelling — write judgment",
  },
  {
    pattern: "labelled",
    reason: "American spelling — write labeled",
  },
  {
    pattern: "summaris(e|ing|ed)",
    reason: "American spelling — write summarize",
  },
  {
    pattern: "materialis(e|ing|ed)",
    reason: "American spelling — write materialize",
  },
  {
    pattern: "organis(e|ing|ation)",
    reason: "American spelling — write organize",
  },
];

const NPX_PATTERNS = [
  {
    pattern: "\\bnpx (fit-|kata-)",
    reason: "CLIs are invoked bare — drop the npx prefix",
  },
  {
    pattern: "\\b(npx|bunx) jidoka\\b",
    reason:
      "resolves the squatted third-party jidoka package — invoke the installed binary bare, or npx @forwardimpact/jidoka",
  },
];

// Blank out fenced code blocks, preserving line numbers, so shell comments
// and markdown examples inside fences cannot pass for headings.
const stripFences = (text) => {
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
};

export default {
  name: "skill-template",

  build({ grep, scan }) {
    const skills = scan({
      dirs: [".claude/skills"],
      match: (n) => n === "SKILL.md",
      read: true,
    })
      .filter((s) => PACK_SKILL.test(s.rel))
      .map((s) => ({
        ...s,
        id: s.rel.split("/")[2],
        lines: stripFences(s.text).split("\n"),
      }));

    return {
      subjects: {
        "skill-file": skills,
        "style-match": [
          ...grep({
            patterns: STYLE_PATTERNS,
            paths: [".claude/skills/"],
            globs: [
              ".claude/skills/kata-*/**",
              ".claude/skills/jidoka-*/**",
              ".claude/skills/monorepo-*/**",
            ],
            caseSensitive: true,
            dedupe: (m) => `${m.raw}|${m.reason}`,
          }),
          ...grep({
            patterns: NPX_PATTERNS,
            paths: [".claude/skills/"],
            globs: [
              ".claude/skills/jidoka-*/**",
              ".claude/skills/monorepo-*/**",
            ],
            caseSensitive: true,
            dedupe: (m) => `${m.raw}|${m.reason}`,
          }),
        ],
      },
    };
  },

  rules: ({ failAll }) => [
    {
      id: "skills.h1-descriptive",
      scope: "skill-file",
      severity: "fail",
      check: (s) => {
        const i = s.lines.findIndex((l) => /^# \S/.test(l));
        if (i < 0) return { lineNo: 1, detail: "no H1 heading" };
        const title = s.lines[i].slice(2).trim();
        return title === s.id
          ? { lineNo: i + 1, detail: `H1 is the skill id (${s.id})` }
          : null;
      },
      message: (s, item) => item.detail,
      hint: "the H1 is a descriptive Title Case title, not the skill id (.claude/skills/CLAUDE.md § House style)",
    },
    {
      id: "skills.step-heading-style",
      scope: "skill-file",
      severity: "fail",
      check: (s) => {
        const bad = [];
        s.lines.forEach((l, i) => {
          if (/^### Step\b/.test(l) && !/^### Step \d+[a-z]?: \S/.test(l))
            bad.push({ lineNo: i + 1, detail: l.trim() });
        });
        return bad.length ? bad : null;
      },
      message: (s, item) => item.detail,
      hint: "step headings read `### Step N: Title` — a colon after the number, never an em dash",
    },
    {
      id: "skills.process-section",
      scope: "skill-file",
      severity: "fail",
      when: (s) => s.lines.some((l) => /^### Step \d/.test(l)),
      check: (s) => {
        const problems = [];
        if (!s.lines.some((l) => /^## Process$/.test(l)))
          problems.push({
            detail: "step headings without a ## Process section",
          });
        const procedure = s.lines.findIndex((l) => /^## Procedure$/.test(l));
        if (procedure >= 0)
          problems.push({
            lineNo: procedure + 1,
            detail: "## Procedure — the flow section is ## Process",
          });
        const doneWhen = s.lines.findIndex((l) => /^## Done When$/.test(l));
        if (doneWhen >= 0)
          problems.push({
            lineNo: doneWhen + 1,
            detail: "## Done When — its checklist belongs under ## Checklists",
          });
        return problems.length ? problems : null;
      },
      message: (s, item) => item.detail,
      hint: "the flow section is ## Process; Done When dissolved into ## Checklists (.claude/skills/CLAUDE.md § House style)",
    },
    {
      id: "skills.checklists-before-process",
      scope: "skill-file",
      severity: "fail",
      check: (s) => {
        const checklist = s.lines.findIndex((l) =>
          /<(read_do|do_confirm)_checklist\b/.test(l),
        );
        const process = s.lines.findIndex((l) => /^## Process$/.test(l));
        return checklist >= 0 && process >= 0 && checklist > process
          ? {
              lineNo: checklist + 1,
              detail: "checklist appears after ## Process",
            }
          : null;
      },
      message: (s, item) => item.detail,
      hint: "checklists sit near the top of the skill, before the ## Process section",
    },
    {
      id: "skills.documentation-last",
      scope: "skill-file",
      severity: "fail",
      check: (s) => {
        const doc = s.lines.findIndex((l) => /^## Documentation$/.test(l));
        if (doc < 0) return null;
        const later = s.lines.findIndex((l, i) => i > doc && /^## /.test(l));
        return later >= 0
          ? {
              lineNo: later + 1,
              detail: `${s.lines[later].trim()} follows ## Documentation`,
            }
          : null;
      },
      message: (s, item) => item.detail,
      hint: "## Documentation is the final section of a skill",
    },
    failAll("style-match", {
      id: "skills.house-style",
      message: (s) => `${s.text.trim()} — ${s.reason}`,
      hint: "published skills share one voice (.claude/skills/CLAUDE.md § House style); narrow the rule in .jidoka/invariants/skill-template.rules.mjs only for a legitimate usage",
    }),
  ],
};
