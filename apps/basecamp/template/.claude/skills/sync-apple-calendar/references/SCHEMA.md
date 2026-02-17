# Apple Calendar Database Schema

The Apple Calendar SQLite database uses Core Data. Key tables and their actual
column names (verified on macOS Sonoma+).

## CalendarItem (events and reminders)

| Column           | Type    | Notes                                                      |
| ---------------- | ------- | ---------------------------------------------------------- |
| `ROWID`          | INTEGER | Primary key                                                |
| `summary`        | TEXT    | Event title                                                |
| `start_date`     | REAL    | Core Data timestamp (seconds since 2001-01-01 UTC)         |
| `end_date`       | REAL    | Core Data timestamp (null for all-day events)              |
| `start_tz`       | TEXT    | IANA timezone (e.g., `Europe/Paris`), `_float` for all-day |
| `end_tz`         | TEXT    | IANA timezone, `_float` for all-day                        |
| `all_day`        | INTEGER | 1 = all-day event                                          |
| `location_id`    | INTEGER | FK → Location.ROWID                                        |
| `description`    | TEXT    | Event notes/body                                           |
| `organizer_id`   | INTEGER | FK → Identity.ROWID                                        |
| `calendar_id`    | INTEGER | FK → Calendar.ROWID                                        |
| `has_attendees`  | INTEGER | 1 = event has attendees                                    |
| `conference_url` | TEXT    | Video call URL (often null — check description too)        |
| `entity_type`    | INTEGER | 2 = calendar event                                         |

## Identity (organizer info)

| Column         | Type | Notes                                                         |
| -------------- | ---- | ------------------------------------------------------------- |
| `display_name` | TEXT | Full name (e.g., `"Chen, Sarah"`)                             |
| `address`      | TEXT | Email with `mailto:` prefix (e.g., `"mailto:sarah@acme.com"`) |
| `first_name`   | TEXT | Usually null — `display_name` is the reliable field           |
| `last_name`    | TEXT | Usually null — `display_name` is the reliable field           |

**IMPORTANT:** Identity does NOT have an `email` column. Use `address` and strip
the `mailto:` prefix. Use `display_name` for the name (not
`first_name`/`last_name`, which are typically null).

## Participant (attendees and organizer)

| Column        | Type    | Notes                                              |
| ------------- | ------- | -------------------------------------------------- |
| `ROWID`       | INTEGER | Primary key                                        |
| `entity_type` | INTEGER | 7 = attendee, 8 = organizer                        |
| `owner_id`    | INTEGER | FK → CalendarItem.ROWID                            |
| `identity_id` | INTEGER | FK → Identity.ROWID (for display_name lookup)      |
| `email`       | TEXT    | Email address (no `mailto:` prefix)                |
| `status`      | INTEGER | EKParticipantStatus (see mapping below)            |
| `role`        | INTEGER | 0 = unknown, 1 = required, 2 = optional, 3 = chair |
| `is_self`     | INTEGER | 1 = this is the calendar owner                     |

**IMPORTANT:** Participant does NOT have `display_name`, `first_name`, or
`last_name` columns. To get the attendee's name, JOIN with Identity via
`identity_id`. There is NO `Attendee` table — only use `Participant`.

### EKParticipantStatus mapping

| Value | Status     |
| ----- | ---------- |
| 0     | unknown    |
| 1     | pending    |
| 2     | accepted   |
| 3     | declined   |
| 4     | tentative  |
| 5     | delegated  |
| 6     | completed  |
| 7     | in-process |

## Calendar (calendar metadata)

| Column  | Type    | Notes         |
| ------- | ------- | ------------- |
| `ROWID` | INTEGER | Primary key   |
| `title` | TEXT    | Calendar name |

## Location

| Column  | Type    | Notes           |
| ------- | ------- | --------------- |
| `ROWID` | INTEGER | Primary key     |
| `title` | TEXT    | Location string |
