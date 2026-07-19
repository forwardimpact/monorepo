Grade result:

```json
{{GRADE_RESULT}}
```

The agent was given these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted plan at
`{{TASK_DIR}}/specs/042-todo-filter/plan-a.md`, the approved spec and design in
`{{TASK_DIR}}/specs/042-todo-filter/`, and the app under `{{TASK_DIR}}/app/`.

Decide whether the plan is **executable straight from the design without
re-reading the spec** — not just whether it clears the structural rubric. Are
the steps concrete (real files, real changes), correctly ordered for their
dependencies, and faithful to the design's decisions? Could a trusted agent
implement the feature from this plan alone? Did it follow the instructions
(plan only — not implemented)?

Call `Conclude` with `verdict="success"` if the plan is faithfully executable
and follows the instructions, or `verdict="failure"` if it does not. Include a
one-sentence `summary` naming the deciding evidence.
