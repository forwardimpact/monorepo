# The layers, caps, and properties

Eight layers, ascending from most general (every contributor, every run) to
most specific (one pause point). Each has one job.

| Layer | What it is | Cap | Loaded |
| --- | --- | --- | --- |
| L0 system prompt | Harness mechanics: turns, tool calls, completion | (harness-owned) | once per session |
| L1 root CLAUDE.md | Project identity | ≤ 192 lines | auto, every run |
| L1 subdir CLAUDE.md | Directory-local conventions | ≤ 128 lines | on demand |
| L2 CONTRIBUTING.md / JTBD.md | Standards and jobs | ≤ 320 lines | on demand |
| L3 agent profile | Persona, voice, routing, scope | ≤ 72 lines | auto, every run |
| L4 agent reference | Cross-cutting protocol | ≤ 192 lines | on demand |
| L5 SKILL.md | One domain's procedure | ≤ 192 lines | auto, per skill |
| L6 skill reference | Templates, examples, lookup data | ≤ 128 lines | on demand |
| L7 checklist block | Binary verification | ≤ 9 items | auto, per skill |

L1/L2 properties are defined by the repository's own identity conventions. The
layers a contributor edits day to day are L3–L7.

## L3 — agent profile

1. **Boundaries, not steps.** Defines scope and persona; procedures live in L5.
2. **One persona per profile.** Mixing personas blurs voice and accountability.
3. **Minimal.** Every line loads on every run. Scope and routing only; push the
   rest to L5 or L6.

## L4 — agent reference

1. **Declarative, cross-cutting.** Protocols shared by several agents. If only
   one skill needs it, it belongs in that skill's `references/`.
2. **Independently correct.** Stale data is a distinct defect from a wrong
   profile.
3. **On-demand only.** Never auto-loaded. If a profile always needs it, fold it
   into the profile.

## L5 — skill procedure

1. **Complete for its domain.** A contributor following only the procedure
   produces correct output.
2. **Imperative voice.** "Use X to do Y", not "X can be used to do Y".
3. **Decision-making, not data.** Sequencing, rationale, judgment calls. Push
   templates and tables to L6.
4. **Self-contained at invocation.** No external reads required to begin;
   references are consulted mid-procedure, not as prerequisites.

## L6 — skill reference

1. **Declarative, not procedural.** Templates, worked examples, lookup data.
2. **Independently correct.** A stale reference is a different defect from a
   wrong procedure.
3. **On-demand only.** If a reference is always needed, move it into the
   procedure.

## The boundary that matters most

L5 is procedural, L6 is declarative, L7 is verificational. "Wrong procedure",
"stale data", and "missing verification" are three different defects. Keeping
them in three layers is what lets a failed run point at one of them.
