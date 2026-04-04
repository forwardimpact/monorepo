#!/usr/bin/env bun
/**
 * Query synced Apple Calendar events by date/time window.
 *
 * Reads JSON event files from ~/.cache/fit/basecamp/apple_calendar/ and filters
 * them by date range, time window, or upcoming interval. Designed to eliminate
 * the need for agents to write bespoke calendar-parsing scripts.
 *
 * Usage:
 *   node scripts/query.mjs --today                  Today's events
 *   node scripts/query.mjs --tomorrow               Tomorrow's events
 *   node scripts/query.mjs --upcoming 2h             Events in the next 2 hours
 *   node scripts/query.mjs --date 2026-03-09        Events on a specific date
 *   node scripts/query.mjs --range 2026-03-09 2026-03-11  Events in date range
 *   node scripts/query.mjs --today --tomorrow       Combine multiple filters
 *   node scripts/query.mjs --json                   Output as JSON (default: table)
 *   node scripts/query.mjs --include-all-day        Include all-day events
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const CAL_DIR = join(HOME, ".cache/fit/basecamp/apple_calendar");

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`query — filter synced calendar events by date/time

Usage:
  node scripts/query.mjs [options]

Time filters (combinable):
  --today                 Events starting today
  --tomorrow              Events starting tomorrow
  --upcoming <interval>   Events starting within interval (e.g., 2h, 30m, 1d)
  --date <YYYY-MM-DD>     Events on a specific date
  --range <start> <end>   Events between two dates (inclusive)

Output options:
  --json                  Output as JSON array (default: formatted table)
  --include-all-day       Include all-day events (excluded by default)
  --no-attendees          Omit attendee names from output

Defaults to --today if no time filter is specified.`);
  process.exit(0);
}

// --- Parse arguments ---

const args = process.argv.slice(2);
const flags = {
  today: args.includes("--today"),
  tomorrow: args.includes("--tomorrow"),
  json: args.includes("--json"),
  includeAllDay: args.includes("--include-all-day"),
  noAttendees: args.includes("--no-attendees"),
  upcoming: null,
  date: null,
  rangeStart: null,
  rangeEnd: null,
};

const upcomingIdx = args.indexOf("--upcoming");
if (upcomingIdx !== -1 && args[upcomingIdx + 1]) {
  flags.upcoming = parseInterval(args[upcomingIdx + 1]);
}

const dateIdx = args.indexOf("--date");
if (dateIdx !== -1 && args[dateIdx + 1]) {
  flags.date = args[dateIdx + 1];
}

const rangeIdx = args.indexOf("--range");
if (rangeIdx !== -1 && args[rangeIdx + 1] && args[rangeIdx + 2]) {
  flags.rangeStart = args[rangeIdx + 1];
  flags.rangeEnd = args[rangeIdx + 2];
}

// Default to --today if no time filter specified
if (
  !flags.today &&
  !flags.tomorrow &&
  !flags.upcoming &&
  !flags.date &&
  !flags.rangeStart
) {
  flags.today = true;
}

/**
 * Parse an interval string like "2h", "30m", "1d" into milliseconds.
 */
function parseInterval(str) {
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored pattern with no nested quantifiers; parses trusted CLI input
  const match = str.match(/^(\d+(?:\.\d+)?)\s*(m|min|h|hr|d)$/i);
  if (!match) {
    console.error(`Invalid interval: ${str}. Use e.g., 2h, 30m, 1d`);
    process.exit(1);
  }
  const n = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "m" || unit === "min") return n * 60 * 1000;
  if (unit === "h" || unit === "hr") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return n * 60 * 60 * 1000; // default hours
}

/**
 * Get the start of a day in local time.
 */
function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of a day in local time.
 */
function dayEnd(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// --- Load events ---

let files;
try {
  files = readdirSync(CAL_DIR).filter((f) => f.endsWith(".json"));
} catch {
  console.error(
    `Calendar directory not found: ${CAL_DIR}\nRun sync first: node scripts/sync.mjs`,
  );
  process.exit(1);
}

const events = [];
for (const f of files) {
  try {
    const ev = JSON.parse(readFileSync(join(CAL_DIR, f), "utf8"));

    // Skip all-day events unless requested
    if (ev.allDay && !flags.includeAllDay) continue;

    const startStr = ev.start?.dateTime || ev.start?.date;
    if (!startStr) continue;

    const startDt = new Date(startStr);
    if (isNaN(startDt.getTime())) continue;

    const endStr = ev.end?.dateTime || ev.end?.date;
    const endDt = endStr ? new Date(endStr) : startDt;

    events.push({
      summary: ev.summary || "(untitled)",
      start: startDt,
      end: endDt,
      startIso: startStr,
      endIso: endStr || startStr,
      timeZone: ev.start?.timeZone || null,
      allDay: Boolean(ev.allDay),
      location: ev.location || null,
      conferenceUrl: ev.conferenceUrl || null,
      calendar: ev.calendar || null,
      organizer: ev.organizer || null,
      attendees: (ev.attendees || [])
        .filter((a) => !a.self)
        .map((a) => ({ name: a.name || null, email: a.email })),
    });
  } catch {
    // Skip malformed files
  }
}

events.sort((a, b) => a.start - b.start);

// --- Filter events ---

const now = new Date();
const today = dayStart(now);
const todayE = dayEnd(now);
const tomorrow = dayStart(new Date(now.getTime() + 86400000));
const tomorrowE = dayEnd(new Date(now.getTime() + 86400000));

function inRange(dt, lo, hi) {
  return dt >= lo && dt <= hi;
}

function matchesFilters(ev, f, ref) {
  if (f.today && inRange(ev.start, ref.today, ref.todayE)) return true;
  if (f.tomorrow && inRange(ev.start, ref.tomorrow, ref.tomorrowE)) return true;
  if (f.upcoming) {
    const cutoff = new Date(ref.now.getTime() + f.upcoming);
    if (inRange(ev.start, ref.now, cutoff)) return true;
  }
  if (f.date) {
    if (
      inRange(
        ev.start,
        dayStart(f.date + "T00:00:00"),
        dayEnd(f.date + "T00:00:00"),
      )
    )
      return true;
  }
  if (f.rangeStart && f.rangeEnd) {
    if (
      inRange(
        ev.start,
        dayStart(f.rangeStart + "T00:00:00"),
        dayEnd(f.rangeEnd + "T00:00:00"),
      )
    )
      return true;
  }
  return false;
}

const ref = { now, today, todayE, tomorrow, tomorrowE };
const filtered = events.filter((ev) => matchesFilters(ev, flags, ref));

// --- Output ---

if (flags.json) {
  const output = filtered.map((ev) => {
    const obj = {
      summary: ev.summary,
      start: ev.startIso,
      end: ev.endIso,
      timeZone: ev.timeZone,
      allDay: ev.allDay,
      location: ev.location,
      conferenceUrl: ev.conferenceUrl,
      calendar: ev.calendar,
      organizer: ev.organizer,
    };
    if (!flags.noAttendees) {
      obj.attendees = ev.attendees;
    }
    return obj;
  });
  console.log(JSON.stringify(output, null, 2));
} else {
  // Formatted table output
  if (filtered.length === 0) {
    console.log("No events found.");
    process.exit(0);
  }

  // Group by date
  const byDate = new Map();
  for (const ev of filtered) {
    const dateKey = ev.start.toLocaleDateString("sv-SE"); // YYYY-MM-DD
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey).push(ev);
  }

  for (const [date, dayEvents] of byDate) {
    const isToday = date === now.toLocaleDateString("sv-SE");
    const isTomorrow =
      date === new Date(now.getTime() + 86400000).toLocaleDateString("sv-SE");
    const label = isToday ? " (today)" : isTomorrow ? " (tomorrow)" : "";
    console.log(`\n=== ${date}${label} ===`);

    for (const ev of dayEvents) {
      const tz =
        ev.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const time = ev.allDay
        ? "all-day"
        : ev.start.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: tz,
          });
      const endTime = ev.allDay
        ? ""
        : "-" +
          ev.end.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: tz,
          });

      // Minutes until start (only for future events)
      let countdown = "";
      if (ev.start > now && flags.upcoming) {
        const mins = Math.round((ev.start - now) / 60000);
        countdown = ` [in ${mins}min]`;
      }

      const parts = [`${time}${endTime}`, ev.summary];

      if (!flags.noAttendees && ev.attendees.length > 0) {
        const names = ev.attendees
          .slice(0, 8)
          .map((a) => a.name || a.email)
          .join(", ");
        parts.push(names);
      }

      console.log(parts.join(" | ") + countdown);
    }
  }

  console.log(`\n${filtered.length} event(s) | now: ${now.toISOString()}`);
}
