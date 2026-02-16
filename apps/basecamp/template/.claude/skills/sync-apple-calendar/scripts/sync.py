#!/usr/bin/env python3
"""Sync Apple Calendar events to ~/.cache/fit/basecamp/apple_calendar/ as JSON.

Queries the macOS Calendar SQLite database for events in a sliding window
(past and future) and writes one JSON file per event.

Usage: python3 scripts/sync.py [--days N]

Options:
    --days N    How many days back to sync (default: 30)

Requires: macOS with Calendar app configured and Full Disk Access granted.
"""

import argparse
import json
import os
import subprocess
from datetime import datetime, timezone, timedelta

EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)
OUTDIR = os.path.expanduser("~/.cache/fit/basecamp/apple_calendar")

DB_PATHS = [
    os.path.expanduser(
        "~/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb"
    ),
    os.path.expanduser("~/Library/Calendars/Calendar.sqlitedb"),
]

STATUS_MAP = {
    0: "unknown",
    1: "pending",
    2: "accepted",
    3: "declined",
    4: "tentative",
    5: "delegated",
    6: "completed",
    7: "in-process",
}

ROLE_MAP = {0: "unknown", 1: "required", 2: "optional", 3: "chair"}


def find_db():
    db = next((p for p in DB_PATHS if os.path.exists(p)), None)
    if not db:
        print("Error: Apple Calendar database not found. Is Calendar configured?")
        exit(1)
    return db


def query(db, sql):
    result = subprocess.run(
        ["sqlite3", "-readonly", "-json", db, sql], capture_output=True, text=True
    )
    if result.returncode != 0:
        if "database is locked" in result.stderr:
            import time

            time.sleep(2)
            result = subprocess.run(
                ["sqlite3", "-readonly", "-json", db, sql],
                capture_output=True,
                text=True,
            )
        if result.returncode != 0:
            print(f"SQLite error: {result.stderr.strip()}")
            return []
    return json.loads(result.stdout) if result.stdout.strip() else []


def coredata_to_iso(ts, tz_name=None):
    """Convert Core Data timestamp to ISO 8601."""
    if ts is None:
        return None
    dt = EPOCH + timedelta(seconds=ts)
    if tz_name and tz_name != "_float":
        try:
            from zoneinfo import ZoneInfo

            dt = dt.astimezone(ZoneInfo(tz_name))
        except Exception:
            pass
    return dt.isoformat()


def main():
    parser = argparse.ArgumentParser(description="Sync Apple Calendar events.")
    parser.add_argument("--days", type=int, default=30,
                        help="How many days back to sync (default: 30)")
    args = parser.parse_args()

    db = find_db()
    os.makedirs(OUTDIR, exist_ok=True)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=args.days)
    end = now + timedelta(days=14)
    START_TS = (start - EPOCH).total_seconds()
    END_TS = (end - EPOCH).total_seconds()

    # Fetch events with a single query
    events = query(
        db,
        f"""
    SELECT
        ci.ROWID AS id,
        ci.summary,
        ci.start_date,
        ci.end_date,
        ci.start_tz,
        ci.end_tz,
        ci.all_day,
        ci.description,
        ci.has_attendees,
        ci.conference_url,
        loc.title AS location,
        cal.title AS calendar_name,
        org.address AS organizer_email,
        org.display_name AS organizer_name
    FROM CalendarItem ci
    LEFT JOIN Location loc ON loc.ROWID = ci.location_id
    LEFT JOIN Calendar cal ON cal.ROWID = ci.calendar_id
    LEFT JOIN Identity org ON org.ROWID = ci.organizer_id
    WHERE ci.start_date <= {END_TS}
        AND COALESCE(ci.end_date, ci.start_date) >= {START_TS}
        AND ci.summary IS NOT NULL
        AND ci.summary != ''
    ORDER BY ci.start_date ASC
    LIMIT 1000;
    """,
    )

    # Collect event IDs for batch attendee query
    event_ids = [str(ev["id"]) for ev in events]

    # Batch-fetch all attendees in one query (avoids N+1)
    attendees_by_event = {}
    if event_ids:
        id_list = ",".join(event_ids)
        attendees_raw = query(
            db,
            f"""
        SELECT
            p.owner_id,
            p.email,
            p.status,
            p.role,
            p.is_self,
            p.entity_type,
            i.display_name
        FROM Participant p
        LEFT JOIN Identity i ON i.ROWID = p.identity_id
        WHERE p.owner_id IN ({id_list})
            AND p.entity_type = 7;
        """,
        )
        for a in attendees_raw:
            oid = a["owner_id"]
            attendees_by_event.setdefault(oid, []).append(a)

    # Write event JSON files
    written_ids = set()
    for ev in events:
        eid = ev["id"]

        # Organizer — strip mailto: prefix from Identity.address
        org_email = ev.get("organizer_email") or None
        if org_email and org_email.startswith("mailto:"):
            org_email = org_email[7:]

        # Attendees
        attendees = []
        for a in attendees_by_event.get(eid, []):
            if not a.get("email"):
                continue
            attendees.append(
                {
                    "email": a["email"],
                    "name": (a.get("display_name") or "").strip() or None,
                    "status": STATUS_MAP.get(a.get("status"), "unknown"),
                    "role": ROLE_MAP.get(a.get("role"), "unknown"),
                    "self": bool(a.get("is_self")),
                }
            )

        is_all_day = bool(ev.get("all_day"))

        event_json = {
            "id": f"apple_cal_{eid}",
            "summary": ev["summary"],
            "start": {
                "dateTime": coredata_to_iso(ev["start_date"], ev.get("start_tz")),
                "timeZone": ev.get("start_tz")
                if ev.get("start_tz") != "_float"
                else None,
            },
            "end": {
                "dateTime": coredata_to_iso(
                    ev["end_date"] if ev["end_date"] else ev["start_date"],
                    ev.get("end_tz"),
                ),
                "timeZone": ev.get("end_tz")
                if ev.get("end_tz") != "_float"
                else None,
            },
            "allDay": is_all_day,
            "location": ev.get("location") or None,
            "description": ev.get("description") or None,
            "conferenceUrl": ev.get("conference_url") or None,
            "calendar": ev.get("calendar_name") or None,
            "organizer": {
                "email": org_email,
                "name": (ev.get("organizer_name") or "").strip() or None,
            }
            if org_email
            else None,
            "attendees": attendees if attendees else None,
        }

        filepath = os.path.join(OUTDIR, f"{eid}.json")
        with open(filepath, "w") as f:
            json.dump(event_json, f, indent=2)
        written_ids.add(f"{eid}.json")

    # Clean up events outside the window
    removed = 0
    for fname in os.listdir(OUTDIR):
        if fname.endswith(".json") and fname not in written_ids:
            os.remove(os.path.join(OUTDIR, fname))
            removed += 1

    print(f"Apple Calendar Sync Complete")
    print(f"Events synced: {len(written_ids)}")
    print(f"Time window: {start.date()} to {end.date()}")
    print(f"Files cleaned up: {removed} (outside window)")
    print(f"Output: {OUTDIR}")


if __name__ == "__main__":
    main()
