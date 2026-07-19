Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted design at
`{{TASK_DIR}}/specs/042-todo-filter/design-a.md`, the approved spec at
`{{TASK_DIR}}/specs/042-todo-filter/spec.md`, and the app under
`{{TASK_DIR}}/app/`.

Decide whether the design is a **faithful, buildable architecture for the
spec** — not just whether it clears the structural rubric. Does it stay within
the spec's scope, name the real components it touches, and record genuine
decisions with real rejected alternatives (not strawmen)? Did it follow the
instructions (design only — no implementation plan or code changes)?

Call `Conclude` with `verdict="success"` if the design faithfully serves the
spec and follows the instructions, or `verdict="failure"` if it does not.
Include a one-sentence `summary` naming the deciding evidence.
