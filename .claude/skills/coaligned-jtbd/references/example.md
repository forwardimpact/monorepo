# Worked entry

A product Big Hire entry with all elements, then the same job as a discoverable
tag. Replace the persona, product, and circumstances with your own — copy the
shape, not the content.

## Full entry (root JTBD.md)

```markdown
## Engineering Leaders

### Staff Teams to Succeed

**Trigger:** A post-mortem surfaces the same skill gap that caused the last
incident.

**Big Hire:** Help me make staffing decisions I can defend with evidence, not
intuition.

**Little Hire:** Help me spot capability gaps before someone gets set up to
fail.

**Competes With:** Gut-feel reorgs; spreadsheets of headcount; hiring a
consultant; hire nothing and hope the gap closes on its own.

**Forces:**

- **Push:** The same gap keeps causing incidents and nobody can point to why.
- **Pull:** Confidence that a staffing change strengthens the team as a system.
- **Habit:** Staffing by who is available, not by what the team is missing.
- **Anxiety:** Fear that a model oversimplifies people into cells in a grid.

**Fired When:** A reorg dissolves the team being modeled; a budget freeze ends
hiring; leadership mandates a different planning tool.
```

## As a discoverable tag

A Big or Little Hire anywhere in the repo is wrapped so `rg '<job '` finds it:

```markdown
<job user="Engineering Leaders" goal="Staff Teams to Succeed">

**Trigger:** A post-mortem surfaces the same skill gap that caused the last
incident.

**Big Hire:** Help me make staffing decisions I can defend with evidence, not
intuition. → **Summit**

**Little Hire:** Help me spot capability gaps before someone gets set up to
fail. → **Summit**

</job>
```

## Why this passes the properties

- The Big Hire survives removing the product name — it is progress, not a
  feature.
- The trigger is a moment ("a post-mortem surfaces…"), not "leaders who staff
  teams".
- Competes With names nonconsumption ("hope the gap closes on its own").
- The forces are asymmetric — Push dominates — and Fired When names the world
  (a reorg, a freeze), not only product failure.
