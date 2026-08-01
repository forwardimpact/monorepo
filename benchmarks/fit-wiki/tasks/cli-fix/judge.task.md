Grade result:

```json
{{GRADE_RESULT}}
```

The agent received these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the wiki files under
`{{TASK_DIR}}/wiki/`, especially `staff-engineer.md`.

The agent ran `fit-wiki fix`. That command spawns a Haiku agent internally to
resolve audit findings. Decide whether the pipeline **resolved the findings**.
Check that it did not destroy content that was already there. The original
summary had no `**Last run**:` marker. It also had no `## Message Inbox`
section with `<!-- memo:inbox -->`.

Call `Conclude` with `verdict="success"` if the pipeline resolved the findings
cleanly. Call it with `verdict="failure"` if the pipeline broke the file,
deleted content, or left findings unresolved. Include a one-sentence `summary`
that names the evidence that decided the verdict.
