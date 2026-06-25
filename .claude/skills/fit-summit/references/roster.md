# Roster Format

Summit reads a `summit.yaml` file with teams and optional projects:

```yaml
teams:
  platform:
    - name: Alice
      email: alice@example.com
      job:
        discipline: software-engineering
        level: J060
        track: platform
    - name: Bob
      email: bob@example.com
      job:
        discipline: software-engineering
        level: J040

projects:
  migration-q2:
    - email: alice@example.com       # References a reporting team member
      allocation: 0.6
    - name: External Consultant      # Inline job definition
      job:
        discipline: software-engineering
        level: J060
        track: platform
      allocation: 1.0
```

All disciplines, levels, and tracks referenced must exist in the Map
agent-aligned engineering standard data. Use `npx fit-summit validate` to check.

Alternatively, Summit can load rosters directly from Map's activity layer
(requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`), grouping
`organization_people` by manager email to form reporting teams.
