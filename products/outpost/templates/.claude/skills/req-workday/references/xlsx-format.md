# Workday Export Format

Reference for `req-workday`. The export format varies between Workday versions.
The parse script handles both. It maps columns by header and detects the header
row dynamically.

## Sheet 1 — requisition metadata

### Old format (key/value)

| Row | Field                 | Example                                |
| --- | --------------------- | -------------------------------------- |
| 1   | Title header          | `4951493 Principal Software Engineer…` |
| 2   | Recruiting Start Date | `02/10/2026`                           |
| 3   | Target Hire Date      | `02/10/2026`                           |
| 4   | Primary Location      | `USA - NY - Headquarters`              |
| 5   | Hiring Manager Title  | `Hiring Manager`                       |
| 6   | Hiring Manager        | Name                                   |
| 7   | Recruiter Title       | `Recruiter`                            |
| 8   | Recruiter             | Name                                   |

### New format (stage-count summary)

| Row | Field             | Example                                |
| --- | ----------------- | -------------------------------------- |
| 1   | Title header      | `4951493 Principal Software Engineer…` |
| 2   | Active Candidates | `74 of 74`                             |
| 3   | Active Referrals  | `3 of 3`                               |
| 4   | Active Internal   | `4 of 4`                               |
| 7+  | Stage counts      | `56 → Considered`                      |

The new format does not carry hiring manager, recruiter, or location.

## Candidates sheet

The parser detects the format automatically:

- **Old format:** 3+ sheets; candidates on the "Candidates" sheet or Sheet3;
  header at row 3 (index 2); two "Job Application" columns.
- **New format:** 2 sheets; candidates on Sheet2; header at row 8 (index 7);
  single "Job Application" column.

Column mapping is header-driven. The parser reads the header row and maps
columns by name. It automatically handles columns that vary between exports
("Jobs Applied to", "Referred by", "Convenience Task").

## Name annotations

Names may include parenthetical annotations:

- `(Prior Worker)` → Internal/External = `External (Prior Worker)`.
- `(Internal)` → Internal/External = `Internal`.
- No annotation, source contains "Internal" → `Internal`.
- Otherwise → `External`.

Strip the annotation from the directory name and the brief heading.
