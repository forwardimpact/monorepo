# Worked entry

This is a product Big Hire entry with all elements. The same job then appears as
a discoverable tag. The persona, product, and circumstances here are
illustrative. Replace them with your own. Pick the personas your repository
actually serves. Common examples are roles like platform engineers, application
developers, or release managers. Name the set that fits your users. Do not
adopt this one. Copy the shape. Do not copy the content.

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

Wrap a Big or Little Hire anywhere in the repo so `rg '<job '` finds it:

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

- The Big Hire survives when you remove the product name. It is progress. It is
  not a feature.
- The trigger is a moment ("a 2am page traces back to…"). It is not "engineers
  who manage config".
- Competes With names nonconsumption ("hire nothing and find out at 2am").
- The forces are asymmetric, and Push dominates. Fired When names the world
  (immutable infrastructure, a freeze). It does not name product failure alone.
