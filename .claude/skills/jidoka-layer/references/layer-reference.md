# The layers, caps, and properties

Eight layers rise from most general (every contributor, every run) to most
specific (one pause point). Each layer has one job.

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

The repository's own identity conventions define the L1/L2 properties. The
layers a contributor edits day to day are L3–L7.

## L3 — agent profile

1. **Boundaries.** A profile defines scope and persona. It holds no steps.
   Procedures live in L5.
2. **One persona per profile.** Mixed personas blur voice and accountability.
3. **Minimal.** Every line loads on every run. Keep scope and routing only.
   Push the rest to L5 or L6.

## L4 — agent reference

1. **Declarative, cross-cutting.** Several agents share these protocols. If
   only one skill needs it, it belongs in that skill's `references/`.
2. **Independently correct.** Stale data is a distinct defect from a wrong
   profile.
3. **On-demand only.** It never auto-loads. If a profile always needs it, fold
   it into the profile.

## L5 — skill procedure

1. **Complete for its domain.** A contributor who follows only the procedure
   produces correct output.
2. **Imperative voice.** Write "Use X to do Y". Do not write "X can be used to
   do Y".
3. **Decisions.** The procedure carries sequence, rationale, and judgment
   calls. It holds no data. Push templates and tables to L6.
4. **Self-contained at invocation.** The procedure needs no external read to
   start. A contributor consults references mid-procedure. References are not
   prerequisites.

## L6 — skill reference

1. **Declarative.** A reference holds templates, worked examples, and lookup
   data. It never prescribes steps.
2. **Independently correct.** A stale reference is a different defect from a
   wrong procedure.
3. **On-demand only.** If the procedure always needs a reference, move it into
   the procedure.

## The boundary that matters most

L5 is procedural. L6 is declarative. L7 is verificational. "Wrong procedure",
"stale data", and "missing verification" are three different defects. Three
layers let a failed run point at one of them.
