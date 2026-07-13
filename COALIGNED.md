# Co-Aligned Instruction Architecture Standard

> "The volume and complexity of what we know has exceeded our individual ability
> to deliver its benefits correctly, safely, or reliably."
>
> — Atul Gawande, _The Checklist Manifesto_

This standard defines the layered instruction architecture for creating aligned
coding agents, together with the universal root files every co-aligned
repository carries — `CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md`. It stands on
its own: any well-structured repository can adopt it, whatever its directory
shape. A repository's structure standard extends it — for a monorepo, see
[MONOREPO.md](MONOREPO.md) for the top-level directories and how jobs map onto
them.

It draws on two well-publicized ideas:

1. **Jobs To Be Done** (Christensen, Moesta) — agents align to the progress each
   persona seeks in specific circumstances, not to feature lists. See
   [JTBD.md](JTBD.md).
2. **The Checklist Manifesto** (Gawande) — complex work fails not from ignorance
   but from inattention under load. Structured instructions ensure existing
   knowledge is consistently applied — by humans and agents alike.

Together they answer _what_ agents align to (the jobs) and _how_ alignment holds
under load (the layered instruction architecture). The more expert the
contributor, the more this matters: beginners follow procedures because they
must; experts skip them because they think they don't need to.

## The Layers

Instructions span eight layers, ascending from most general (every contributor,
every run) to most specific (one pause point). Each layer has one job. A defect
in one layer is a different class of problem from a defect in another, and trace
attribution depends on the separation.

0. **System prompt** — harness mechanics: turns, tool calls, completion signal.
1. **CLAUDE.md** — project identity. See [MONOREPO.md](MONOREPO.md).
2. **CONTRIBUTING.md** & **JTBD.md** — contribution standards and jobs. See
   [MONOREPO.md](MONOREPO.md).
3. **Agent profile** — persona, voice, skill routing, scope constraints.
4. **Agent references (`x-*.md`)** — cross-cutting protocols shared across
   agents: memory, coordination, approval.
5. **Skill procedure (SKILL.md)** — decision-making, sequencing, rationale.
6. **Skill references (`references/`)** — data the procedure consults:
   templates, worked examples, invariant tables, lookup data.
7. **Checklists** — binary verification at pause points, no explanation. In
   SKILL.md (domain) or CONTRIBUTING.md (universal).

L3/L4 mirror L5/L6: profiles define boundaries, agent references supply shared
protocols; procedures define steps, skill references supply domain data.
L5/L6/L7 share a skill folder but serve different concerns: L5 is _procedural_,
L6 is _declarative_, L7 is _verificational_. Trace attribution requires the
separation — "wrong procedure" is a different class of defect from "stale data"
or "missing verification."

### Layer Rules

- No layer restates another. When two layers mention the same tool, separate by
  voice: L0 describes ("ToolX sends a message"), L5 directs ("Use ToolX to
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

### Section Tags

When a harness composes a system prompt from more than one layer, it wraps each
layer in a parallel, sibling-tagged section so the boundary between persona (L3)
and orchestration mechanics (L0) stays explicit:

```text
<agent_profile>
…L3 profile body…
</agent_profile>

<session_protocol>
…L0 orchestration mechanics…
</session_protocol>
```

The tags are siblings joined by a blank line — neither nests inside the other,
and `<agent_profile>` precedes `<session_protocol>`. Profile and protocol source
text carry no tags; the harness applies them at composition time.

## L1 — Project Identity (CLAUDE.md)

Auto-loaded via `settingSources: ["project"]`. Orients every contributor on
every run: _what_ the project is, _who_ it serves, and _where_ to find things.

### Properties of a Good Project Identity

1. **Orients, doesn't govern.** Answers what, who, where. Rules and policies
   belong in `CONTRIBUTING.md`.
2. **Navigation hub.** Points to everything, restates nothing. A link is
   cheaper than a duplicate.
3. **Stable.** Changes rarely — frequent churn means content belongs elsewhere.
4. **Budget-conscious.** Every line loads on every run. If a section is only
   relevant to one workflow, push it deeper.
5. **Surfaces the discovery conventions.** Because it is the one layer loaded
   on every run, it advertises how the architecture's tagged artifacts are
   found. A brief section names where jobs live ([JTBD.md](JTBD.md)) and how
   both jobs and checklists are discovered with `rg`, so a contributor reaches
   them without knowing where they sit.

A repository's structure standard may add conventions on top (for a monorepo,
the tooling split and how jobs distribute across directories — see
[MONOREPO.md](MONOREPO.md)); it never replaces these universal properties.

## L2 — Contribution Standards & Jobs (CONTRIBUTING.md, JTBD.md)

Read on demand, not auto-loaded.

### Contribution Standards (CONTRIBUTING.md)

Governs _how_ contributors work — invariants, technical rules, git workflow,
security policies.

1. **Rules, not procedures.** What to do and what not to do — step-by-step
   sequencing belongs closer to the work.
2. **Universal scope.** Every item applies to every contribution. Workflow-
   specific rules belong with the workflow that owns them.
3. **Verifiable.** Each rule should be checkable — by a human, a script, or a
   list. Aspirational guidance that can't be verified drifts.

### Jobs To Be Done (JTBD.md)

The canonical catalogue of "Big Hires" — one entry per persona-outcome pair.
Captures _what progress each persona seeks_.

#### Entry Structure

Each entry follows a fixed structure. The first five elements are required for
all entries. _Forces_ and _Fired When_ are required for **products** but
omitted for **services** and **libraries**.

- **User** — persona hiring the product (`##` heading).
- **Goal** — high-level progress sought (`###` heading).
- **Trigger** — a specific moment that creates the job, not a role
  description.
- **Big Hire** — "{progress}." — the adoption decision; why this gets hired
  over the alternatives. Rendered as "Help me {progress}." with a product
  arrow.
- **Little Hire** — "{progress}." — the repeated daily use; what brings the
  user back each time. Rendered the same way.
- **Competes With** — what currently gets hired instead; semicolon-delimited.
- **Forces** — Four forces: _Push_ (status quo pain), _Pull_ (desired future
  state, not features), _Habit_ (current behavior resisting change), _Anxiety_
  (fear blocking adoption).
- **Fired When** — Conditions under which the product gets abandoned; include
  at least one environmental shift beyond product failure.

#### Properties of Good JTBD Entries

Drawing from Christensen and Moesta's methodology:

1. **Progress, not features.** "Help me make staffing decisions I can defend"
   is a job. "Help me run what-if staffing scenarios" is a feature request
   wearing job syntax. If removing the product arrow makes the statement
   meaningless, the job is too solution-shaped.
2. **Trigger is a moment, not a role.** "Starting the third project that
   needs the same plumbing" is a moment. "Building systems consumed by both
   humans and agents" is a role description. A good trigger answers "what
   just happened?"
3. **Competing hires include nonconsumption.** Every Competes With list must
   include a "hire nothing" option. Nonconsumption is usually the real
   incumbent.
4. **Pull describes a desired future, not a feature list.** "Confidence that
   a staffing change strengthens the team" is a future state. "System-level
   team views and what-if scenarios" is a feature list.
5. **Forces are asymmetric.** One force often dominates. If all four feel
   equally weighted, the analysis was filled in from a template rather than
   reconstructed from a decision story.
6. **Fired When includes the world, not just the product.** Products get
   abandoned when the environment shifts — a reorg, a budget cut, a tool ban.
7. **Field-validated, not desk-authored.** JTBD entries are hypotheses until
   confirmed by customer struggle stories. An entry that surprises the product
   team is more likely correct than one that confirms existing assumptions.

#### `<job>` Tagging Convention

Wrap every job — Big or Little — in a semantic tag so it can be discovered
without knowing where it lives:

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

- Tag attributes (`user`, `goal`) make search results self-describing — each
  match shows purpose without opening the file.
- Keep the full opening tag on one line within 74 characters so `rg` output
  stays coherent.

Discover jobs from anywhere in the repo with `rg '<job '`.

#### Big Hires and Little Hires

Jobs live near the code that serves them. **Big Hires** — the adoption decision
per persona-outcome pair — live in `JTBD.md` with the full entry structure.
**Little Hires** — narrower, repeated daily jobs — live wherever they fit best:
package or module READMEs, design docs, or nearby code. A repository's structure
standard says where that is for its shape.

## L3 — Agent Profile

Auto-loaded every run. Defines the agent's persona, voice, skill routing, and
scope constraints.

### Properties of Good Agent Profiles

1. **Boundaries, not steps.** Defines scope and persona — task procedures belong
   in L5.
2. **One persona per profile.** Mixing personas creates ambiguity about voice,
   scope, and accountability.
3. **Minimal.** Every line loads on every run. Include scope constraints and
   skill routing; push everything else to L5 or L6.

## L4 — Agent Reference

Progressive disclosure for agent-scoped data — profiles (L3) stay minimal,
references load on demand when a profile or procedure cites them. Stored flat in
`.claude/agents/x-<name>.md`, as siblings of the profiles. A
`.claude/agents/*.md` file is a **profile** when it carries `name`/`description`
frontmatter — the test the agent loader applies — and a **reference** when it
does not; the `x-` filename prefix is the enforced naming convention that makes
references visible and sorts them last (CI asserts the prefix and the
frontmatter classifier always agree). Same declarative role as L6 skill
references but shared across agents — cross-cutting protocols (memory,
coordination, approval) that no single skill owns. L4 and L6 stay distinct
layers with separate budgets.

### Properties of Good Agent References

1. **Declarative, cross-cutting.** Protocols and tables shared by multiple
   agents. If only one skill consults it, put it in that skill's `references/`.
2. **Independently correct.** Stale data is a distinct defect class from a wrong
   profile or procedure.
3. **On-demand only.** Never auto-loaded. If a profile always needs the content,
   fold it into the profile or the calling skill.

## L5 — Skill Procedure (SKILL.md)

Progressive disclosure for domain-scoped work — profiles (L3) route to skills,
procedures load per invocation. The procedure is the complete instruction set
for one domain.

### Properties of Good Skill Procedures

1. **Complete for its domain.** A contributor following only the procedure
   produces correct output — no tribal knowledge required.
2. **Imperative voice.** Directs action ("Use X to do Y"), not describes
   capability ("X can be used to do Y").
3. **Decision-making, not data.** Sequencing, rationale, and judgment calls.
   Push templates, examples, and data tables to L6.
4. **Self-contained at invocation.** Auto-loaded, no external reads required to
   begin work. References are consulted mid-procedure, not prerequisites.

## L6 — Skill References

Read on demand when the procedure calls for them. Co-located in
`references/<name>.md` or `scripts/<name>.sh|.mjs`.

### Properties of Good References

1. **Declarative, not procedural.** Templates, worked examples, invariant
   tables, lookup data. Prescribing steps belongs in L5.
2. **Independently correct.** A stale reference is a different defect class from
   a wrong procedure — trace attribution requires the separation.
3. **On-demand only.** Never auto-loaded. If a reference is always needed, its
   content should move into the procedure.

## L7 — Checklists

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

The boundary with L5 is strict: if a contributor needs an item to _learn_ what
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
| L2 CONTRIBUTING.md & JTBD.md | ≤ 320 lines | on demand        |
| L3 Agent profile             | ≤ 72 lines  | auto (every run) |
| L4 Agent reference           | ≤ 192 lines | on demand        |
| L5 SKILL.md                  | ≤ 192 lines | auto (per skill) |
| L6 Skill reference file      | ≤ 128 lines | on demand        |
| L7 Checklist (per block)     | ≤ 9 items   | auto (per skill) |

The root `CLAUDE.md` carries project identity and is auto-loaded every run.
Subdirectory `CLAUDE.md` files are read on demand when work enters that
directory — they extend the root with directory-local conventions and must stay
tight so they layer cleanly. L1 subdir is capped at 128 lines and 768 words; L7
is gated by item count, not lines — wrapped-line length is a formatting
artifact, not cognitive load.
