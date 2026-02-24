#!/usr/bin/env node
/**
 * Sync Apple Calendar events to ~/.cache/fit/basecamp/apple_calendar/ as JSON.
 *
 * Queries the macOS Calendar SQLite database for events in a sliding window
 * (past and future) and writes one JSON file per event.
 *
 * Usage: node scripts/sync.mjs [--days N]
 *
 * Options:
 *     --days N    How many days back to sync (default: 30)
 *
 * Requires: macOS with Calendar app configured and Full Disk Access granted.
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const OUTDIR = join(HOME, ".cache/fit/basecamp/apple_calendar");

/** Core Data epoch: 2001-01-01T00:00:00Z */
const EPOCH_MS = Date.UTC(2001, 0, 1);

const DB_PATHS = [
  join(HOME, "Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb"),
  join(HOME, "Library/Calendars/Calendar.sqlitedb"),
];

const STATUS_MAP = {
  0: "unknown",
  1: "pending",
  2: "accepted",
  3: "declined",
  4: "tentative",
  5: "delegated",
  6: "completed",
  7: "in-process",
};

const ROLE_MAP = {
  0: "unknown",
  1: "required",
  2: "optional",
  3: "chair",
};

/**
 * Find the Apple Calendar database.
 * @returns {string}
 */
function findDb() {
  const db = DB_PATHS.find((p) => existsSync(p));
  if (!db) {
    console.error("Error: Apple Calendar database not found. Is Calendar configured?");
    process.exit(1);
  }
  return db;
}

/**
 * Open the database in read-only mode with retry on lock.
 * @param {string} dbPath
 * @returns {import("node:sqlite").DatabaseSync}
 */
function openDb(dbPath) {
  try {
    return new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    if (err.message.includes("locked")) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      return new DatabaseSync(dbPath, { readOnly: true });
    }
    throw err;
  }
}

/**
 * Execute a read-only query and return results.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} sql
 * @returns {Array<Record<string, any>>}
 */
function query(db, sql) {
  try {
    return db.prepare(sql).all();
  } catch (err) {
    console.error(`SQLite error: ${err.message}`);
    return [];
  }
}

/**
 * Convert Core Data timestamp to ISO 8601.
 * @param {number | null} ts - Seconds since 2001-01-01
 * @param {string | null} tzName
 * @returns {string | null}
 */
function coredataToIso(ts, tzName) {
  if (ts == null) return null;
  const ms = EPOCH_MS + ts * 1000;
  const dt = new Date(ms);

  if (tzName && tzName !== "_float") {
    try {
      return dt.toLocaleString("sv-SE", { timeZone: tzName }).replace(" ", "T") +
        getUtcOffset(dt, tzName);
    } catch {
      // Fall through to UTC
    }
  }
  return dt.toISOString();
}

/**
 * Get UTC offset string for a timezone at a given instant.
 * @param {Date} dt
 * @param {string} tzName
 * @returns {string} e.g. "+02:00" or "-05:00"
 */
function getUtcOffset(dt, tzName) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzName,
      timeZoneName: "longOffset",
    }).formatToParts(dt);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart) {
      // "GMT+2" → "+02:00", "GMT-5:30" → "-05:30", "GMT" → "+00:00"
      const match = tzPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (match) {
        const sign = match[1];
        const hours = match[2].padStart(2, "0");
        const mins = (match[3] ?? "00").padStart(2, "0");
        return `${sign}${hours}:${mins}`;
      }
      return "+00:00"; // GMT with no offset
    }
  } catch {
    // Fallback
  }
  return "Z";
}

// --- Main ---

function main() {
  let daysBack = 30;
  const daysIdx = process.argv.indexOf("--days");
  if (daysIdx !== -1 && process.argv[daysIdx + 1]) {
    daysBack = parseInt(process.argv[daysIdx + 1], 10);
  }

  const dbPath = findDb();
  mkdirSync(OUTDIR, { recursive: true });

  const now = Date.now();
  const start = new Date(now - daysBack * 86400000);
  const end = new Date(now + 14 * 86400000);
  const startTs = (start.getTime() - EPOCH_MS) / 1000;
  const endTs = (end.getTime() - EPOCH_MS) / 1000;

  const db = openDb(dbPath);

  try {
    // Fetch events with a single query
    const events = query(db, `
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
      WHERE ci.start_date <= ${endTs}
        AND COALESCE(ci.end_date, ci.start_date) >= ${startTs}
        AND ci.summary IS NOT NULL
        AND ci.summary != ''
      ORDER BY ci.start_date ASC
      LIMIT 1000;
    `);

    // Collect event IDs for batch attendee query
    const eventIds = events.map((ev) => String(ev.id));

    // Batch-fetch all attendees in one query
    const attendeesByEvent = {};
    if (eventIds.length > 0) {
      const idList = eventIds.join(",");
      const attendeesRaw = query(db, `
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
        WHERE p.owner_id IN (${idList})
          AND p.entity_type = 7;
      `);
      for (const a of attendeesRaw) {
        attendeesByEvent[a.owner_id] ??= [];
        attendeesByEvent[a.owner_id].push(a);
      }
    }

    // Write event JSON files
    const writtenIds = new Set();
    for (const ev of events) {
      const eid = ev.id;

      // Organizer — strip mailto: prefix
      let orgEmail = ev.organizer_email ?? null;
      if (orgEmail?.startsWith("mailto:")) orgEmail = orgEmail.slice(7);

      // Attendees
      const attendees = [];
      for (const a of attendeesByEvent[eid] ?? []) {
        if (!a.email) continue;
        attendees.push({
          email: a.email,
          name: (a.display_name ?? "").trim() || null,
          status: STATUS_MAP[a.status] ?? "unknown",
          role: ROLE_MAP[a.role] ?? "unknown",
          self: Boolean(a.is_self),
        });
      }

      const isAllDay = Boolean(ev.all_day);

      const eventJson = {
        id: `apple_cal_${eid}`,
        summary: ev.summary,
        start: {
          dateTime: coredataToIso(ev.start_date, ev.start_tz),
          timeZone: ev.start_tz !== "_float" ? ev.start_tz : null,
        },
        end: {
          dateTime: coredataToIso(
            ev.end_date ?? ev.start_date,
            ev.end_tz,
          ),
          timeZone: ev.end_tz !== "_float" ? ev.end_tz : null,
        },
        allDay: isAllDay,
        location: ev.location || null,
        description: ev.description || null,
        conferenceUrl: ev.conference_url || null,
        calendar: ev.calendar_name || null,
        organizer: orgEmail
          ? { email: orgEmail, name: (ev.organizer_name ?? "").trim() || null }
          : null,
        attendees: attendees.length > 0 ? attendees : null,
      };

      const filename = `${eid}.json`;
      writeFileSync(join(OUTDIR, filename), JSON.stringify(eventJson, null, 2));
      writtenIds.add(filename);
    }

    // Clean up events outside the window
    let removed = 0;
    for (const fname of readdirSync(OUTDIR)) {
      if (fname.endsWith(".json") && !writtenIds.has(fname)) {
        unlinkSync(join(OUTDIR, fname));
        removed++;
      }
    }

    console.log("Apple Calendar Sync Complete");
    console.log(`Events synced: ${writtenIds.size}`);
    console.log(`Time window: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`);
    console.log(`Files cleaned up: ${removed} (outside window)`);
    console.log(`Output: ${OUTDIR}`);
  } finally {
    db.close();
  }
}

main();
