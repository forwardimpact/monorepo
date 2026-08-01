Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the finding at
`{{TASK_DIR}}/finding.md` and the work items the agent produced under
`{{TASK_DIR}}/.tracker/` (`issues/`, `changes/`).

Decide whether the agent **ran the coordination loop** for the finding. The
structural invariants alone do not settle this. Cross-reference the agent's
instructions above. Confirm that the agent used the abstract operations (no
`gh`, no network). Confirm that it filed the finding as an issue. Confirm that
it opened a change that links back to the issue. Confirm that it gated the
change with a recorded approval. Confirm that it merged the change
(`state: merged`).

Call `Conclude` with `verdict="success"` if the agent ran the loop faithfully
through the filesystem tracker. Call it with `verdict="failure"` if the agent
did not. Include a one-sentence `summary`. Name the evidence that decided the
verdict.
