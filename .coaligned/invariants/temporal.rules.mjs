// Flag temporal references embedded in code, docs, and tests. A "temporal"
// reference points to a transient artefact — a spec number, design number,
// plan number, GitHub issue, GitHub PR. Once the artefact is closed or
// superseded, the reference rots. Every comment, log message, or test label
// should stand on its own and explain WHY the code exists, not WHEN it landed.
//
// Out of scope: specs/, wiki/, benchmarks/, generated/, node_modules/, .git/.

import { resolve } from "node:path";
import { assertRgAvailable, rgMatches } from "./lib/rg.mjs";

const PATTERNS = [
  { pattern: "\\bspec[- ][0-9]{2,5}\\b" },
  { pattern: "\\bdesign[- ][0-9]{2,5}\\b" },
  { pattern: "\\bplan[- ][0-9]{2,5}\\b" },
  // Captured-trace fixtures replay real agent output whose result events
  // must stay byte-exact for token-accounting parity, so an issue number
  // inside one cannot be reworded away — exclude fixtures, keep the rule
  // on authored test code.
  // Widening this exclusion requires security review — see
  // CONTRIBUTING.md § Security.
  { pattern: "\\bissue[- ]?#?[0-9]{2,5}\\b", globs: ["!**/test/fixtures/**"] },
  // Loose patterns: test fixtures naturally include synthetic IDs that look
  // like cross-references ("(#42)", "PR #99"). Exclude **/test/** so the
  // checker keeps catching real temporal references in production code
  // without flagging assertion strings.
  {
    pattern: "\\b(pr|pull)[- ]?#[0-9]{2,5}\\b",
    globs: ["!**/test/**"],
  },
  { pattern: "\\bGH-[0-9]{2,5}\\b" },
  { pattern: "\\(#[0-9]{2,5}\\)", globs: ["!**/test/**"] },
  { pattern: "[[:space:]]#[0-9]{2,5}\\b", globs: ["!**/test/**"] },
  // Spec-artefact labels: success criteria (SC), priorities (P), and
  // findings (F) are numbered inside a spec's spec.md / plan / review. Once
  // the spec closes, "SC5" or "Foundation F1" in a comment points at nothing.
  // Match the uppercase label forms only (caseSensitive) so the lowercase
  // tokens that collide — patient fixture IDs (`p1`), latency percentiles
  // (`p50`/`p90`), CSS hex (`#f87171`), cert extensions (`.p12`) — never trip
  // the check.
  { pattern: "\\bSC[0-9]+\\b", caseSensitive: true },
  // The same label spelled out as a spec-section reference ("Spec § Success
  // Criteria row 8") rots when the spec closes, exactly like "SC8". Require
  // the capitalised "Success" (caseSensitive) so the generic prose noun in
  // the agent docs — "a spec with verifiable success criteria" — never trips;
  // only the section-label form does. Allow either case on the second word so
  // "Success criteria" is caught too.
  { pattern: "\\bSuccess [Cc]riteria\\b", caseSensitive: true },
  // P (priority) and F (finding) also serve as a legitimate, self-defined
  // triage vocabulary in the agent operating docs under .claude/ (the product
  // manager's P1/P2/P3 buckets, the storyboard P1/F4 placeholders) — those are
  // not references into a spec, so scope these two rules to everything else.
  { pattern: "\\bP[0-9]+\\b", caseSensitive: true, globs: ["!.claude/**"] },
  { pattern: "\\bF[0-9]+\\b", caseSensitive: true, globs: ["!.claude/**"] },
  // Kata experiments and obstacles are tracked as labeled GitHub issues that
  // close when the PDSA cycle ends, so "Exp 45" / "RE Exp 43" / "Obstacle 12"
  // rot the same way a raw issue number does. caseSensitive so prose like
  // "active experiments" or an "exp"-prefixed identifier never matches — only
  // the capitalised label-plus-number form does.
  {
    pattern: "\\b(Exp|Experiment|Obstacle)[- ]?[0-9]+\\b",
    caseSensitive: true,
  },
  // Agent-role initialisms used as a numbered shorthand for that agent's
  // experiments or findings (SE = staff/security engineer, RE = release
  // engineer, TW = technical writer, PM = product manager, IC = improvement
  // coach). None occur today; this guards against the shorthand creeping in.
  // Single-letter role forms (S#, T#) are deliberately omitted — they collide
  // with `S3`, `SHA-256`, type parameters, and similar legitimate tokens.
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
    // it is the operative value of a named constant — a date the code reads
    // at runtime, not a note about when something happened. Skip the
    // `const NAME = "YYYY-MM-DD"` declaration form; rot-prone prose dates
    // elsewhere on the line, or anywhere else, still trip.
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
  "!wiki/**",
  "!benchmarks/**",
  "!bun.lock",
  "!package-lock.json",
  "!*.lock",
  // This module carries the patterns themselves and would match them.
  "!.coaligned/invariants/temporal.rules.mjs",
];

export default {
  name: "temporal",

  build({ root }) {
    assertRgAvailable();
    const seen = new Set();
    const subjects = [];
    for (const rule of PATTERNS) {
      const matches = rgMatches({
        cwd: root,
        pattern: rule.pattern,
        globs: [...BASE_GLOBS, ...(rule.globs ?? [])],
        caseSensitive: rule.caseSensitive ?? false,
      });
      for (const m of matches) {
        if (rule.exclude && rule.exclude.test(m.raw)) continue;
        if (seen.has(m.raw)) continue;
        seen.add(m.raw);
        subjects.push({
          path: resolve(root, m.path),
          lineNo: m.lineNo,
          text: m.text,
        });
      }
    }
    return { subjects: { "temporal-match": subjects } };
  },

  rules: [
    {
      id: "temporal.reference",
      scope: "temporal-match",
      severity: "fail",
      check: () => ({}),
      message: (s) => `temporal reference: ${s.text.trim()}`,
      hint: "replace with a short, non-temporal WHY; for a false positive (CSS hex, HTML entity, runtime ID, opaque fixture ID), narrow the rule in .coaligned/invariants/temporal.rules.mjs",
    },
  ],
};
