---
title: Write a Checklist That Verifies Instead of Teaches
description: Place a READ-DO entry gate and a DO-CONFIRM exit gate at real pause points. Keep every item to one yes-or-no check. Tag both gates so that one search finds every gate in your repository.
---

Your procedures contain the steps, but a contributor under pressure still misses
one. A checklist closes that gap at one pause point. It confirms a step the
reader already knows, and it does not explain the step. This page shows how to
write both gate types, where to place each one, and how to tag them so that one
search finds every pause point. It assumes the
[layered architecture](/docs/layered-instructions/) is in place.

## Prerequisites

- A procedure for each domain of work, so that the gates confirm known steps.
- The skill pack: `apm install forwardimpact/jidoka-skills`.
- The check: `npx jidoka`.

## Two gates for two moments

| Moment | Type | How the reader uses it |
| --- | --- | --- |
| Before work starts | READ-DO | Read each item, then do it |
| Before you cross a boundary | DO-CONFIRM | Do from memory, then confirm each item |

A READ-DO gate loads the constraints into memory before the first line of work.
The order of the items matters, because one missed item sends the whole change
in the wrong direction.

A DO-CONFIRM gate is at a commit, a merge, or a release. Its items are
independent checks. A skilled contributor works without interruption, then
pauses once at the boundary and confirms that nothing was missed.

The wrong type at the wrong moment makes the gate useless. A READ-DO list at
the end comes too late to change direction, and a DO-CONFIRM list at the start
looks like background material.

## Test each item before you keep it

Ask three questions about every candidate item. If the answer to any question
is no, the item belongs in the procedure above it.

1. **Does the reader already know how to do this?** An item that has to teach
   the action shows that the procedure above it is incomplete. Move the
   explanation into the procedure and leave a short verb phrase in the
   checklist.
2. **Is it one action or one verification?** Two contributors must read the item
   the same way. Split a compound item.
3. **Has this failure happened?** Keep the items that address a failure you
   have seen or expect. An item for an obvious step protects nothing.

## Write the entry gate

```markdown
<read_do_checklist goal="Internalize constraints before writing code">

- [ ] State what the task asks. Name the files I will and will not touch.
- [ ] Read the code I am about to change.
- [ ] Search the shared libraries before I write a new helper.
- [ ] Choose the smallest plan that satisfies the task.
- [ ] Delete the old path in the same commit that adds the new one.

</read_do_checklist>
```

The `goal` attribute states the outcome the gate protects. Without it,
contributors tick the boxes without thought. Leave a blank line inside the tag
pair.

## Write the exit gate

```markdown
<do_confirm_checklist goal="Verify quality before the change leaves my hands">

- [ ] The check command passes.
- [ ] The test command passes, and new logic carries a test.
- [ ] The diff holds only what the task required.
- [ ] The commit subject follows the repository's format.
- [ ] The branch is pushed and the output names the pull request.

</do_confirm_checklist>
```

Every item states one verification. The list gives no reasons, because the
reasons are already in the procedure the contributor read.

## Choose the home

A universal gate applies to every contribution, so it goes in the root
`CONTRIBUTING.md`. Your repository structure standard says where that file is.
See [monorepo.team](https://www.monorepo.team/). A domain gate applies to one
domain of work, so it goes under a `## Checklists` heading in that domain's
`.claude/skills/<name>/SKILL.md`.

The check reads those two locations and no others. A checklist that you put in
an agent profile, an agent reference, or a skill reference is never measured,
and no cap protects it.

## One search finds every pause point

```sh
rg '<read_do_checklist'     # entry gates
rg '<do_confirm_checklist'  # exit gates
```

Keep the full opening tag on one line of at most 74 characters. A wrapped tag
splits the search result, and the reader loses the goal that gives the result
its meaning. Put both searches in your root `CLAUDE.md`, so that every
contributor and every agent can find the pause points.

## Caps the check enforces

| Rule | Limit | What a breach tells you |
| --- | --- | --- |
| `L7.too-many-items` | 9 items per block | The pause point is probably two pause points |
| `L7.item-too-many-words` | 32 words per item | The item explains instead of verifying |

Aim for five to seven items, because working memory sets that limit. Past
seven items, contributors skip entries or treat the list as a formality. The
check counts items rather than lines. A breach looks like this:

```text
.claude/skills/release-notes/SKILL.md
  31  error  checklist #2 (do_confirm_checklist) has 12 items (max 9)  L7.too-many-items
             → split the checklist into multiple sections, or remove items not load-bearing for the goal
```

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| Contributors tick every box in one pass | No goal, or the items address no real failure | Add the goal. Cut every item that protects nothing |
| An item needs a paragraph to make sense | The procedure above it is incomplete | Move the explanation into the procedure |
| No one stops at the gate | The pause point is artificial | Move the gate to a boundary the work already crosses |
| A known mistake keeps shipping | The gate is stale | Add the item that would have caught it |

Use the gate, then watch what still goes wrong. Add the item that would have
caught the miss, and delete an item that has caught nothing. If a checklist
goes stale, contributors learn to ignore every checklist.

## Verify

```sh
npx jidoka instructions
```

- The command reports no finding with an `L7.` rule identifier.
- Every block has a type tag and a `goal` attribute.
- Each opening tag is on one line of at most 74 characters.
- Each item is one action or one verification, with no explanation.
- Both searches above list the gate you just wrote.

## What's next

<div class="grid">

<!-- part:card:.. -->
<!-- part:card:../author-a-layer -->
<!-- part:card:../write-jobs -->
<!-- part:card:../../stop-the-line -->
<!-- part:card:../../stop-the-line/write-invariant-rules -->
<!-- part:card:../../getting-started -->

</div>
