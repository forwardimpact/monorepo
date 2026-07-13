Invariants result:

```json
{{INVARIANTS_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted `JTBD.md` at
`{{TASK_DIR}}/JTBD.md` and the brief at `{{TASK_DIR}}/brief.md`.

The invariants already confirmed a `<job>` tag with the required parts exists.
Decide the substance the rubric cannot — does the entry pass the Jobs To Be Done
quality bar, faithful to Maya's struggle story?

- **Progress, not features.** If removing the product name leaves a meaningful
  statement of progress, good. If it reads as a feature list, fail.
- **Trigger is a moment, not a role.** It answers "what just happened?" (the
  missed payment, the weekend of reconciling), not "who is Maya?".
- **Competes with nonconsumption.** The real incumbent is the spreadsheet and
  the by-hand reconciliation — hiring nothing purpose-built.
- **Faithful to the brief.** The job reflects the one trustworthy total Maya
  went looking for, not an invented need.

Call `Conclude` with `verdict="success"` if the job captures Maya's progress and
follows the instructions, or `verdict="failure"` if it is solution-shaped or
strays from the brief. Include a one-sentence `summary` naming the deciding
evidence.
