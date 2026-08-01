Grade result:

```json
{{GRADE_RESULT}}
```

The agent received these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted `CLAUDE.md`,
`CONTRIBUTING.md`, and `JTBD.md` at `{{TASK_DIR}}/`, and the project fixture
(`{{TASK_DIR}}/README.md`, `{{TASK_DIR}}/package.json`, `{{TASK_DIR}}/src/`).

The invariants already confirmed the files exist and carry the required
sections and tags. Decide the substance the rubric cannot:

- `CLAUDE.md` must **orient a reader to `unitconv` specifically**: what it is,
  who it serves, where things live. Generic filler fails. It must orient and it
  must not govern. Rules belong in `CONTRIBUTING.md`, so `CLAUDE.md` must not
  restate them.
- The **Jobs and Checklists** section must be a real discovery pointer to
  `JTBD.md` and the tagged checklists. Copied boilerplate fails.
- `JTBD.md` must capture a **genuine job** for this tool (progress a real user
  seeks). A feature description fails.

Cross-reference the agent's instructions. Decide whether it followed the stated
constraints (one file owns each concern, no restatement).

Call `Conclude` with `verdict="success"` if the bootstrapped files faithfully
serve this project and obey the instructions. Call it with `verdict="failure"`
if they do not. Include a one-sentence `summary` that names the evidence that
decided the verdict.
