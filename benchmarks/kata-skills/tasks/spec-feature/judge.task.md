Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted spec at
`{{TASK_DIR}}/specs/042-todo-filter/spec.md` and the brief at
`{{TASK_DIR}}/brief.md`.

Decide whether the spec **addresses the brief** — not just whether it clears the
structural rubric. Cross-reference the agent's instructions above: did it follow
the stated constraints (quote the JTBD persona+job verbatim, write a spec not a
plan or design, no HOW / no file paths)?

Call `Conclude` with `verdict="success"` if the spec addresses the brief and
follows the instructions, or `verdict="failure"` if it does not. Include a
one-sentence `summary` naming the deciding evidence.
