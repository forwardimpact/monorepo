---
title: "Getting Started: Landmark for Engineers"
description: "Check your evidence record, promotion readiness, growth timeline, and skill coverage against your agent-aligned engineering standard markers."
---

Landmark gives you visibility into your own practice evidence and growth data —
showing what your engineering record looks like against your agent-aligned
engineering standard's markers.

Landmark requires Map's activity layer (Supabase). If your organization has
already set this up, Landmark works immediately. If not, ask your engineering
leader to follow the [Map setup guide](/docs/getting-started/leaders/map/). One
command works without Supabase: `marker` reads directly from your
agent-aligned engineering standard YAML.

## Prerequisites

- Node.js 22+
- npm
- Map's activity layer running and populated (for most commands)
- A Landmark session created with `fit-landmark login` for every command except
  `marker` — see [Sign In to Landmark](/docs/products/signing-in-to-landmark/)
  for the full flow

## Install

```sh
npm install @forwardimpact/landmark
```

## Sign in

```sh
npx fit-landmark login --email you@example.com
```

`login` walks Supabase's magic-link flow and stores the session (0600) in your
platform's config directory — `~/.config/landmark/credentials.json` on Linux;
see [Sign In to Landmark](/docs/products/signing-in-to-landmark/) for the
macOS and Windows paths. Subsequent commands resolve your
identity automatically. Use `--otp` to skip the browser and paste the
six-digit code instead. If your email is not in the activity roster, login
fails — your operator runs `fit-map people provision` to keep `auth.users`
synchronized.

## Browse marker definitions

Look up the observable indicators defined for any skill — useful for
understanding what evidence is expected at each proficiency level:

```sh
npx fit-landmark marker data_integration
```

```text
  Markers for Data Integration (data_integration)

    awareness:
      human:
        - Described differences between batch and streaming integrations.
        - Identified common source systems such as LIMS or ELN during onboarding.
      agent:
        - Summarized integration concepts and source systems accurately when prompted.

    foundational:
      human:
        - Implemented a simple field-to-field integration following an existing pattern.
        - Resolved a routine integration failure by inspecting logs and retrying.
      agent:
        - Produced a working integration scaffold using approved patterns.
```

Filter to a specific proficiency level:

```sh
npx fit-landmark marker data_integration --level working
```

## Check your evidence

See which markers have evidence linked to your work:

```sh
npx fit-landmark evidence --email you@example.com
```

```text
  Evidence

    code_review: 0 matched, 4 unmatched
      [unmatched] Reviewed moderate-complexity changes independently.
        rationale: Commit artifact; review behavior cannot be assessed.

    architecture_design: 1 matched, 2 unmatched
      [matched] Owned the architecture of a service through delivery and validation.
        rationale: A recent pull request introduced a new service boundary with documented API contracts.
      [unmatched] Evaluated alternatives and justified trade-offs in a written design review.
        rationale: No design review artifact present in this PR.
```

Each row shows the marker, whether it matched, the rationale for the
assessment, and where the evidence came from — rows are labelled by
provenance, distinguishing Map's direct artifact matches from Guide's deeper
assessments. Guide evaluates your GitHub artifacts (PRs, reviews, commits)
against each marker in the background — you see the results here. Filter by
`--skill` to focus on a specific area.

## View your skill coverage

See how complete your evidence record is across all expected skills:

```sh
npx fit-landmark coverage --email you@example.com
```

Coverage shows evidenced artifacts versus total expected markers — a quick gauge
of where your record is strong and where it has gaps.

## Check promotion readiness

See which next-level markers you have already evidenced and which are still
outstanding:

```sh
npx fit-landmark readiness --email you@example.com
```

```text
Readiness: you@example.com (J060 → J070)

    Architecture Design (practitioner):
      [ ] Led architecture for a multi-team initiative across regulated boundaries.
      [ ] Mentored engineers in producing high-quality, validated designs.
      [ ] Coordinated cross-system designs and surfaced integration risks proactively.

    Full Stack Development (practitioner):
      [ ] Led design and delivery of a complex application or major feature area.
      [ ] Defined component, API, and data access patterns adopted by the team.
```

Each unchecked marker is one you have not yet evidenced at the target level.
Without `--target`, readiness checks against the next level above your current
level. With `--target`, you can check against any specific level.

## Track your growth timeline

See how your evidence has accumulated over time, aggregated by quarter:

```sh
npx fit-landmark timeline --email you@example.com
npx fit-landmark timeline --email you@example.com --skill system_design
```

Timelines help you see whether growth is accelerating, stalling, or concentrated
in one area. Add `--skill` to focus on a specific capability.

## Read your voice comments

See your own GetDX snapshot comments in a timeline view alongside evidence
context:

```sh
npx fit-landmark voice --email you@example.com
```

All Landmark commands support `--format text|json|markdown`.

---

## What's next

<div class="grid">

<!-- part:card:../../../../landmark -->
<!-- part:card:../../../products/engineering-outcomes -->

</div>
