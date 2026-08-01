---
name: jidoka-jtbd
description: >
  Author and maintain Jobs To Be Done entries for the Jidoka standard.
  Use when you write a Big Hire or Little Hire, when you add a `<job>` tag,
  when `package.json .jobs` blocks are stale, or when `jidoka jtbd` reports a
  schema or freshness failure.
---

# Write Jobs To Be Done

Jobs To Be Done is what agents align to. It is the progress each persona seeks
in a specific circumstance. It is not a feature list. This skill authors job
entries to spec and keeps the generated blocks fresh.

`jidoka jtbd` validates entries against the schema and checks that
generated blocks are current. `jidoka jtbd --fix` regenerates them.

## When to Use

- You write a Big Hire or Little Hire entry
- You add a `<job>` tag to an existing document
- `package.json .jobs` blocks are stale
- `jidoka jtbd` reports a schema or freshness failure

## Checklists

<do_confirm_checklist goal="Verify the jobs are sound before committing">

- [ ] State progress in each entry. Do not state a feature in job syntax.
- [ ] Make every trigger a moment, and make every Competes With name
      nonconsumption.
- [ ] Wrap every job in a `<job>` tag on a single ≤74-char opening line.
- [ ] Regenerate generated blocks from manifests. Do not hand-edit them.
- [ ] Confirm `jidoka jtbd` passes with no schema or freshness findings.

</do_confirm_checklist>

## Two kinds of job

- **Big Hire** — the adoption decision, one per persona-outcome pair. It lives
  in the root `JTBD.md` with the full entry structure.
- **Little Hire** — a narrower, repeated daily job. It lives wherever it fits:
  package READMEs, design docs, near the code that serves it.

## Process

### Step 1: Reconstruct the job from a real moment

Start from a struggle story. Do not start from a template. Answer these
questions: who is the persona, what just happened that created the job, what
progress do they want, and what do they hire today instead? A job invented at a
desk tends to confirm assumptions. A job reconstructed from a real decision
tends to surprise.

### Step 2: Write the entry to structure

The first five elements are required for every entry. **Forces** and **Fired
When** are required for products. Omit them for services and libraries.

See [references/entry-template.md](references/entry-template.md) for the full
structure and [references/example.md](references/example.md) for a worked
entry. Hold each entry to the seven quality properties. These are the
load-bearing ones:

- **State the progress. Do not list features.** If you remove the product name
  and the statement goes meaningless, the job is solution-shaped. Rewrite it.
- **The trigger is a moment. It is not a role.** It answers "what just
  happened?". It does not answer "who is this person?".
- **The Competes With list includes nonconsumption.** "Hire nothing" is usually
  the real incumbent. Name it.
- **Forces are asymmetric.** If all four feel equal, they came from a template.
  Nobody reconstructed them.

### Step 3: Tag the job

Wrap every job, Big or Little, in a `<job>` tag. A reader then finds it even
when they do not know where it lives:

```markdown
<job user="<persona>" goal="<outcome>">

**Trigger:** <the moment that creates the job>.

**Big Hire:** <progress sought>. → **<product>**

**Little Hire:** <repeated daily progress>. → **<product>**

</job>
```

Keep the full opening tag on one line within 74 characters. Discover jobs with
`rg '<job '`.

### Step 4: Regenerate or validate

- **Static `JTBD.md`** — run `jidoka jtbd` to validate entry structure.
- **Generated `.jobs` blocks** — edit the `jobs` array in the owning
  `package.json`, then run `jidoka jtbd --fix` to regenerate the catalog
  and job blocks. Commit the regenerated files.

```sh
jidoka jtbd          # validate entries and check freshness
jidoka jtbd --fix    # regenerate stale catalog and job blocks
```

A stale generated block fails the check. Never hand-edit a generated block.
Edit the manifest and regenerate.

## Documentation

- [Jidoka Instruction Architecture Standard](https://github.com/forwardimpact/monorepo/blob/main/JIDOKA.md)
  — where jobs sit in the layered architecture.
- [Jidoka website](https://www.jidoka.team/)
  — the standard's story: built-in quality, stop the line.
