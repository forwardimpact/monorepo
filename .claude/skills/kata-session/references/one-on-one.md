# 1-on-1 Coaching Overlay

Applies to `kata-coaching.yml` runs: the improvement coach facilitates a 1-on-1
session with one domain agent.

## Session Shape

The participant reflects on its most recent workflow trace. Under Q2 the
participant runs `fit-trace` on that trace; the five questions scope to the
trace's run-level findings. One facilitator, one participant, turn-taking via
`Ask` / `Answer`.

## Question Wording (1-on-1)

1. **What were you trying to achieve in this run?** (Q1)
2. **What actually happened?** (Q2 — the participant runs `fit-trace` on its
   own most recent workflow trace and reports the numeric findings.)
3. **What obstacles prevented better outcomes?** (Q3 — drawn from the trace
   findings. Record the obstacle as a labeled issue per
   [`issue-lifecycle.md`](issue-lifecycle.md) and report its `#NNN`.)
4. **What will you do differently next run?** (Q4 — propose the next experiment
   and its expected outcome. Record it as an experiment issue (`experiment` +
   `agent:{self}`) per [`issue-lifecycle.md`](issue-lifecycle.md) and report its
   `#NNN`.)
5. **When will you see the effect?** (Q5 — typically the next scheduled workflow
   run.)

## Trace access

The participant runs `fit-trace` against its own agent's trace artifact. The
coach does not pre-load the trace content into the participant's context; the
participant fetches it under Q2.

## Participant briefing template

```markdown
You are in a 1-on-1 coaching session. I will Ask you five questions; reply to
each with Answer. Under Q2, run `fit-trace` on your most recent workflow
trace and include the numeric findings in your Answer. Under Q3 and Q4, record
your obstacle and experiment as labeled GitHub issues (see issue-lifecycle.md)
and report each issue number back in your Answer. Any comment you write that
closes a thread or routes a decision to a named owner must name what is in
flight (owner + artifact) or the explicit negative; if a decision is routed
to you, announce your PR on the coordinating issue at open.
```

## Memory

After the session, the participant writes its findings to its own weekly log —
in addition to the obstacle and experiment issues it recorded under Q3/Q4. The
coach facilitates only; it records no metrics or files of its own.
