# Co-Aligned Instruction Architecture Standard

> "The volume and complexity of what we know has exceeded our individual
> ability to deliver its benefits correctly, safely, or reliably."
>
> — Atul Gawande, _The Checklist Manifesto_

This standard defines the layered instruction architecture for creating aligned
coding agents. It builds on the repository structure — see
[MONOREPO.md](MONOREPO.md) for the top-level directories, root files, and the
JTBD entry structure and tagging convention this standard assumes.

It draws on two well-publicized ideas:

1. **Jobs To Be Done** (Christensen, Moesta) — agents align to the progress
   each persona seeks in specific circumstances, not to feature lists. See
   [JTBD.md](JTBD.md).
2. **The Checklist Manifesto** (Gawande) — complex work fails not from
   ignorance but from inattention under load. Structured instructions ensure
   existing knowledge is consistently applied — by humans and agents alike.

Together they answer _what_ agents align to (the jobs) and _how_ alignment
holds under load (the layered instruction architecture). The more expert the
contributor, the more this matters: beginners follow procedures because they
must; experts skip them because they think they don't need to.

## The Layers

Instructions span seven layers, ascending from most general (every contributor,
every run) to most specific (one pause point). Each layer has one job. A defect
in one layer is a different class of problem from a defect in another, and
trace attribution depends on the separation.

0. **System prompt** — harness mechanics: turns, tool calls, completion signal.
1. **CLAUDE.md** — project identity. See [MONOREPO.md](MONOREPO.md).
2. **CONTRIBUTING.md** & **JTBD.md** — contribution standards and jobs. See
   [MONOREPO.md](MONOREPO.md).
3. **Agent profile** — persona, voice, skill routing, scope constraints.
4. **Skill procedure (SKILL.md)** — decision-making, sequencing, rationale.
5. **Skill references (`references/`)** — data the procedure consults:
   templates, worked examples, invariant tables, lookup data.
6. **Checklists** — binary verification at pause points, no explanation. In
   SKILL.md (domain) or CONTRIBUTING.md (universal).

L4/L5/L6 share a skill folder but serve different concerns: L4 is _procedural_,
L5 is _declarative_, L6 is _verificational_. Trace attribution requires the
separation — "wrong procedure" is a different class of defect from "stale data"
or "missing verification."

### Layer Rules

- No layer restates another. When two layers mention the same tool, separate by
  voice: L0 describes ("ToolX sends a message"), L4 directs ("Use ToolX to
  deliver the report").
- Contributors follow the most specific layer — a complete skill procedure makes
  system-level tool descriptions invisible.
- CLAUDE.md orients (what, who, where); CONTRIBUTING.md governs (invariants,
  quality commands, policies); domain procedures live in skills.
- Profiles define boundaries; procedures define steps; references supply data;
  checklists verify steps.
- A checklist item must never teach. If an item needs explanation, the procedure
  above it is incomplete.

## L0 — System Prompt

Loaded once per session by the harness — Claude Code's own prompt for
interactive runs or `libeval` prompt for agent workflows.

### Properties of Good System Prompts

1. **Mechanics only.** Turns, tool calls, completion signalling. No domain
   knowledge, no project context.
2. **Short direct sentences.** Minimal dashes, semicolons, or mid-sentence
   interruptions. One idea per sentence.
3. **Harness-specific.** Each runtime supplies its own; contributors never edit
   these directly.
4. **Invisible downstream.** The most specific layer overrides. A system prompt
   should never compete with a skill procedure.

## L1 — Project Identity (CLAUDE.md)

Auto-loaded via `settingSources: ["project"]`. Orients every contributor on
every run. Properties of a good `CLAUDE.md` are defined upstream in
[MONOREPO.md](MONOREPO.md).

## L2 — Contribution Standards & Jobs (CONTRIBUTING.md, JTBD.md)

Read on demand, not auto-loaded. Properties of `CONTRIBUTING.md` and the JTBD
entry structure are defined upstream in [MONOREPO.md](MONOREPO.md).

## L3 — Agent Profile

Auto-loaded every run. Defines the agent's persona, voice, skill routing, and
scope constraints.

### Properties of Good Agent Profiles

1. **Boundaries, not steps.** Defines scope and persona — task procedures belong
   in L4.
2. **One persona per profile.** Mixing personas creates ambiguity about voice,
   scope, and accountability.
3. **Minimal.** Every line loads on every run. Include scope constraints and
   skill routing; push everything else to L4 or L5.

### Agent References

Read on demand when a profile or procedure cites them. Co-located in
`.claude/agents/references/<name>.md`. Same declarative role as L5 skill
references but shared across agents — cross-cutting protocols (memory,
coordination, approval) that no single skill owns.

1. **Declarative, cross-cutting.** Protocols and tables shared by multiple
   agents. If only one skill consults it, put it in that skill's `references/`.
2. **Independently correct.** Stale data is a distinct defect class from a
   wrong profile or procedure.
3. **On-demand only.** Never auto-loaded. If a profile always needs the
   content, fold it into the profile or the calling skill.

## L4 — Skill Procedure (SKILL.md)

Auto-loaded per skill invocation. The procedure is the complete instruction set
for one domain.

### Properties of Good Skill Procedures

1. **Complete for its domain.** A contributor following only the procedure
   produces correct output — no tribal knowledge required.
2. **Imperative voice.** Directs action ("Use X to do Y"), not describes
   capability ("X can be used to do Y").
3. **Decision-making, not data.** Sequencing, rationale, and judgment calls.
   Push templates, examples, and data tables to L5.
4. **Self-contained at invocation.** Auto-loaded, no external reads required to
   begin work. References are consulted mid-procedure, not prerequisites.

## L5 — Skill References

Read on demand when the procedure calls for them. Co-located in
`references/<name>.md` or `scripts/<name>.sh|.mjs`.

### Properties of Good References

1. **Declarative, not procedural.** Templates, worked examples, invariant
   tables, lookup data. Prescribing steps belongs in L4.
2. **Independently correct.** A stale reference is a different defect class from
   a wrong procedure — trace attribution requires the separation.
3. **On-demand only.** Never auto-loaded. If a reference is always needed, its
   content should move into the procedure.

## L6 — Checklists

Binary verification at pause points. Two types gate natural pause points; using
the wrong type at the wrong moment undermines the checklist's purpose.

**READ-DO — Entry Gates.** Read each item, then do it. Use before work begins —
when the contributor needs to internalize constraints before the first line.
Steps are sequential; missing any one sends work in the wrong direction.

**DO-CONFIRM — Exit Gates.** Do from memory, then pause and confirm every item.
Use at natural pause points — before a commit, merge, or release. Items are
independent checks; skilled contributors work fluidly, not interrupted mid-flow.

| Moment                   | Type       | Purpose                      |
| ------------------------ | ---------- | ---------------------------- |
| Before starting work     | READ-DO    | Load constraints into memory |
| Before crossing boundary | DO-CONFIRM | Verify nothing was missed    |

The boundary with L4 is strict: if a contributor needs an item to _learn_ what
to do, it belongs in the procedure; if it only confirms a known step was done,
it belongs in the checklist.

### Properties of Good Checklists

Drawing from Gawande's findings:

1. **Goal statement.** Every checklist begins with a stated goal — the outcome
   it protects. Without a goal, compliance becomes mechanical box-checking.
2. **5–7 items.** Working memory limits. Beyond 7 items, contributors skip
   entries or treat the list as formality.
3. **Precise.** Each item is a single, unambiguous action or verification. Two
   contributors should interpret each item the same way.
4. **Killer items only.** Every item addresses a failure mode that has actually
   occurred or is highly likely. A list full of obvious steps wastes attention.
5. **Action or verification, never explanation.** A verb phrase, not a
   paragraph. If it needs explanation, the contributor needs training.
6. **One checklist, one moment.** Tied to a single pause point. The pause point
   must be natural — artificial ones get skipped.
7. **Tested and revised.** Use it, observe what still goes wrong, revise. A
   stale checklist trains contributors to treat checklists as noise.

### Tagging Convention

Wrap each checklist in a semantic tag encoding its type and goal:

```markdown
<read_do_checklist goal="Internalize constraints before writing code">

- [ ] First constraint to internalize before starting.
- [ ] Second constraint.

</read_do_checklist>
```

```markdown
<do_confirm_checklist goal="Verify completeness before committing">

- [ ] First verification to confirm before proceeding.
- [ ] Second verification.

</do_confirm_checklist>
```

Discover checklists from anywhere in the repo:

```sh
rg '<read_do_checklist'     # entry gates — read each item, then do it
rg '<do_confirm_checklist'  # exit gates — do from memory, then confirm
```

Keep the full opening tag on one line within 74 characters so `rg` output stays
coherent.

## Length and Loading

Auto-loaded layers consume context on every run; keep them tight. Limits
enforced by `coaligned instructions` (see `libraries/libcoaligned/`):

| Layer                        | Target      | Loaded           |
| ---------------------------- | ----------- | ---------------- |
| L1 root CLAUDE.md            | ≤ 192 lines | auto             |
| L1 subdir CLAUDE.md          | ≤ 128 lines | on demand        |
| L2 CONTRIBUTING.md & JTBD.md | ≤ 256 lines | on demand        |
| L3 Agent profile             | ≤ 72 lines  | auto (every run) |
| L3 Agent reference           | ≤ 192 lines | on demand        |
| L4 SKILL.md                  | ≤ 192 lines | auto (per skill) |
| L5 Skill reference file      | ≤ 128 lines | on demand        |
| L6 Checklist (per block)     | ≤ 9 items   | auto (per skill) |

The root `CLAUDE.md` carries project identity and is auto-loaded every run.
Subdirectory `CLAUDE.md` files are read on demand when work enters that
directory — they extend the root with directory-local conventions and must
stay tight so they layer cleanly. L1 subdir is capped at 128 lines and 768
words; L6 is gated by item count, not lines — wrapped-line length is a
formatting artifact, not cognitive load.
