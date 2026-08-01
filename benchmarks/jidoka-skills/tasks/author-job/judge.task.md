Grade result:

```json
{{GRADE_RESULT}}
```

The agent received these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted `JTBD.md` at
`{{TASK_DIR}}/JTBD.md` and the brief at `{{TASK_DIR}}/brief.md`.

The invariants already confirmed that a `<job>` tag with the required parts
exists. Decide the substance the rubric cannot. Decide whether the entry passes
the Jobs To Be Done quality bar, faithful to Maya's struggle story.

- **State the progress. Do not list features.** Remove the product name. If a
  meaningful statement of progress remains, the entry is good. If it reads as a
  feature list, fail it.
- **The trigger is a moment. It is not a role.** It answers "what just
  happened?" (the missed payment, the weekend she spent to reconcile by hand).
  It does not answer "who is Maya?".
- **It competes with nonconsumption.** The real incumbent is the spreadsheet
  and the reconciliation by hand. Maya hires nothing purpose-built.
- **Faithful to the brief.** The job reflects the one trustworthy total Maya
  looked for. It does not reflect an invented need.

Call `Conclude` with `verdict="success"` if the job captures Maya's progress
and follows the instructions. Call it with `verdict="failure"` if the job is
solution-shaped or strays from the brief. Include a one-sentence `summary` that
names the evidence that decided the verdict.
