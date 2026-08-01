# Jidoka Instruction Architecture

> "The volume and complexity of what we know has exceeded our individual ability
> to deliver its benefits correctly, safely, or reliably."
>
> — Atul Gawande, _The Checklist Manifesto_

This standard defines the layered instruction architecture. The architecture
keeps humans and coding agents on one set of honest instructions. The standard
also defines the universal root files. Every repository that adopts it carries
`CLAUDE.md`, `CONTRIBUTING.md`, and `JTBD.md`. The standard stands on its own.
Any well-structured repository can adopt it, whatever its directory shape. A
repository's structure standard extends it. For a monorepo, see
[MONOREPO.md](MONOREPO.md) for the top-level directories and how jobs map onto
them.

The name is _jidoka_. It is the Toyota principle that builds quality into the
process itself. The line stops at the first defect and never passes one
downstream. Instruction files are the process here. Layers drift, restate
each other, and go stale long before anyone notices that an agent misbehaves.
The `jidoka` checks are the andon cord. They halt the moment a layer
breaches its budget, a jobs block goes stale, or a repository invariant
breaks. So the fix happens where the defect appears. The defect does not ship
to every downstream run.

The architecture draws on three well-publicized ideas:

1. **Jidoka** (Toyota) — The process builds in quality. Inspection afterward
   does not. Every layer has a machine-checkable budget, and the checks stop
   the line at the first breach.
2. **Jobs To Be Done** (Christensen, Moesta) — Agents align to the progress
   each persona seeks in specific circumstances. They do not align to feature
   lists. See [JTBD.md](JTBD.md).
3. **The Checklist Manifesto** (Gawande) — Complex work fails from inattention
   under load. Ignorance is not the cause. Structured instructions make sure
   humans and agents apply existing knowledge consistently.

Together they answer _what_ agents align to (the jobs). They answer _how_
alignment holds under load (the layered instruction architecture). They answer
_how it stays held_ (checks that never pass a defect downstream). This matters
more for the expert contributor. Beginners follow procedures because they must.
Experts skip them because they think they do not need them.

## The Layers

Instructions span eight layers. The layers ascend from most general (every
contributor, every run) to most specific (one pause point). Each layer has one
job. A defect in one layer is a different class of problem from a defect in
another. Trace attribution depends on the separation.

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

L3/L4 mirror L5/L6. Profiles define boundaries, and agent references supply
shared protocols. Procedures define steps, and skill references supply domain
data. L5/L6/L7 share a skill folder but serve different concerns: L5 is
_procedural_, L6 is _declarative_, L7 is _verificational_. Trace attribution
requires the separation. The phrase "wrong procedure" names a different class
of defect from "stale data" or "missing verification."

### Layer Rules

- No layer restates another. When two layers mention the same tool, separate by
  voice: L0 describes ("ToolX sends a message"), L5 directs ("Use ToolX to
  deliver the report").
- Contributors follow the most specific layer. A complete skill procedure makes
  system-level tool descriptions invisible.
- CLAUDE.md orients (what, who, where). CONTRIBUTING.md governs (invariants,
  quality commands, policies). Domain procedures live in skills.
- Profiles define boundaries. Procedures define steps. References supply data.
  Checklists verify steps.
- A checklist item must never teach. If an item needs explanation, the procedure
  above it is incomplete.

## L0 — System Prompt

The harness loads it once per session. It is Claude Code's own prompt for
interactive runs, or the `libharness` prompt for agent workflows.

### Properties of Good System Prompts

1. **Mechanics only.** Turns, tool calls, completion signals. No domain
   knowledge, no project context.
2. **Short direct sentences.** Minimal dashes, semicolons, or mid-sentence
   interruptions. One idea per sentence.
3. **Harness-specific.** Each runtime supplies its own. Contributors never edit
   these directly.
4. **Invisible downstream.** The most specific layer overrides. A system prompt
   should never compete with a skill procedure.

### Section Tags

A harness can compose a system prompt from more than one layer. Then it wraps
each layer in a parallel, sibling-tagged section. The boundary between persona
(L3) and orchestration mechanics (L0) stays explicit:

```text
<agent_profile>
…L3 profile body…
</agent_profile>

<session_protocol>
…L0 orchestration mechanics…
</session_protocol>
```

A blank line joins the sibling tags. Neither tag nests inside the other.
`<agent_profile>` precedes `<session_protocol>`. Profile and protocol source
text carry no tags. The harness applies the tags at composition time.

## L1 — Project Identity (CLAUDE.md)

`settingSources: ["project"]` auto-loads it. It orients every contributor on
every run: _what_ the project is, _who_ it serves, and _where_ to find things.

### Properties of a Good Project Identity

1. **Orient. Do not govern.** Answer what, who, and where. Rules and policies
   belong in `CONTRIBUTING.md`.
2. **Navigation hub.** It points to everything. It restates nothing. A link is
   cheaper than a duplicate.
3. **Stable.** It changes rarely. Frequent churn means content belongs
   elsewhere.
4. **Budget-conscious.** Every line loads on every run. If a section is only
   relevant to one workflow, push it deeper.
5. **Surfaces the discovery conventions.** It is the one layer that loads on
   every run. So it advertises how to find the architecture's tagged artifacts.
   A brief section names where jobs live ([JTBD.md](JTBD.md)). It also names how
   `rg` discovers both jobs and checklists. A contributor reaches them and does
   not need to know where they sit.

A repository's structure standard may add conventions on top. For a monorepo,
these are the tooling split and how jobs distribute across directories. See
[MONOREPO.md](MONOREPO.md). The structure standard never replaces these
universal properties.

## L2 — Contribution Standards & Jobs (CONTRIBUTING.md, JTBD.md)

Contributors read it on demand. It does not auto-load.

### Contribution Standards (CONTRIBUTING.md)

It governs _how_ contributors work: invariants, technical rules, git workflow,
security policies.

1. **Rules only.** State what to do and what not to do. Step-by-step
   sequencing belongs closer to the work.
2. **Universal scope.** Every item applies to every contribution. Workflow-
   specific rules belong with the workflow that owns them.
3. **Verifiable.** Each rule should be checkable by a human, a script, or a
   list. Aspirational guidance that nobody can verify drifts.

### Jobs To Be Done (JTBD.md)

This file is the canonical catalogue of "Big Hires". It holds one entry per
persona-outcome pair. It captures _what progress each persona seeks_.

#### Entry Structure

Each entry follows a fixed structure. All entries need the first five elements.
**Products** need _Forces_ and _Fired When_. **Services** and **libraries**
omit them.

- **User** — the persona that hires the product (`##` heading).
- **Goal** — the high-level progress the user seeks (`###` heading).
- **Trigger** — a specific moment that creates the job. A role description
  does not qualify.
- **Big Hire** — "{progress}." This is the adoption decision. It says why a
  user hires this over the alternatives. It renders as "Help me {progress}."
  with a product arrow.
- **Little Hire** — "{progress}." This is the repeated daily use. It says what
  brings the user back each time. It renders the same way.
- **Competes With** — what a user hires instead today, semicolon-delimited.
- **Forces** — Four forces: _Push_ (status quo pain), _Pull_ (the desired
  future state, with no feature list), _Habit_ (current behavior that resists
  change), _Anxiety_ (fear that blocks adoption).
- **Fired When** — the conditions that make a user abandon the product.
  Include at least one environmental shift beyond product failure.

#### Properties of Good JTBD Entries

These properties draw from Christensen and Moesta's methodology:

1. **State the progress. Do not list features.** "Help me make staffing
   decisions I can defend" is a job. "Help me run what-if staffing scenarios"
   is a feature request in job syntax. If the statement becomes meaningless
   when you remove the product arrow, the job is too solution-shaped.
2. **A trigger is a moment. It is not a role.** "Starting the third project
   that needs the same plumbing" is a moment. "Building systems consumed by
   both humans and agents" is a role description. A good trigger answers "what
   just happened?"
3. **Competes With includes nonconsumption.** Every Competes With list must
   include a "hire nothing" option. Nonconsumption is usually the real
   incumbent.
4. **Pull describes a desired future. It is not a feature list.** "Confidence
   that a staffing change strengthens the team" is a future state.
   "System-level team views and what-if scenarios" is a feature list.
5. **Forces are asymmetric.** One force often dominates. If all four feel
   equally weighted, the author filled the analysis in from a template. The
   author did not reconstruct it from a decision story.
6. **Fired When includes the world and the product.** Users abandon products
   when the environment shifts: a reorg, a budget cut, a tool ban.
7. **Validate in the field. Do not author at a desk.** JTBD entries are
   hypotheses until customer struggle stories confirm them. An entry that
   surprises the product team is more likely correct than one that confirms
   existing assumptions.

#### `<job>` Tagging Convention

Wrap every job, Big or Little, in a semantic tag. A search then finds the job
without any knowledge of where it lives:

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

- Tag attributes (`user`, `goal`) make search results describe themselves. Each
  match shows the purpose before anyone opens the file.
- Keep the full opening tag on one line within 74 characters so `rg` output
  stays coherent.

Discover jobs from anywhere in the repo with `rg '<job '`.

#### Big Hires and Little Hires

Jobs live near the code that serves them. **Big Hires** are the adoption
decision per persona-outcome pair. They live in `JTBD.md` with the full entry
structure. **Little Hires** are narrower, repeated daily jobs. They live
wherever they fit best: package or module READMEs, design docs, or nearby code.
A repository's structure standard says where that is for its shape.

## L3 — Agent Profile

The harness auto-loads it every run. It defines the agent's persona, voice,
skill routing, and scope constraints.

### Properties of Good Agent Profiles

1. **Boundaries only.** It defines scope and persona. Task procedures belong
   in L5.
2. **One persona per profile.** A mix of personas creates ambiguity about
   voice, scope, and accountability.
3. **Minimal.** Every line loads on every run. Include scope constraints and
   skill routing. Push everything else to L5 or L6.

## L4 — Agent Reference

An agent reference gives progressive disclosure for agent-scoped data. Profiles
(L3) stay minimal. References load on demand when a profile or procedure cites
them. They sit flat in `.claude/agents/x-<name>.md`, as siblings of the
profiles. A `.claude/agents/*.md` file is a **profile** when it carries
`name`/`description` frontmatter, the test the agent loader applies. It is a
**reference** when it does not. The `x-` filename prefix is the enforced naming
convention that makes references visible and sorts them last. CI asserts that
the prefix and the frontmatter classifier always agree. An agent reference has
the same declarative role as an L6 skill reference, but agents share it. It
holds cross-cutting protocols (memory, coordination, approval) that no single
skill owns. L4 and L6 stay distinct layers with separate budgets.

### Properties of Good Agent References

1. **Declarative, cross-cutting.** Multiple agents share these protocols and
   tables. If only one skill consults it, put it in that skill's `references/`.
2. **Independently correct.** Stale data is a distinct defect class from a wrong
   profile or procedure.
3. **On-demand only.** It never auto-loads. If a profile always needs the
   content, fold it into the profile or the skill that calls it.

## L5 — Skill Procedure (SKILL.md)

A skill procedure gives progressive disclosure for domain-scoped work. Profiles
(L3) route to skills. Procedures load per invocation. The procedure is the
complete instruction set for one domain.

### Properties of Good Skill Procedures

1. **Complete for its domain.** A contributor who follows only the procedure
   produces correct output. That contributor needs no tribal knowledge.
2. **Imperative voice.** It directs action ("Use X to do Y"). It does not
   describe capability ("X can be used to do Y").
3. **Decision-making only.** It holds sequencing, rationale, and judgment
   calls. Push templates, examples, and data tables to L6.
4. **Self-contained at invocation.** It auto-loads. Work begins with no
   external reads. A contributor consults references mid-procedure. References
   are not prerequisites.

## L6 — Skill References

Contributors read them on demand when the procedure calls for them. They sit
beside the skill in `references/<name>.md` or `scripts/<name>.sh|.mjs`.

### Properties of Good References

1. **Declarative only.** They hold templates, worked examples, invariant
   tables, and lookup data. Steps belong in L5.
2. **Independently correct.** A stale reference is a different defect class
   from a wrong procedure. Trace attribution requires the separation.
3. **On-demand only.** They never auto-load. If a procedure always needs a
   reference, move its content into the procedure.

## L7 — Checklists

Checklists give binary verification at pause points. Two types gate natural
pause points. The wrong type at the wrong moment undermines the checklist's
purpose.

**READ-DO — Entry Gates.** Read each item, then do it. Use it before work
begins, when the contributor must internalize constraints before the first
line.
Steps are sequential. If you miss any one, work goes in the wrong direction.

**DO-CONFIRM — Exit Gates.** Do from memory, then pause and confirm every item.
Use it at natural pause points: before a commit, merge, or release. Items are
independent checks. Skilled contributors work fluidly with no mid-flow
interruption.

| Moment                      | Type       | Purpose                      |
| --------------------------- | ---------- | ---------------------------- |
| Before work starts          | READ-DO    | Load constraints into memory |
| Before you cross a boundary | DO-CONFIRM | Confirm you missed nothing   |

The boundary with L5 is strict. If a contributor needs an item to _learn_ what
to do, it belongs in the procedure. If it only confirms that a known step
happened, it belongs in the checklist.

### Properties of Good Checklists

These properties draw from Gawande's findings:

1. **Goal statement.** Every checklist begins with a stated goal, the outcome
   it protects. Without a goal, contributors tick boxes mechanically.
2. **5–7 items.** Working memory sets the limit. Beyond 7 items, contributors
   skip entries or treat the list as formality.
3. **Precise.** Each item is a single, unambiguous action or verification. Two
   contributors should interpret each item the same way.
4. **Killer items only.** Every item addresses a failure mode that actually
   occurred or is highly likely. A list full of obvious steps wastes attention.
5. **Action or verification, never explanation.** Write a verb phrase. Do not
   write a paragraph. If it needs explanation, the contributor needs training.
6. **One checklist, one moment.** Tie it to a single pause point. The pause
   point must be natural. Contributors skip artificial ones.
7. **Tested and revised.** Use it. Observe what still goes wrong. Revise it. A
   stale checklist trains contributors to treat checklists as noise.

### Tagging Convention

Wrap each checklist in a semantic tag that encodes its type and goal:

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

Auto-loaded layers consume context on every run. Keep them tight. The Jidoka
product (`products/jidoka/`) implements `jidoka instructions` in
`libraries/libinvariant/`. That command enforces these limits:

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

The root `CLAUDE.md` carries project identity and auto-loads every run.
Contributors read subdirectory `CLAUDE.md` files on demand when work enters
that directory. Those files extend the root with directory-local conventions.
They must stay tight so they layer cleanly. The L1 subdir cap is 128 lines and
768 words. Item count gates L7, and line count does not. Wrapped-line length is
an artifact of the format rather than cognitive load.

## Migrate from Co-Aligned

This standard appeared previously under the name Co-Aligned. A repository on
the old tools
migrates in three moves. Rename the rules directory with
`git mv .coaligned .jidoka`. Reinstall the skill pack
(`apm install forwardimpact/jidoka-skills`). Swap the CLI. The old `coaligned`
command (from `@forwardimpact/libcoaligned`) becomes `jidoka`. Install it with
`npx @forwardimpact/jidoka` or the platform bootstrap. An unmigrated repository
fails loudly. The loader stops with a `rules directory not found` error that
names the expected location.
