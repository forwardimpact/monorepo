---
title: "Write Jobs To Be Done Entries"
description: "Write a job entry that traces an instruction layer to the progress a persona seeks in a real moment. The page covers the entry structure, the Big Hire and Little Hire split, and the four forces. It also covers the Fired When clause and the tag that makes every job searchable."
---

Every layer above L2 inherits its direction from a job. An agent profile, a
skill procedure, and a checklist all answer to the progress the jobs layer
names. So an entry naming a feature aims every layer below it at that feature.

## Prerequisites

- Node.js 22+.
- The layered architecture in place, with `CLAUDE.md`, `CONTRIBUTING.md`, and
  `JTBD.md` at the repository root. See
  [Put Your Instructions on One Layered Architecture](/docs/layered-instructions/).
- The skill pack installed, so an agent can author entries with you.

```sh
apm install forwardimpact/jidoka-skills
npx @forwardimpact/jidoka jtbd
```

## 1. Choose where the jobs live

The jobs layer has two shapes. The choice follows how the repository is
packaged. It does not follow taste.

| Signal                                                | Shape                    |
| ----------------------------------------------------- | ------------------------ |
| One manifest at the root, or no per-package manifests | Single static `JTBD.md`  |
| Many packages, each with its own manifest             | Generated `.jobs` blocks |

In the static shape you author entries directly in `JTBD.md`. In the generated
shape each package declares its jobs in the `jobs` array of its own manifest.
The check validates every entry and regenerates the marker-delimited block in
the package group's `README.md` and in the root `JTBD.md`. Start static when you
are unsure. For the directory groups a monorepo uses, see
[the Monorepo structure standard](https://www.monorepo.team/).

## 2. Reconstruct the job from a real moment

Start from a struggle story. Name one real decision. Then recover four things
about it: the persona, what just happened, the progress they wanted, and what
they hired instead. An entry invented at a desk only confirms what the team
believes. Treat every entry as a hypothesis until a struggle story confirms it.

## 3. Write the entry to structure

Every entry requires `User`, `Goal`, `Trigger`, `Big Hire`, `Little Hire`, and
`Competes With`. The generated shape renders `User` and `Goal` as one
`## User: Goal` heading. `Forces` and `Fired When` apply to a product, because a
product carries an adoption decision. Omit both for a service or a library.

Here is a complete product entry. The persona and the product are illustrative.
Copy the shape. Do not copy the content.

```markdown
## Release Managers: Close a Release With Confidence

**Trigger:** A release goes out on Friday. On Monday the team finds one service
rolled back two days earlier and nobody noticed.

**Big Hire:** Help me know a release reached every environment in a healthy
state before I close it out.

**Little Hire:** Help me see which changes in a release have never run outside
staging.

**Competes With:** A hand-kept spreadsheet; asking each team lead in chat; the
deploy tool's own dashboard; hire nothing and wait for a customer report.

**Forces:**
- **Push:** Silent partial releases keep reaching customers first.
- **Pull:** Confidence that a closed release actually shipped everywhere.
- **Habit:** Treating a green deploy job as proof the release landed.
- **Anxiety:** Fear that one more dashboard adds noise and no answers.

**Fired When:** the platform moves to continuous deployment and the release
event disappears; a hiring freeze removes the role; the deploy vendor ships the
same view at no cost.
```

Three properties do most of the work here. Remove the product name from the Big
Hire. When the sentence goes meaningless, the job was solution-shaped, and you
wrote a feature request in job syntax. Next, read the trigger. It must answer
"what just happened?". "Engineers who own deploys" is a role, so it fails.
Last, `Competes With` must name nonconsumption. "Hire nothing and wait for a
customer report" is usually the real incumbent.

## 4. Split the Big Hire from the Little Hire

A Big Hire is the adoption decision for one persona-outcome pair. It makes a
team change what they use. Big Hires live in `JTBD.md` with the full entry
structure. A Little Hire repeats, and it brings the same person back tomorrow.
Little Hires live closest to the work they serve: a package `README.md`, a
design document, or the code itself. An entry that does both is two entries.

The line budget enforces the split. `jidoka instructions` caps `JTBD.md` at 320
lines, because contributors read the whole file. When the file approaches the
cap, move Little Hires next to their code. Do not shorten the Big Hires.

## 5. Balance the four forces and name the exit

Push and Pull move the persona toward the change. Habit and Anxiety hold them
where they are. All four describe one decision from a different side.

| Force     | What it names                     | It fails when                         |
| --------- | --------------------------------- | ------------------------------------- |
| `Push`    | The pain in the status quo        | It names a missing feature            |
| `Pull`    | The desired future state          | It lists what the product does        |
| `Habit`   | The current behavior that resists | It restates Push in other words       |
| `Anxiety` | The fear that blocks adoption     | It names a technical risk, not a fear |

Forces are asymmetric, and one usually dominates. When all four read as equally
weighted, the author filled in a template. Pull collapses into a feature list
most often. "Confidence that a closed release actually shipped everywhere" is a
future state. "A per-environment dashboard with drift alerts" is a roadmap.

`Fired When` names the conditions that end the hire, so it tells every layer
below where the job stops applying. Include at least one environmental shift
beyond product failure. A reorg, a budget cut, a tool ban, or a platform change
all fire a product that works exactly as designed. An entry whose `Fired When`
names only defects claims the job survives any change in the world, and no job
does.

## 6. Tag the job so a search finds it

Wrap every job, Big or Little, in a `<job>` tag. A contributor or an agent then
finds it without knowing which file holds it.

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

The `user` and `goal` attributes make each search result describe itself. Keep
the whole opening tag on one line and inside 74 characters, and terminal output
stays readable. A goal that pushes the tag past that limit is also too long for
a heading. One search then finds every job in the repository: `rg '<job '`.

## 7. Validate the entry

Run the check. In the generated shape it also reports any block that no longer
matches its manifest.

```sh
npx @forwardimpact/jidoka jtbd          # validate entries and check freshness
npx @forwardimpact/jidoka jtbd --fix    # regenerate stale blocks in place
```

These are the failures a first entry hits.

| Finding                  | What to change                                        |
| ------------------------ | ----------------------------------------------------- |
| `<field> is required`    | Add the missing required element as a string.         |
| `must end with "."`      | Add a period to the Big Hire or Little Hire sentence. |
| `duplicate bigHire`      | Merge the entries, or differentiate the progress.     |
| `invalid user`           | Use a persona the check accepts. The hint lists them. |
| `.jobs must be an array` | Wrap a single job in `[]`. One job is an array of one. |
| A file reported as stale | Run `--fix` and commit the regenerated file.          |

Never hand-edit a generated block. Edit the manifest. Regenerate the block.
Commit both files. A hand-edited block passes review and fails the next check,
because the generator rewrites it from the manifest either way. In the static
shape the check has nothing to regenerate, so the properties on this page carry
the whole gate. A checklist is the durable way to hold a gate that no command
enforces. See
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).

## Verify

- [ ] Each Big Hire still states progress when you remove the product name.
- [ ] Each trigger names a moment and answers "what just happened?".
- [ ] Each `Competes With` list includes a hire-nothing option.
- [ ] `Pull` names a future state and lists no feature.
- [ ] Each `Fired When` names at least one shift in the world.
- [ ] Every job sits in a `<job>` tag whose opening line fits 74 characters.
- [ ] `npx @forwardimpact/jidoka jtbd` exits zero with no findings.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../write-checklists -->

<!-- part:card:../author-a-layer -->

<!-- part:card:../../stop-the-line -->

</div>
