Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted spec at
`{{TASK_DIR}}/specs/042-todo-filter/spec.md` and the brief at
`{{TASK_DIR}}/brief.md`.

Decide whether the spec **addresses the brief**. The structural rubric alone
does not settle this. Cross-reference the agent's instructions above. Confirm
that the agent quoted the JTBD persona+job verbatim. Confirm that it wrote a
spec, with no plan and no design. Confirm that it gave no HOW and no file paths.

Call `Conclude` with `verdict="success"` if the spec addresses the brief and
follows the instructions. Call it with `verdict="failure"` if the spec does not.
Include a one-sentence `summary`. Name the evidence that decided the verdict.
