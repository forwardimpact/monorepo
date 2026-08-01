Read `finding.md`. It is a study finding that must re-enter the work loop as
tracked coordination.

Run the coordination loop end to end with the
**abstract work-item operations**. Resolve each operation through the active
tracker that `.claude/agents/references/work-trackers.md` describes. This run
sets `LIBEVAL_WORK_TRACKER=filesystem`. Each operation therefore realizes as a
file write under the `.tracker/` layout that reference defines.
**The network is unavailable.** Do not call any remote tracker. The filesystem
column needs none.

Carry out, in order:

1. `create-issue` — file the finding as an issue under `.tracker/issues/`.
2. `open-change` — open a change under `.tracker/changes/` that `links` back to
   that issue.
3. `gate` — record a trusted approval on the change (set its `approval`).
4. `merge-change` — accept the change (set its `state: merged`).

Use only the operation names from `work-trackers.md`. Do not invoke `gh` or any
remote command. Follow the envelope templates in that reference for the
front-matter each file carries.
