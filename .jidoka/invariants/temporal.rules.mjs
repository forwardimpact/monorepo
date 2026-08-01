// Flag temporal references embedded in code, docs, and tests. A "temporal"
// reference points to a transient artefact: a spec number, design number,
// plan number, GitHub issue, GitHub PR. Once the artefact is closed or
// superseded, the reference rots. Every comment, log message, or test label
// should stand on its own. It should explain WHY the code exists. It should
// not record WHEN it landed.
//
// Out of scope: specs/, references/, wiki/, benchmarks/, generated/,
// node_modules/, .git/.

const PATTERNS = [
  { pattern: "\\bspec[- ][0-9]{2,5}\\b" },
  { pattern: "\\bdesign[- ][0-9]{2,5}\\b" },
  { pattern: "\\bplan[- ][0-9]{2,5}\\b" },
  // Captured-trace fixtures replay real agent output whose result events
  // must stay byte-exact for token-accounting parity. So an author cannot
  // reword an issue number inside one. Exclude fixtures. Keep the rule on
  // authored test code.
  // Widen this exclusion only after a security review. See
  // CONTRIBUTING.md § Security.
  { pattern: "\\bissue[- ]?#?[0-9]{2,5}\\b", globs: ["!**/test/fixtures/**"] },
  // Loose patterns: test fixtures naturally include synthetic IDs that look
  // like cross-references ("(#42)", "PR #99"). Exclude **/test/** so the
  // checker still catches real temporal references in production code. Then
  // it does not flag assertion strings.
  {
    pattern: "\\b(pr|pull)[- ]?#[0-9]{2,5}\\b",
    globs: ["!**/test/**"],
  },
  { pattern: "\\bGH-[0-9]{2,5}\\b" },
  { pattern: "\\(#[0-9]{2,5}\\)", globs: ["!**/test/**"] },
  { pattern: "[[:space:]]#[0-9]{2,5}\\b", globs: ["!**/test/**"] },
  // Spec-artefact labels: a spec's spec.md, plan, and review number the
  // success criteria (SC), the priorities (P), and the findings (F). Once
  // the spec closes, "SC5" or "Foundation F1" in a comment points at nothing.
  // Match the uppercase label forms only (caseSensitive). Then the lowercase
  // tokens that collide never trip the check: patient fixture IDs (`p1`),
  // latency percentiles (`p50`/`p90`), CSS hex (`#f87171`), and cert
  // extensions (`.p12`).
  { pattern: "\\bSC[0-9]+\\b", caseSensitive: true },
  // The same label spelled out as a spec-section reference ("Spec § Success
  // Criteria row 8") rots when the spec closes, exactly like "SC8". Require
  // the capitalised "Success" (caseSensitive). Then the generic prose noun in
  // the agent docs ("a spec with verifiable success criteria") never trips
  // the check. Only the section-label form trips it. Allow either case on the
  // second word so the check catches "Success criteria" too.
  { pattern: "\\bSuccess [Cc]riteria\\b", caseSensitive: true },
  // P (priority) and F (finding) also serve as a legitimate, self-defined
  // triage vocabulary in the agent operation docs under .claude/ (the product
  // manager's P1/P2/P3 buckets, the storyboard P1/F4 placeholders). Those are
  // not references into a spec. So scope these two rules to everything else.
  { pattern: "\\bP[0-9]+\\b", caseSensitive: true, globs: ["!.claude/**"] },
  { pattern: "\\bF[0-9]+\\b", caseSensitive: true, globs: ["!.claude/**"] },
  // Labeled GitHub issues track Kata experiments and obstacles. Those issues
  // close when the PDSA cycle ends. So "Exp 45" / "RE Exp 43" / "Obstacle 12"
  // rot the same way a raw issue number does. Use caseSensitive so prose like
  // "active experiments" or an "exp"-prefixed identifier never matches. Only
  // the capitalised label-plus-number form matches.
  {
    pattern: "\\b(Exp|Experiment|Obstacle)[- ]?[0-9]+\\b",
    caseSensitive: true,
  },
  // Agent-role initialisms serve as a numbered shorthand for that agent's
  // experiments or findings (SE = staff/security engineer, RE = release
  // engineer, TW = technical writer, PM = product manager, IC = improvement
  // coach). None occur today. This rule guards against the shorthand before
  // it creeps in. This rule deliberately omits the single-letter role forms
  // (S#, T#). They collide with `S3`, `SHA-256`, type parameters, and similar
  // legitimate tokens.
  { pattern: "\\b(SE|RE|TW|PM|IC)[0-9]+\\b", caseSensitive: true },
  {
    pattern:
      "\\b(introduced|added|landed|shipped|removed) in (spec|design|plan|PR|issue)\\b",
  },
  { pattern: "\\bas of (spec|design|plan|PR|issue) [0-9]+\\b" },
  { pattern: "\\bpre-migration\\b" },
  { pattern: "\\bduring spec [0-9]+ migration\\b" },
  {
    // An ISO date in source is a temporal reference ("landed 2026-…") unless
    // it is the operative value of a named constant. Such a date is one the
    // code reads at runtime. It is not a note about when something happened.
    // Skip the `const NAME = "YYYY-MM-DD"` declaration form. Rot-prone prose
    // dates elsewhere on the line, or anywhere else, still trip.
    pattern: "\\b20[0-9]{2}-[0-1][0-9]-[0-3][0-9]\\b",
    globs: ["*.js", "!**/test/**", "!**/*synthetic*/**"],
    exclude:
      /version|e\.g\.|example|const\s+[A-Z0-9_]+\s*=\s*"20[0-9]{2}-[0-1][0-9]-[0-3][0-9]"/i,
  },
];

const BASE_GLOBS = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  // Reference specs for external-repo implementations (references/*) are
  // spec-shaped docs that stay current. They cite prerequisite specs, SHAs,
  // dates, and version pins by nature. They are out of scope like specs/.
  "!references/**",
  "!wiki/**",
  "!benchmarks/**",
  "!bun.lock",
  "!package-lock.json",
  "!*.lock",
  // This module carries the patterns themselves and would match them.
  "!.jidoka/invariants/temporal.rules.mjs",
  // Vendored, self-contained browser overlay shipped verbatim into user KBs.
  // Its inline CSS hex colours (` #000`, ` #111`) trip the space-prefixed
  // numeric pattern. It is not authored monorepo source where references rot.
  "!products/outpost/templates/.claude/skills/deck-review/assets/**",
  // The collision-ledger guide shows example CLI output whose anchor ids
  // (` #97`, ` #44`) are runtime identifiers. They are not issue references.
  // They trip the space-prefixed numeric pattern.
  "!websites/fit/docs/libraries/predictable-team/collision-ledger/index.md",
  // Co-located action sources are byte-faithful projections of their sibling
  // repos, mirrored here verbatim. Their READMEs cross-reference the
  // siblings' own history. A reword would diverge the projection. So they are
  // out of scope like specs/ and benchmarks/.
  "!products/gemba/actions/**",
  "!products/kata/actions/**",
];

export default {
  name: "temporal",

  build({ grep }) {
    return {
      subjects: {
        "temporal-match": grep({
          patterns: PATTERNS,
          globs: BASE_GLOBS,
          dedupe: true,
        }),
      },
    };
  },

  rules: ({ failAll }) => [
    failAll("temporal-match", {
      id: "temporal.reference",
      message: (s) => `temporal reference: ${s.text.trim()}`,
      hint: "replace with a short, non-temporal WHY. For a false positive (CSS hex, HTML entity, runtime ID, opaque fixture ID), narrow the rule in .jidoka/invariants/temporal.rules.mjs",
    }),
  ],
};
