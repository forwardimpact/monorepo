Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the product brief at
`{{TASK_DIR}}/product-brief.md` and the triaged issue at
`{{TASK_DIR}}/.tracker/issues/req-emoji-social.md`.

Decide whether the agent **triaged the issue correctly**. The structural
invariants alone do not settle this. The request (animated emoji themes plus a
social activity feed) is out of scope for a minimal local single-user CLI.
Cross-reference the agent's instructions. Confirm that the agent classified the
issue as out of scope. Confirm that it appended a rationale grounded in the
brief. Confirm that it labelled the issue `wontfix` and closed it. Confirm that
it opened no change and no spec. Confirm that every action went through the
work-item operations. The agent must not call `gh`.

Call `Conclude` with `verdict="success"` if the triage is correct and grounded.
Call it with `verdict="failure"` if the agent misclassified the issue, acted
through the wrong channel, or left the issue open. Include a one-sentence
`summary`. Name the evidence that decided the verdict.
