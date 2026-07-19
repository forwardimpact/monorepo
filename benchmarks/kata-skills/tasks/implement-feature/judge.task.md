Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. The implemented app is under
`{{TASK_DIR}}/app/`; the approved spec, design, and plan are in
`{{TASK_DIR}}/specs/042-todo-filter/`.

The harness already ran the hidden test suite and restored the working
directory, so behaviour is graded mechanically and every file you see is the
agent's own work. Your job is **discipline**: did the agent implement the plan
faithfully with **no scope creep** — no refactors, renames, extra features, or
changes to `add`/`done`/the stored shape beyond what `plan-a.md` describes? Read
the modified files under `app/` and the trace. Did it follow the instructions
(implement the plan; leave `specs/` untouched)?

Call `Conclude` with `verdict="success"` if the implementation follows the plan
without scope creep, or `verdict="failure"` if it diverges. Include a
one-sentence `summary` naming the deciding evidence.
