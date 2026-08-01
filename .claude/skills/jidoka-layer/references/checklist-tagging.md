# Checklists: tags, types, and properties

A checklist is binary verification at one pause point. It never teaches. If an
item needs explanation, the procedure above it is incomplete.

## Two types

| Moment | Type | How to use it |
| --- | --- | --- |
| Before you start work | READ-DO | Read each item, then do it |
| Before you cross a boundary | DO-CONFIRM | Do from memory, then confirm each item |

Use READ-DO when the contributor must load constraints before the first line.
Use DO-CONFIRM before a commit, merge, or release. Skilled contributors work
fluidly, then pause to confirm they missed nothing. The wrong type at the wrong
moment defeats the checklist.

## Tags

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

Keep the full opening tag on one line within 74 characters so search output
stays coherent. Discover checklists from anywhere:

```sh
rg '<read_do_checklist'     # entry gates
rg '<do_confirm_checklist'  # exit gates
```

## Seven properties of a good checklist

1. **Goal statement.** Every checklist states the outcome it protects.
2. **5–7 items.** Beyond working-memory limits, contributors skip entries.
3. **Precise.** Each item is one unambiguous action or verification.
4. **Killer items only.** Every item addresses a failure that actually
   occurred or is highly likely.
5. **Action or verification, never explanation.** Write a verb phrase. Do not
   write a paragraph.
6. **One checklist, one moment.** Tie it to a single, natural pause point.
7. **Tested and revised.** Use it. Observe what still goes wrong. Revise it.

The cap counts items (≤ 9 per block). It does not count lines. A wrapped line
is formatting. It does not add cognitive load. If a block needs more than seven
items, the pause point is probably two pause points.
