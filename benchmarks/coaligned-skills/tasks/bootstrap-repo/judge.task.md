Invariants result:

```json
{{INVARIANTS_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted `CLAUDE.md`,
`CONTRIBUTING.md`, and `JTBD.md` at `{{TASK_DIR}}/`, and the project fixture
(`{{TASK_DIR}}/README.md`, `{{TASK_DIR}}/package.json`, `{{TASK_DIR}}/src/`).

The invariants already confirmed the files exist and carry the required
sections and tags. Decide the substance the rubric cannot:

- Does `CLAUDE.md` **orient a reader to `unitconv` specifically** — what it is,
  who it serves, where things live — rather than generic filler? Does it orient
  without governing (rules belong in `CONTRIBUTING.md`, not restated here)?
- Is the **Jobs and Checklists** section a real discovery pointer to `JTBD.md`
  and the tagged checklists, not copied boilerplate?
- Does `JTBD.md` capture a **genuine job** for this tool (progress a real user
  seeks), not a feature description?

Cross-reference the agent's instructions: did it follow the stated constraints
(one file owns each concern, no restatement)?

Call `Conclude` with `verdict="success"` if the bootstrapped files faithfully
serve this project and obey the instructions, or `verdict="failure"` if they do
not. Include a one-sentence `summary` naming the deciding evidence.
