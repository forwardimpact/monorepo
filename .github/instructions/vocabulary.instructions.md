---
applyTo: "**/*.yaml,**/*.md"
---

# Vocabulary Standards

Use these standard terms throughout the engineering pathway framework for job
descriptions, skill definitions, and behaviour maturity levels.

> **Note**: The grade IDs and titles shown below are examples. The actual grades
> and their mappings vary per installation and are defined in `grades.yaml`. Use
> `npx pathway grade --list` to see available grades.

## Scope Terminology

In a large enterprise (50,000+ employees), individual impact is bounded. Use
these terms for increasingly broad spheres of influence:

| Term              | Typical Size     | Used For                     |
| ----------------- | ---------------- | ---------------------------- |
| **Team**          | 5-15 people      | Individual contributors      |
| **Area**          | 2-5 teams        | Practitioner-level scope     |
| **Business unit** | 500-5,000 people | Expert-level scope           |
| **Function**      | Major capability | Role modeling scope          |
| **Organization**  | 50,000+ people   | Exemplifying behaviours only |

## Usage by Grade

The table below shows **example** grade mappings for illustration. Actual grade
IDs, titles, and scope expectations are defined in `grades.yaml` and vary per
installation.

| Grade    | Professional Title | Skill Scope   | Behaviour Scope |
| -------- | ------------------ | ------------- | --------------- |
| (Junior) | Level I/II         | Team          | Emerging        |
| (Mid)    | Level III          | Team          | Emerging        |
| (Senior) | Staff              | Area          | Developing      |
| (Lead)   | Principal          | Business unit | Practicing      |
| (Expert) | Distinguished      | Business unit | Exemplifying    |

The progression pattern is: lower grades focus on team scope with emerging
behaviours; higher grades expand to business unit scope with role modeling and
exemplifying behaviours.

## Key Distinctions

### "Area" vs "Business Unit"

- **Area**: A practitioner's sphere of direct influence—2-5 teams they work with
  regularly. Use "your area" or "in your area".
- **Business unit**: Hundreds to thousands of people. Use for expert-level scope
  where someone shapes standards affecting many teams they don't directly work
  with.

### "Function" vs "Organization"

- **Function**: A major capability area (Engineering, IT, Data Science). Use for
  role_modeling behaviour maturity (typically senior/lead grades).
- **Organization**: The entire enterprise. Reserved exclusively for exemplifying
  behaviour maturity (highest grades only).

## Writing Guidelines

### For Practitioner Level (mid-senior grades)

Use multi-team but bounded scope:

- ✅ "across teams in your area"
- ✅ "mentor engineers in your area"
- ❌ "organizational" (too broad)
- ❌ "enterprise-wide" (too broad)

### For Expert Level (senior grades)

Use business unit scope:

- ✅ "across the business unit"
- ✅ "define standards across the business unit"
- ❌ "organizational" (reserved for exemplifying behaviours)

### For Exemplifying Behaviours Only (highest grades)

Reserved for the highest maturity level:

- ✅ "shapes organizational culture"
- ✅ "organizational learning strategy"
