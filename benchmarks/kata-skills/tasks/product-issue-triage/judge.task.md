Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the product brief at
`{{TASK_DIR}}/product-brief.md` and the triaged issue at
`{{TASK_DIR}}/.tracker/issues/req-emoji-social.md`.

Decide whether the agent **triaged the issue correctly** — not just whether the
files clear the structural invariants. The request (animated emoji themes + a
social activity feed) is out of scope for a minimal local single-user CLI.
Cross-reference the agent's instructions: did it classify the issue as out of
scope, append a rationale grounded in the brief, label it `wontfix`, close it,
and refrain from opening a change or spec — all through the work-item operations
rather than `gh`?

Call `Conclude` with `verdict="success"` if the triage is correct and grounded,
or `verdict="failure"` if it misclassified, acted through the wrong channel, or
left the issue open. Include a one-sentence `summary` naming the deciding
evidence.
