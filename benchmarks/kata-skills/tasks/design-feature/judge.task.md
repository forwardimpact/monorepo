Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted design at
`{{TASK_DIR}}/specs/042-todo-filter/design-a.md`, the approved spec at
`{{TASK_DIR}}/specs/042-todo-filter/spec.md`, and the app under
`{{TASK_DIR}}/app/`.

Decide whether the design is a **faithful, buildable architecture for the
spec**. The structural rubric alone does not settle this. Check that the design
stays within the spec's scope. Check that it names the real components it
touches. Check that it records genuine decisions with real rejected
alternatives. A strawman alternative does not count. Check that the agent
followed the instructions. The instructions asked for the design only, with no
implementation plan and no code changes.

Call `Conclude` with `verdict="success"` if the design faithfully serves the
spec and follows the instructions. Call it with `verdict="failure"` if the
design does not. Include a one-sentence `summary`. Name the evidence that
decided the verdict.
