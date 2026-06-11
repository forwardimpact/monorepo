#!/usr/bin/env node
// Flag temporal references embedded in code, docs, and tests. A "temporal"
// reference points to a transient artefact — a spec number, design number,
// plan number, GitHub issue, GitHub PR. Once the artefact is closed or
// superseded, the reference rots. Every comment, log message, or test label
// should stand on its own and explain WHY the code exists, not WHEN it landed.
//
// Out of scope: specs/, wiki/, benchmarks/, generated/, node_modules/, .git/.
//
// Usage: node scripts/check-temporal.mjs
// Wired into: bun run invariants (root package.json).

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rules = [
  { pattern: "\\bspec[- ][0-9]{2,5}\\b" },
  { pattern: "\\bdesign[- ][0-9]{2,5}\\b" },
  { pattern: "\\bplan[- ][0-9]{2,5}\\b" },
  { pattern: "\\bissue[- ]?#?[0-9]{2,5}\\b" },
  // Loose patterns: test fixtures naturally include synthetic IDs that look
  // like cross-references ("(#42)", "PR #99"). Exclude **/test/** so the
  // checker keeps catching real temporal references in production code
  // without flagging assertion strings.
  {
    pattern: "\\b(pr|pull)[- ]?#?[0-9]{2,5}\\b",
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
    pattern: "\\b20[0-9]{2}-[0-1][0-9]-[0-3][0-9]\\b",
    globs: ["*.js", "!**/test/**", "!**/*synthetic*/**"],
    exclude: /version|e\.g\.|example/i,
  },
];

const baseGlobs = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  "!wiki/**",
  "!benchmarks/**",
  "!bun.lock",
  "!package-lock.json",
  "!*.lock",
  "!scripts/check-temporal.mjs",
];

const rgCheck = spawnSync("rg", ["--version"], { stdio: "pipe" });
if (rgCheck.status !== 0) {
  process.stderr.write(
    "error: ripgrep (rg) is required for check-temporal.mjs\n",
  );
  process.exit(2);
}

const allMatches = [];

for (const rule of rules) {
  const args = [
    "--hidden",
    "--no-messages",
    "--line-number",
    "--color",
    "never",
  ];
  // Most rules match prose case-insensitively ("PR", "GH-", "spec"); the
  // spec-artefact label rules opt into case-sensitivity to dodge lowercase
  // homographs.
  if (!rule.caseSensitive) args.push("-i");
  for (const g of baseGlobs) args.push("--glob", g);
  if (rule.globs) {
    for (const g of rule.globs) args.push("--glob", g);
  }
  args.push("-e", rule.pattern, ".");

  const { stdout } = spawnSync("rg", args, {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf-8",
  });

  let lines = (stdout || "").split("\n").filter(Boolean);
  if (rule.exclude) lines = lines.filter((l) => !rule.exclude.test(l));
  allMatches.push(...lines);
}

if (allMatches.length > 0) {
  const unique = [...new Set(allMatches)].sort();
  process.stderr.write(
    "error: temporal references found — replace each with a " +
      "short, non-temporal description that explains WHY the code is there.\n\n",
  );
  process.stderr.write(unique.join("\n") + "\n\n");
  process.stderr.write(
    "If a match is a false positive (CSS hex, HTML entity, runtime ID, " +
      "opaque fixture ID), narrow the rule in scripts/check-temporal.mjs " +
      "rather than leaving the temporal reference in place.\n",
  );
  process.exit(1);
}

console.log("check-temporal: no temporal references found");
