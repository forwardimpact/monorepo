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

Every discipline, level, and track you reference must exist in the Map data for
the agent-aligned engineering standard. Use `npx fit-summit validate` to check.

Summit can also load rosters directly from Map's activity layer. This needs
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Summit groups
`organization_people` by manager email to form reporting teams.
