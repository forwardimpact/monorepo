Invariants result:

```json
{{INVARIANTS_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the finding at
`{{TASK_DIR}}/finding.md` and the work items the agent produced under
`{{TASK_DIR}}/.tracker/` (`issues/`, `changes/`).

Decide whether the agent **ran the coordination loop** for the finding — not
just whether the files clear the structural invariants. Cross-reference the
agent's instructions above: did it use the abstract operations (no `gh`, no
network), file the finding as an issue, open a change that links back to it,
gate the change with a recorded approval, and merge it (`state: merged`)?

Call `Conclude` with `verdict="success"` if the loop was carried out faithfully
through the filesystem tracker, or `verdict="failure"` if it was not. Include a
one-sentence `summary` naming the deciding evidence.
