# Worked entry

A product Big Hire entry with all elements, then the same job as a discoverable
tag. The persona, product, and circumstances here are illustrative — replace
them with your own. Pick the personas your repository actually serves; common
starting points are roles like platform engineers, application developers, or
release managers, but name the set that fits your users rather than adopting
this one. Copy the shape, not the content.

## Full entry (root JTBD.md)

```markdown
## Platform Engineers

### Catch Configuration Drift Before It Pages

**Trigger:** A 2am page traces back to a config change that quietly diverged
from its reviewed baseline weeks earlier.

**Big Hire:** Help me catch config that has drifted from its reviewed baseline
before it causes an incident.

**Little Hire:** Help me see, each morning, which environments diverged
overnight.

**Competes With:** Hand-written diff scripts; a quarterly audit; trusting that
review caught everything; hire nothing and find out at 2am.

**Forces:**

- **Push:** Drift keeps causing incidents and nobody notices until production
  breaks.
- **Pull:** Confidence that what is running matches what was reviewed.
- **Habit:** Checking config only after something has already broken.
- **Anxiety:** Fear that another alerting tool just adds noise.

**Fired When:** The platform moves to immutable infrastructure where drift
cannot occur; a freeze halts all config changes; leadership standardizes on a
vendor's built-in drift tool.
```

## As a discoverable tag

A Big or Little Hire anywhere in the repo is wrapped so `rg '<job '` finds it:

```markdown
<job user="Platform Engineers" goal="Catch Configuration Drift Before It Pages">

**Trigger:** A 2am page traces back to a config change that quietly diverged
from its reviewed baseline weeks earlier.

**Big Hire:** Help me catch config that has drifted from its reviewed baseline
before it causes an incident. → **<product>**

**Little Hire:** Help me see, each morning, which environments diverged
overnight. → **<product>**

</job>
```

## Why this passes the properties

- The Big Hire survives removing the product name — it is progress, not a
  feature.
- The trigger is a moment ("a 2am page traces back to…"), not "engineers who
  manage config".
- Competes With names nonconsumption ("hire nothing and find out at 2am").
- The forces are asymmetric — Push dominates — and Fired When names the world
  (immutable infrastructure, a freeze), not only product failure.
