# Step → Status Mapping

Reference for `req-workday` Step 3. Map the **Step / Disposition** column to the
`req-track` pipeline status. Do **not** use the Stage column for status — Stage
is only used for row detection (stop condition).

| Workday Step / Disposition             | Pipeline status    |
| -------------------------------------- | ------------------ |
| `Considered`                           | `new`              |
| `Review`                               | `new`              |
| `Manager Resume Screen`                | `screening`        |
| `Schedule Recruiter Phone Screen`      | `screening`        |
| `Manager Request to Move Forward (HS)` | `screening`        |
| `Proposed Interview Slate`             | `screening`        |
| `Assessment`                           | `screening`        |
| `Manager Request to Decline (HS)`      | `rejected`         |
| `Interview` / `Phone Screen`           | `first-interview`  |
| `Second Interview`                     | `second-interview` |
| `Reference Check`                      | `second-interview` |
| `Offer`                                | `offer`            |
| `Employment Agreement`                 | `offer`            |
| `Background Check`                     | `hired`            |
| `Ready for Hire`                       | `hired`            |
| `Rejected` / `Declined`                | `rejected`         |

Empty or unrecognized step → default to `new`.

## Preserving the raw step

The raw `step` value is always preserved in the parser's JSON output and must be
stored in the candidate brief's `## Pipeline` section, e.g.

```text
- **2026-02-10**: Applied via LinkedIn — Step: Manager Request to Move Forward (HS)
```

This lets the user filter and query candidates by their exact Workday
disposition.
