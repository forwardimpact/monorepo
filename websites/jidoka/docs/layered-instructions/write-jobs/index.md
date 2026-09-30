---
title: "Write Jobs To Be Done Entries"
description: "Write a job entry that links an instruction layer to the progress a persona seeks in a real moment. The page covers the entry structure, the Big Hire and Little Hire split, the four forces, the Fired When clause, and the tag that makes every job searchable."
---

Every layer from L3 to L7 takes its direction from a job. An agent profile, a
skill procedure, and a checklist all serve the progress that the jobs layer
describes. An entry that describes a feature instead of progress therefore
points every one of those layers at that feature.

## Prerequisites

- Node.js 22+.
- The layered architecture in place, with `CLAUDE.md`, `CONTRIBUTING.md`, and
  `JTBD.md` at the repository root. See
  [Put Your Instructions on One Layered Architecture](/docs/layered-instructions/).
- The skill pack installed, so that an agent can write entries with you.

```sh
apm install forwardimpact/jidoka-skills
npx jidoka jtbd
```

## 1. Choose where the jobs live

The jobs layer has two shapes. The way the repository is packaged decides which
one you use.

| Signal                                                | Shape                    |
| ----------------------------------------------------- | ------------------------ |
| One manifest at the root, or no per-package manifests | Single static `JTBD.md`  |
| Many packages, each with its own manifest             | Generated `.jobs` blocks |

In the static shape you write the entries directly in `JTBD.md`. In the
generated shape each package declares its jobs in the `jobs` array of its own
manifest. The check validates every entry and regenerates the marker-delimited
block in the package group's `README.md` and in the root `JTBD.md`. Start with
the static shape if you are not sure. For the directory groups a monorepo uses,
see [the Monorepo structure standard](https://www.monorepo.team/).

## 2. Reconstruct the job from a real moment

Start from a struggle story. Pick one real decision, then find four things
about it: the persona, what had just happened, the progress they wanted, and
what they hired instead. An entry that you invent at a desk only confirms what
the team already believes. Treat every entry as a hypothesis until a struggle
story confirms it.

## 3. Write the entry to structure

Every entry requires `User`, `Goal`, `Trigger`, `Big Hire`, `Little Hire`, and
`Competes With`. The generated shape renders `User` and `Goal` as one
`## User: Goal` heading. `Forces` and `Fired When` apply to a product, because a
product involves an adoption decision. Omit both for a service or a library.

Here is a complete product entry. The persona and the product are examples.
Copy the shape, and replace the persona and the product with your own.

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

Check three things. First, remove the product name from the Big Hire. If the
sentence loses its meaning, the job describes a solution, and you wrote a
feature request in the form of a job. Second, read the trigger. It must answer
the question "what just happened?". "Engineers who own deploys" is a role, so it
fails. Third, `Competes With` must include the option to do nothing. "Hire
nothing and wait for a customer report" is usually the real competitor.

## 4. Split the Big Hire from the Little Hire

A Big Hire is the adoption decision for one persona and one outcome. It makes a
team change what they use. Big Hires go in `JTBD.md` with the full entry
structure. A Little Hire repeats and brings the same person back the next day.
Little Hires go closest to the work they serve: a package `README.md`, a design
document, or the code itself. An entry that does both is two entries.

The line budget enforces the split. `jidoka instructions` caps `JTBD.md` at 320
lines, because contributors read the whole file. When the file approaches the
cap, move Little Hires next to their code. Do not shorten the Big Hires.

## 5. Balance the four forces and state when the job ends

Push and Pull move the persona toward the change. Habit and Anxiety hold the
persona where they are. All four describe the same decision from different
sides.

| Force     | What it describes                 | It fails when                              |
| --------- | --------------------------------- | ------------------------------------------ |
| `Push`    | The pain in the status quo        | It describes a missing feature             |
| `Pull`    | The desired future state          | It lists what the product does             |
| `Habit`   | The current behavior that resists | It repeats Push in other words             |
| `Anxiety` | The fear that blocks adoption     | It describes a technical risk, not a fear  |

The forces are not equal, and one usually dominates. When all four seem to have
the same weight, the author filled in a template. Pull most often turns into a
feature list. "Confidence that a closed release actually shipped everywhere" is
a future state. "A per-environment dashboard with drift alerts" is a roadmap.

`Fired When` lists the conditions that end the hire, so it tells every layer
below where the job stops applying. Include at least one change in the
environment, and not only product failure. A reorganization, a budget cut, a
tool ban, or a platform change can all fire a product that works exactly as
designed. An entry whose `Fired When` lists only defects claims that the job
survives any change in the world, and no job does.

## 6. Tag the job so a search finds it

Wrap every job, Big or Little, in a `<job>` tag. A contributor or an agent then
finds it without any knowledge of which file contains it.

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

The `user` and `goal` attributes make each search result describe itself. Keep
the whole opening tag on one line of at most 74 characters, so that terminal
output stays readable. A goal that pushes the tag past that limit is also too
long for a heading. One search then finds every job in the repository:
`rg '<job '`.

## 7. Validate the entry

Run the check. In the generated shape it also reports any block that no longer
matches its manifest.

```sh
npx jidoka jtbd          # validate entries and check freshness
npx jidoka jtbd --fix    # regenerate stale blocks in place
```

A first entry often hits these failures.

| Finding                  | What to change                                        |
| ------------------------ | ----------------------------------------------------- |
| `<field> is required`    | Add the missing required element as a string.         |
| `must end with "."`      | Add a period to the Big Hire or Little Hire sentence. |
| `duplicate bigHire`      | Merge the entries, or differentiate the progress.     |
| `invalid user`           | Use a persona the check accepts. The hint lists them. |
| `.jobs must be an array` | Wrap a single job in `[]`. One job is an array of one. |
| A file reported as stale | Run `--fix` and commit the regenerated file.          |

Never hand-edit a generated block. Edit the manifest, regenerate the block, and
commit both files. A hand-edited block passes review and fails the next check,
because the generator rewrites it from the manifest in any case. In the static
shape the check has nothing to regenerate, so the properties on this page are
the whole gate. A checklist is the durable way to keep a gate that no command
enforces. See
[Write a Checklist That Verifies Instead of Teaches](/docs/layered-instructions/write-checklists/).

## Verify

- [ ] Each Big Hire still states progress when you remove the product name.
- [ ] Each trigger describes a moment and answers "what just happened?".
- [ ] Each `Competes With` list includes the option to do nothing.
- [ ] `Pull` describes a future state and lists no feature.
- [ ] Each `Fired When` lists at least one change in the world.
- [ ] Every job is inside a `<job>` tag whose opening line fits in 74
      characters.
- [ ] `npx jidoka jtbd` exits zero with no findings.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../write-checklists -->

<!-- part:card:../author-a-layer -->

<!-- part:card:../../stop-the-line -->

</div>
