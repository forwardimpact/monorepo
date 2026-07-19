Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the wiki files under
`{{TASK_DIR}}/wiki/` — especially `staff-engineer.md`.

The agent ran `fit-wiki fix`, which internally spawns a Haiku agent to
resolve audit findings. Decide whether the pipeline **resolved the
findings** without destroying existing content. The original summary
was missing a `**Last run**:` marker and a `## Message Inbox` section
with `<!-- memo:inbox -->`.

Call `Conclude` with `verdict="success"` if the findings were resolved
cleanly, or `verdict="failure"` if the file was broken, content was
deleted, or findings remain unresolved. Include a one-sentence `summary`
naming the deciding evidence.
