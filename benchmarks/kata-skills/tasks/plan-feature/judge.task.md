Grade result:

```json
{{GRADE_RESULT}}
```

The task gave the agent these instructions:

> {{AGENT_INSTRUCTIONS}}

Agent trace at `{{AGENT_TRACE_PATH}}`. Read the agent-emitted plan at
`{{TASK_DIR}}/specs/042-todo-filter/plan-a.md`, the approved spec and design in
`{{TASK_DIR}}/specs/042-todo-filter/`, and the app under `{{TASK_DIR}}/app/`.

Decide whether the plan is **executable straight from the design, with no
second read of the spec**. The structural rubric alone does not settle this.
Check that the steps are concrete, with real files and real changes. Check that
their order matches their dependencies. Check that they stay faithful to the
design's decisions. Decide whether a trusted agent could implement the feature
from this plan alone. Decide whether the agent followed the instructions. The
instructions asked for the plan only, with no implementation.

Call `Conclude` with `verdict="success"` if the plan is faithfully executable
and follows the instructions. Call it with `verdict="failure"` if the plan does
not. Include a one-sentence `summary`. Name the evidence that decided the
verdict.
