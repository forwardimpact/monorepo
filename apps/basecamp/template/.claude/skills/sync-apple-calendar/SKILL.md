---
name: sync-apple-calendar
description: Sync calendar events from the macOS Calendar app's local SQLite database into ~/.cache/fit/basecamp/apple_calendar/ as JSON files. Use on a schedule or when the user asks to sync their calendar. Requires macOS with Calendar app configured and Full Disk Access granted.
compatibility: Requires macOS with Apple Calendar configured and Full Disk Access granted to the terminal
---

# Sync Apple Calendar

Sync calendar events from the macOS Calendar app's local SQLite database into
`~/.cache/fit/basecamp/apple_calendar/` as JSON files. This is an automated data
pipeline skill — it ingests raw calendar data that other skills (like
`extract-entities` and `meeting-prep`) consume downstream.

## Trigger

Run this skill on a schedule (every 5 minutes) or when the user asks to sync
their calendar.

## Prerequisites

- macOS with the built-in Calendar app configured
- Full Disk Access granted to the terminal (System Settings → Privacy & Security
  → Full Disk Access)

## Inputs

- `~/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb` —
  Apple Calendar SQLite database (Sonoma+/macOS 14+)
- `~/Library/Calendars/Calendar.sqlitedb` — fallback path for older macOS

## Outputs

- `~/.cache/fit/basecamp/apple_calendar/{event_id}.json` — one JSON file per
  event (14-day sliding window)

---

## Implementation

Run the sync as a single Python script. This avoids N+1 sqlite3 invocations (one
per event for attendees) and handles all data transformation in one pass:

    python3 scripts/sync.py [--days N]

- `--days N` — how many days back to sync (default: 30)

The script:

1. Finds the Calendar database (Sonoma+ path first, then fallback)
2. Queries all events in a sliding window (`--days` past / 14 days future) with
   a single SQL query
3. Batch-fetches all attendees for those events in one query
4. Writes one JSON file per event to `~/.cache/fit/basecamp/apple_calendar/`
5. Cleans up JSON files for events now outside the window
6. Reports summary (events synced, files cleaned up)

## Database Schema

See [references/SCHEMA.md](references/SCHEMA.md) for the complete Apple Calendar
SQLite schema including table structures, column names, and important caveats
(e.g., Identity uses `address` not `email`, Participant has no `display_name`).

## Output Format

Each `{event_id}.json` file:

```json
{
  "id": "apple_cal_123",
  "summary": "Meeting with Sarah Chen",
  "start": { "dateTime": "2025-02-12T15:00:00+01:00", "timeZone": "Europe/Paris" },
  "end": { "dateTime": "2025-02-12T16:00:00+01:00", "timeZone": "Europe/Paris" },
  "allDay": false,
  "location": "Zoom",
  "description": "Discuss Q2 roadmap",
  "conferenceUrl": null,
  "calendar": "Calendar",
  "organizer": { "email": "sarah@acme.com", "name": "Chen, Sarah" },
  "attendees": [
    {
      "email": "sarah@acme.com",
      "name": "Chen, Sarah",
      "status": "accepted",
      "role": "required",
      "self": false
    }
  ]
}
```

## Error Handling

- Database not found → Calendar not configured, report and stop
- Permission denied → Full Disk Access not granted, report and stop
- Database locked → wait 2 seconds, retry once
- Skip events with no summary (likely cancelled or placeholder)

## Constraints

- Open database read-only (`-readonly`)
- This sync is stateless — always queries the current sliding window
- All-day events may have null end times — use start date as end date
- All-day events have timezone `_float` — omit timezone from output
- Output format matches Google Calendar event format for downstream consistency
