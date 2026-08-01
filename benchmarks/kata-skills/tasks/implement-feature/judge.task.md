Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. The implemented app is under
`{{TASK_DIR}}/app/`. The approved spec, design, and plan are in
`{{TASK_DIR}}/specs/042-todo-filter/`.

The harness already ran the hidden test suite and restored the working
directory. So the harness grades behaviour mechanically. Every file you see is
the agent's own work. Your job is **discipline**. Decide whether the
agent implemented the plan faithfully with **no scope creep**. Scope creep means
a refactor, a rename, an extra feature, or a change to `add`, `done`, or the
stored shape beyond what `plan-a.md` describes. Read the modified files under
`app/` and the trace. Decide whether the agent followed the instructions. The
instructions were to implement the plan and to leave `specs/` untouched.

Call `Conclude` with `verdict="success"` if the implementation follows the plan
with no scope creep. Call it with `verdict="failure"` if the implementation
diverges. Include a one-sentence `summary`. Name the evidence that decided the
verdict.
