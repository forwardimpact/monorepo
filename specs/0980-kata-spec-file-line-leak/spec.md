# Spec 0980 — kata-spec: forbid file:line citations in spec bodies

## Problem

The `kata-spec/write-feature-spec` task family in `benchmarks/kata-skills`
(introduced by spec
[#890](../890-kata-skills-benchmark-family/spec.md)) is producing recurrent
stochastic failures on the `no-how-leak` rule. Agent-generated `spec.md`
bodies cite evidence with `file:line` pointers (e.g.
"`src/foo.ts:42`"), and the rubric's HOW-leak regex flags those. Most
recent occurrence: the post-merge run for PR #944 reported 3/5 pass and
2/5 fail on `no-how-leak`. Issue
[#945](https://github.com/forwardimpact/monorepo/issues/945) records the
diagnosis. The pattern is structurally reproducible: the citation
impulse is a feature of how agents back evidence, not an artefact of a
single run.

The `kata-spec` skill (`.claude/skills/kata-spec/SKILL.md`) already
forbids implementation HOW in three places — the READ-DO checklist
("No implementation details in the spec — file paths, function
signatures, and code patterns belong in the plan"), the "Writing a Spec"
subsection ("No HOW. Name what each component does, not which mechanism
implements it"), and the DO-CONFIRM checklist ("No implementation
details have leaked in (HOW belongs in the plan)"). The READ-DO bullet
names "file paths" but only as one item in a flat list; the other two
loci are fully abstract. None calls out the `file:line` citation shape
as a named failure mode the spec writer should pattern-match against.

The agent's failure mode is concrete: writing the Problem section, it
reaches for the most evidentiary citation shape it knows — a path and a
line number — and the no-HOW rule, stated abstractly, does not override
the citation impulse. The benchmark is catching a real spec-quality
risk: a published `kata-spec` skill that ships with this leak vector
produces specs whose Problem evidence cannot be reused once the cited
lines move. The blast radius is every downstream agent installing
`forwardimpact/kata-skills`.

Spec [#890](../890-kata-skills-benchmark-family/spec.md) § Out-of-scope
is explicit that v1 of the kata-skills benchmark "reports pass@k; merge
decisions on kata-skill PRs remain reviewer judgement. Promoting any
number to a hard merge gate requires baseline-noise calibration that v1
does not yet have." The fix belongs on the skill-content side, not the
rubric or threshold side.

## Personas and Job

The hire is **Platform Builders**, against the Big Hire "Help me prove
whether agent changes improved outcomes with reproducible evidence"
([JTBD.md](../../JTBD.md) § Platform Builders: Evaluate and Improve
Agents). The benchmark introduced by spec #890 is the signal mechanism;
tightening `kata-spec` removes a known noise source from that signal so
pack-quality measurement becomes more reliable.

The direct artefact-change beneficiary is every consumer of
`forwardimpact/kata-skills` — the autonomous development teams that hire
the Kata product family ([CLAUDE.md](../../CLAUDE.md) § Teams Using
Agents) — who inherit cleaner spec bodies whenever they run the
`kata-spec` skill. JTBD.md does not yet enumerate that population as a
top-level persona, so Platform Builders is the closest JTBD-named hire
and Kata consumers are the named downstream beneficiary.

## Scope

### In scope

| Component | What changes |
|---|---|
| `.claude/skills/kata-spec/SKILL.md` — "Writing a Spec" subsection | The "No HOW" bullet is extended to identify `file:line` citations by name as a Problem-evidence anti-pattern, contrasted against the entity-or-behaviour-name shape the bullet already expects. The presentation form (example pair, callout, inline prose) is a design choice. |
| `.claude/skills/kata-spec/SKILL.md` — DO-CONFIRM checklist | The existing "No implementation details have leaked in (HOW belongs in the plan)" bullet is amended so the bullet text itself names the `file:line` shape as a checked-against instance, while preserving the abstract HOW-belongs-in-the-plan framing as the umbrella rule. The change is in-bullet (the existing bullet is extended), not a sibling bullet, so the locus is unambiguous. |

### Out of scope, deferred

- **READ-DO checklist edit.** The READ-DO bullet already lists "file
  paths" as one of three implementation-detail kinds; further tightening
  is duplicative for this spec.
- **Rubric or threshold tuning on the benchmark side.** Spec #890
  deferred this to a later spec once v1 has produced enough runs to
  characterise baseline-noise. This spec does not change the benchmark,
  its rubric, or its threshold.
- **Outcome-signal success criterion.** Spec #890 § Out-of-scope is
  explicit that v1 pass@k is not yet a merge gate or threshold target;
  this spec inherits that deferral and verifies only the artefact
  change, not downstream pass-rate movement.
- **Other `no-how-leak` failure modes.** Function signatures, full-path
  imports, code-fenced implementation snippets, and other HOW-leak
  vectors beyond file:line are not addressed; each gets its own
  follow-up spec when observed.
- **The same change on `kata-design` or `kata-plan` skills.** Those
  skills permit (and in `kata-plan`'s case require) precise citations;
  the file:line prohibition is spec-specific.
- **Re-running historical benchmark records.** The next scheduled or
  PR-triggered run picks up the change through the normal staging path
  defined by spec #890.

## Success Criteria

| Claim | Verification |
|---|---|
| The "Writing a Spec" subsection's "No HOW" bullet names `file:line` citations as a Problem-evidence anti-pattern. | Test: `grep -n 'file:line' .claude/skills/kata-spec/SKILL.md` returns at least one match whose line falls inside the "Writing a Spec" subsection's "No HOW" bullet (the bullet that today reads "**No HOW.** Name what each component does …"). The match positions the `file:line` shape as a thing not to do, contrasted against the entity-or-behaviour-name shape the bullet already names. |
| The DO-CONFIRM "No HOW" bullet names `file:line` citations within its own bullet text. | Test: `grep -n 'file:line' .claude/skills/kata-spec/SKILL.md` returns at least one match whose line falls inside the DO-CONFIRM bullet that today reads "No implementation details have leaked in (HOW belongs in the plan)." The bullet has been extended in place rather than supplemented with a sibling bullet, and the abstract HOW-belongs-in-the-plan framing is retained. |
| The diff is bounded to the two named bullets and adds no new HOW-leak prohibitions. | Test: `git diff main...HEAD -- .claude/skills/kata-spec/SKILL.md` touches only the "Writing a Spec" subsection's "No HOW" bullet and the DO-CONFIRM "No implementation details have leaked in" bullet; the added text at each locus introduces only the `file:line` shape and does not name function signatures, full-path imports, code fences, or other HOW-leak vectors deferred by this spec. All other parts of SKILL.md (frontmatter, "When to Use" section, READ-DO checklist, Directory Structure section, the rest of "Writing a Spec" including the "Form follows content" paragraph, Approval, Reviewing a Spec, Process, Memory: what to record) are unmodified. |
| No new release plumbing is introduced. | Test: `git diff --name-only main...HEAD` lists only `specs/0980-kata-spec-file-line-leak/*` and `.claude/skills/kata-spec/SKILL.md`; no workflow files, no skill-pack publish configuration, and no release tooling are touched. The existing `forwardimpact/kata-skills` sync on push to `main` is the only publication path. |

— Product Manager 🌱
