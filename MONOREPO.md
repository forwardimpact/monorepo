# Monorepo Structure Standard

> "A system is a network of interdependent components that work together to try
> to accomplish the aim of the system. A system must have an aim. Without an
> aim, there is no system."
>
> — W. Edwards Deming, _The New Economics_

This standard defines the structure of a repository shared by humans and coding
agents — the top-level directories, the root files, and the way jobs are
captured and discovered. Everything else builds on this shape.

The Jobs To Be Done conventions described below supply that aim. Each job names
the progress a persona seeks; each directory and file traces back to a job it
serves. Structure without aim is arbitrary — aim without structure is invisible.

## Top-Level Directories

Three directories carry shippable code, each with its own `README.md` capturing
the jobs that directory exists to serve:

- **`products/`** — User-facing products. Each product has a `README.md` that
  names the personas it serves and the progress it helps them make.
- **`services/`** — Long-running services consumed by products. Each service
  has a `README.md` that captures the jobs it does for the products and
  platform builders that depend on it.
- **`libraries/`** — Shared code consumed by products and services. Each
  library has a `README.md` that captures the jobs it does for the platform
  builders that depend on it.

Three directories support the shippable code without being shipped themselves:

- **`websites/`** — Documentation hubs. The top-level `README.md` maps every
  guide to a Big Hire or Little Hire so documentation traces back to the jobs
  it serves.
- **`wiki/`** — Shared working memory. Where humans and agents record what
  they learn while working — observations, decisions, and context that help
  the team get better over time.
- **`infrastructure/`** — Deployment assets (Docker, gateway, database, load
  balancer). Subdirectories carry their own READMEs for the specific
  deployment concern they cover.

## Root Files

Three root files orient every contributor. Each has one job; none restates
another.

### Project Identity (CLAUDE.md)

Orients every contributor on every run. Answers _what_ the project is, _who_ it
serves, and _where_ to find things.

#### Properties of a Good Project Identity

1. **Orients, doesn't govern.** Answers what, who, where. Rules and policies
   belong in `CONTRIBUTING.md`.
2. **Navigation hub.** Points to everything, restates nothing. A link is
   cheaper than a duplicate.
3. **Stable.** Changes rarely — frequent churn means content belongs elsewhere.
4. **Budget-conscious.** Every line loads on every run. If a section is only
   relevant to one workflow, push it deeper.
5. **Surfaces tagging conventions.** Briefly explains how jobs are tagged and
   how to discover them with `rg`.

### Contribution Standards (CONTRIBUTING.md)

Read on demand. Governs _how_ contributors work — invariants, technical rules,
git workflow, security policies.

#### Properties of Good Contribution Standards

1. **Rules, not procedures.** What to do and what not to do — step-by-step
   sequencing belongs closer to the work.
2. **Universal scope.** Every item applies to every contribution. Workflow-
   specific rules belong with the workflow that owns them.
3. **Verifiable.** Each rule should be checkable — by a human, a script, or a
   list. Aspirational guidance that can't be verified drifts.

### Jobs To Be Done (JTBD.md)

The canonical catalogue of "Big Hires" — one entry per persona-outcome pair.
Captures _what progress each persona seeks_ from the products in this repo.

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

## Jobs: Big Hires and Little Hires

Jobs are distributed across the codebase so they live near the code that
serves them:

- **Big Hires** — the adoption decision per persona-outcome pair. Live in
  [JTBD.md](JTBD.md). Use the full entry structure above.
- **Little Hires** — narrower, repeated daily jobs. Live wherever they fit
  best: product, service, and library READMEs; design docs; nearby code.

### `<job>` Tagging Convention

Wrap every job — Big or Little — in a semantic tag so it can be discovered
without knowing where it lives:

```markdown
<job user="Engineering Leaders" goal="Staff Teams to Succeed">

**Trigger:** A post-mortem surfaces the same skill gap that caused the last
incident.

**Big Hire:** Help me make staffing decisions I can defend with evidence, not
intuition. → **Summit**

**Little Hire:** Help me spot capability gaps before someone gets set up to
fail. → **Summit**

</job>
```

- Tag attributes (`user`, `goal`) make search results self-describing — each
  match shows purpose without opening the file.
- Keep the full opening tag on one line within 74 characters so `rg` output
  stays coherent.

Discover jobs from anywhere in the repo:

```sh
rg '<job '  # all jobs
```

## Internal Contributors vs External Users

The monorepo is open source but exists primarily for internal contributors.
External users consume products as published artifacts and never read the
source. Two consequences shape the structure:

- Internal-only conventions (build tooling, codegen, internal scripts) live in
  the monorepo and don't appear in published artifacts.
- Documentation aimed at external users lives where they can reach it
  (published packages, hosted sites), not in internal-only files.

`CLAUDE.md` is the canonical place to spell out the specific tooling split —
package manager, task runner, codegen.
