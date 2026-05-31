// Pure calendar arithmetic on explicit date inputs.
//
// Every `new Date(...)` here operates only on a value the caller passed (a ms
// timestamp, a `Date`, or an ISO string) — never the ambient wall clock, which
// lives behind `runtime.clock.now()`. That is why this module is allow-listed
// in `scripts/check-ambient-deps.allow.yml` for the same reason `runtime.js`
// is: it produces deterministic time values from its arguments rather than
// reaching for an ambient dependency. Consumers read "now" from
// `runtime.clock.now()` and pass the result here when they need a formatted or
// shifted calendar value.

/**
 * Normalise an input into a `Date`. Accepts a `Date`, a ms timestamp, or any
 * string `Date` understands (notably an ISO `YYYY-MM-DD` date).
 * @param {Date|number|string} input
 * @returns {Date}
 */
function toDate(input) {
  return input instanceof Date ? input : new Date(input);
}

/**
 * Format an input as an ISO calendar date (`YYYY-MM-DD`, UTC).
 * @param {Date|number|string} input
 * @returns {string}
 */
export function isoDate(input) {
  return toDate(input).toISOString().slice(0, 10);
}

/**
 * Compute the ISO 8601 year-week for an input. `year` is the ISO week-year
 * (not necessarily the calendar year for edge weeks).
 * @param {Date|number|string} input
 * @returns {{year: number, week: number}}
 */
export function isoWeek(input) {
  const date = toDate(input);
  // Anchor on Thursday of the week: ISO weeks belong to the year of their
  // Thursday.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/**
 * Format an input as `YYYY-Www` (e.g. `2026-W22`).
 * @param {Date|number|string} input
 * @returns {string}
 */
export function isoWeekString(input) {
  const { year, week } = isoWeek(input);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * Format an input as `YYYY-Mmm` (e.g. `2026-M05`, UTC month).
 * @param {Date|number|string} input
 * @returns {string}
 */
export function yearMonth(input) {
  const d = toDate(input);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-M${mm}`;
}

/**
 * Shift an input by `n` whole days (UTC) and return the ISO calendar date.
 * Negative `n` moves backward. The input is never mutated.
 * @param {Date|number|string} input
 * @param {number} n - Days to add (may be negative).
 * @returns {string}
 */
export function addDays(input, n) {
  const d = new Date(toDate(input).getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
